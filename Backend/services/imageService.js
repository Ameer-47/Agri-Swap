const fs = require("fs");
const path = require("path");
const dns = require("dns");

// Optimize DNS lookup to prioritize IPv4 over synthetic IPv6 / NAT64 prefixes
if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
}

/**
 * AGRI-SWAP Decoupled Vision Client
 *
 * Forwards image inference requests to a dedicated Python vision microservice
 * running ResNet50. This completely isolates heavy TensorFlow memory (>350 MB)
 * from the 512 MB Render backend instance, preventing OOM crashes.
 */

const DEFAULT_LOCAL_VISION_URL = "http://127.0.0.1:5001";
const DEFAULT_PRODUCTION_VISION_URL = "https://agri-swap-vision.onrender.com";
const DEFAULT_TIMEOUT_MS = 35000; // 35s allows for cloud cold-boot spinup on Render free tier
const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

/**
 * Normalizes and sanitizes vision service URL.
 * Automatically removes trailing slashes and any appended '/predict' or '/predict/'
 * so base URL resolution (/predict, /health) works regardless of how the URL is entered.
 */
function normalizeVisionUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    let url = rawUrl.trim();
    if (!url) return null;
    // Strip trailing slashes
    url = url.replace(/\/+$/, "");
    // If the endpoint path /predict was included in the env var, strip it to get the base URL
    url = url.replace(/\/predict\/?$/i, "");
    url = url.replace(/\/+$/, "");
    return url || null;
}

function getInferenceUrl() {
    // 1. Check primary environment variable and common alias names
    const rawUrl = process.env.VISION_INFERENCE_URL ||
                   process.env.VISION_URL ||
                   process.env.VISION_SERVICE_URL ||
                   process.env.VISION_ENDPOINT ||
                   process.env.VISION_INFERENCE_ENDPOINT ||
                   process.env.IMAGE_INFERENCE_URL ||
                   process.env.IMAGE_SERVICE_URL;

    const normalized = normalizeVisionUrl(rawUrl);
    if (normalized) {
        return normalized;
    }

    // 2. In production, fall back to known deployed vision microservice if env var is missing or un-synced
    if (process.env.NODE_ENV === "production") {
        return DEFAULT_PRODUCTION_VISION_URL;
    }

    // 3. In local development, fall back to localhost vision service
    return DEFAULT_LOCAL_VISION_URL;
}

function getTimeoutMs() {
    const raw = process.env.VISION_TIMEOUT_MS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Safely parses response text as JSON, inspecting Content-Type and format first.
 */
function parseResponseSafely(responseText, response) {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const isJsonHeader = contentType.includes("application/json");
    const trimmed = (responseText || "").trim();
    const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");

    if (isJsonHeader || looksLikeJson) {
        try {
            const data = JSON.parse(responseText);
            return { isJson: true, data };
        } catch {
            // Malformed JSON despite header
        }
    }
    return { isJson: false, rawText: responseText };
}

/**
 * Executes a single HTTP POST inference attempt with safety checks.
 */
async function postInferenceAttempt(fileBuffer, fileName, mimeType, inferenceUrl, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const blob = new Blob([fileBuffer], { type: mimeType });
        const formData = new FormData();
        formData.append("image", blob, fileName);

        const targetEndpoint = `${inferenceUrl}/predict`;
        const response = await fetch(targetEndpoint, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();

        // 1. Check for transient gateway/proxy errors (e.g., Render container spinning up)
        if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
            return {
                success: false,
                retryable: true,
                status: "service_waking",
                httpStatus: response.status,
                message: "The food image recognition service is currently waking up on cloud servers. Please try again in a few moments, or choose your food in Option B.",
                error: `HTTP ${response.status} (${response.statusText || 'Gateway Error'})`
            };
        }

        // 2. Safe parsing of response body
        const parsed = parseResponseSafely(responseText, response);

        if (parsed.isJson) {
            if (!response.ok) {
                return {
                    success: false,
                    retryable: false,
                    status: parsed.data.status || "inference_failed",
                    httpStatus: response.status,
                    message: parsed.data.message || `Vision service error (HTTP ${response.status}). Please try another image.`,
                    error: parsed.data.error || `HTTP ${response.status}`
                };
            }
            const resultData = { ...parsed.data };
            if (resultData.status === "not_food" || resultData.rejectionReason === "not_food") {
                resultData.status = "not_food";
                resultData.rejectionReason = "not_food";
                resultData.isValidProduce = false;
                resultData.isSupportedProduce = false;
                resultData.isConfident = false;
                resultData.food = null;
                resultData.confidence = null;
                resultData.topCandidates = [];
                resultData.message = resultData.message || "Non-Food Image Detected — Please upload a fruit or vegetable image.";
            } else if (resultData.status === "unknown_produce" || resultData.rejectionReason === "unknown_produce") {
                resultData.topCandidates = [];
            } else if (Number.isFinite(Number(resultData.confidence)) && Number(resultData.confidence) < 0.70) {
                resultData.isConfident = false;
            }
            return {
                success: true,
                ...resultData
            };
        }

        // 3. Upstream returned non-JSON (e.g. HTML proxy error page)
        const isServerErr = response.status >= 500;
        return {
            success: false,
            retryable: isServerErr,
            status: isServerErr ? "service_waking" : "invalid_response",
            httpStatus: isServerErr ? response.status : 503,
            message: "The image recognition service is currently waking up or unavailable. Please try again shortly or select your food from Option B.",
            error: `Non-JSON response (HTTP ${response.status})`
        };

    } catch (err) {
        clearTimeout(timeoutId);

        const isTimeout = err.name === "AbortError" ||
                          err.message?.includes("aborted") ||
                          err.code === "UND_ERR_CONNECT_TIMEOUT" ||
                          err.cause?.code === "UND_ERR_CONNECT_TIMEOUT";

        if (isTimeout) {
            return {
                success: false,
                retryable: true,
                status: "inference_timeout",
                httpStatus: 504,
                message: `Image recognition timed out after ${Math.round(timeoutMs / 1000)}s. The vision service may still be waking up — please try again in a few seconds, or select your food in Option B.`,
                error: `Inference timeout (${timeoutMs}ms)`
            };
        }

        const isConnectionError = err.code === "ECONNREFUSED" ||
                                  err.code === "ECONNRESET" ||
                                  err.code === "ENOTFOUND" ||
                                  err.message?.includes("fetch failed");

        if (isConnectionError) {
            return {
                success: false,
                retryable: true,
                status: "inference_unavailable",
                httpStatus: 503,
                message: "The dedicated image recognition service is currently waking up or unreachable. Please try again in 15-20 seconds, or select your food manually in Option B.",
                error: err.message || (err.cause && err.cause.message)
            };
        }

        return {
            success: false,
            retryable: false,
            status: "inference_error",
            httpStatus: 500,
            message: "An unexpected error occurred while communicating with the image recognition service.",
            error: err.message
        };
    }
}

