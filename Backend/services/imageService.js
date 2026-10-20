const fs = require("fs");
const path = require("path");

/**
 * AGRI-SWAP Decoupled Vision Client
 *
 * Forwards image inference requests to a dedicated Python vision microservice
 * running ResNet50. This completely isolates heavy TensorFlow memory (>350 MB)
 * from the 512 MB Render backend instance, preventing OOM crashes.
 */

const DEFAULT_LOCAL_VISION_URL = "http://127.0.0.1:5001";
const DEFAULT_TIMEOUT_MS = 35000; // 35s allows for cloud cold-boot spinup on Render free tier

function getInferenceUrl() {
    const rawUrl = process.env.VISION_INFERENCE_URL;
    if (rawUrl && rawUrl.trim()) {
        return rawUrl.trim().replace(/\/+$/, "");
    }
    // In local development, fall back to localhost vision service
    if (process.env.NODE_ENV !== "production") {
        return DEFAULT_LOCAL_VISION_URL;
    }
    return null;
}

function getTimeoutMs() {
    const raw = process.env.VISION_TIMEOUT_MS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Predicts food from an uploaded image file by forwarding it to the vision service.
 * @param {string} imagePath - Absolute path to temporary uploaded file on disk.
 * @returns {Promise<object>} Prediction outcome or friendly error descriptor.
 */
async function predictFoodImage(imagePath) {
    const inferenceUrl = getInferenceUrl();

    if (!inferenceUrl) {
        return {
            success: false,
            status: "service_not_configured",
            message: "Vision inference service is not configured. Please set the VISION_INFERENCE_URL environment variable or select your food manually in Option B.",
            error: "VISION_INFERENCE_URL environment variable is not defined."
        };
    }

    if (!fs.existsSync(imagePath)) {
        return {
            success: false,
            status: "invalid_file",
            message: "Uploaded image file could not be found on server disk.",
            error: "File not found: " + imagePath
        };
    }

    const timeoutMs = getTimeoutMs();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const fileBuffer = fs.readFileSync(imagePath);
        const fileName = path.basename(imagePath);
        const fileExt = path.extname(imagePath).toLowerCase();
        const mimeType = fileExt === ".png" ? "image/png" : (fileExt === ".webp" ? "image/webp" : "image/jpeg");

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
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (e) {
            return {
                success: false,
                status: "invalid_response",
                message: "Vision service returned a non-JSON response. Please try again.",
                error: responseText.slice(0, 200)
            };
        }

        if (!response.ok) {
            return {
                success: false,
                status: parsed.status || "inference_failed",
                message: parsed.message || `Vision service error (HTTP ${response.status}). Please try another image.`,
                error: parsed.error || `HTTP ${response.status}`
            };
        }

        return parsed;

    } catch (err) {
        clearTimeout(timeoutId);

        const isTimeout = err.name === "AbortError" || err.message?.includes("aborted") || err.code === "UND_ERR_CONNECT_TIMEOUT";
        if (isTimeout) {
            return {
                success: false,
                status: "inference_timeout",
                message: `Image recognition timed out after ${Math.round(timeoutMs / 1000)}s. The vision service may still be waking up — please try again in a few seconds, or select your food in Option B.`,
                error: `Inference timeout (${timeoutMs}ms)`
            };
        }

        const isConnectionError = err.code === "ECONNREFUSED" || err.message?.includes("fetch failed") || err.code === "ENOTFOUND";
        if (isConnectionError) {
            return {
                success: false,
                status: "inference_unavailable",
                message: "The dedicated image recognition service is currently waking up or unreachable. Please try again in 20-30 seconds, or select your food manually in Option B.",
                error: err.message
            };
        }

        return {
            success: false,
            status: "inference_error",
            message: "An unexpected error occurred while communicating with the image recognition service.",
            error: err.message
        };
    }
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
 */
async function checkVisionHealth() {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
        return { online: false, reason: "VISION_INFERENCE_URL is not set" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
        const res = await fetch(`${inferenceUrl}/health`, {
            method: "GET",
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return { online: true, ...data };
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