/**
 * Predicts food from an uploaded image file by forwarding it to the vision service.
 * Includes bounded single-shot retry for transient cloud container wake-ups.
 * @param {string} imagePath - Absolute path to temporary uploaded file on disk.
 * @returns {Promise<object>} Prediction outcome or friendly error descriptor.
 */
async function predictFoodImage(imagePath) {
    const inferenceUrl = getInferenceUrl();

    if (!inferenceUrl) {
        return {
            success: false,
            status: "service_not_configured",
            httpStatus: 503,
            message: "Vision inference service is not configured. Please set the VISION_INFERENCE_URL environment variable or select your food manually in Option B.",
            error: "VISION_INFERENCE_URL environment variable is not defined."
        };
    }

    if (!fs.existsSync(imagePath)) {
        return {
            success: false,
            status: "invalid_file",
            httpStatus: 400,
            message: "Uploaded image file could not be found on server disk.",
            error: "File not found: " + imagePath
        };
    }

    const fileBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const fileExt = path.extname(imagePath).toLowerCase();
    const mimeType = fileExt === ".png" ? "image/png" : (fileExt === ".webp" ? "image/webp" : "image/jpeg");
    const timeoutMs = getTimeoutMs();

    // Attempt 1: Initial prediction
    const attempt1 = await postInferenceAttempt(fileBuffer, fileName, mimeType, inferenceUrl, timeoutMs);
    if (attempt1.success) {
        return attempt1;
    }

    // Bounded retry: exactly 1 retry for transient/waking errors after a short backoff (2.5s)
    if (attempt1.retryable) {
        console.warn(`[Vision Service] Inference attempt 1 failed (${attempt1.status}: ${attempt1.error}). Retrying once after 2500ms backoff...`);
        await new Promise((resolve) => setTimeout(resolve, 2500));

        // Attempt 2: Bounded 1-shot retry
        const attempt2 = await postInferenceAttempt(fileBuffer, fileName, mimeType, inferenceUrl, timeoutMs);
        if (attempt2.success) {
            console.log("[Vision Service] Inference retry attempt 2 succeeded.");
            return attempt2;
        }
        console.warn(`[Vision Service] Inference retry attempt 2 failed (${attempt2.status}: ${attempt2.error}). Returning safe error.`);
        return attempt2;
    }

    // Non-retryable error (e.g. invalid file, 400 bad request) returned immediately
    return attempt1;
}

/**
 * Returns current configuration status for health checks.
 */
function getVisionStatus() {
    const inferenceUrl = getInferenceUrl();
    return {
        mode: "microservice",
        configured: !!inferenceUrl,
        inferenceUrl: inferenceUrl ? inferenceUrl.replace(/\/\/[^@]*@/, "//***@") : "not_configured",
        timeoutMs: getTimeoutMs()
    };
}

/**
 * Probes the health of the remote vision microservice with a short timeout.
 * Note: A healthy probe does not guarantee immediate inference availability if
 * the container is still finishing internal cold-start initialization.
 */
async function checkVisionHealth() {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
        return { online: false, reason: "VISION_INFERENCE_URL is not set" };
    }

    const timeoutMs = Math.min(getTimeoutMs(), 15000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${inferenceUrl}/health`, {
            method: "GET",
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
                online: true,
                ...data,
                inferenceReadiness: "Note: Cold-start container wake-up may take up to 20s on first inference request."
            };
        }
        return { online: false, status: res.status };
    } catch (err) {
        clearTimeout(timeout);
        return { online: false, error: err.message };
    }
}

// Keep startVisionWorker as a no-op placeholder for any backwards compatibility
function startVisionWorker() {
    // Intentionally no-op: persistent worker in main process is disabled to protect 512 MB RAM
}

module.exports = {
    predictFoodImage,
    getVisionStatus,
    checkVisionHealth,
    startVisionWorker
};

