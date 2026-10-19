const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let workerProcess = null;
let isReady = false;
let isStarting = false;
let reqCounter = 1;
const pendingRequests = new Map();
let lineBuffer = "";

const projectRoot = path.join(__dirname, "../..");
const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

function startVisionWorker() {
    if (workerProcess || isStarting) return;
    isStarting = true;
    isReady = false;

    console.log("🌱 [AGRI-SWAP] Initializing persistent ResNet50 Food Vision worker...");

    try {
        workerProcess = spawn(pythonCmd, [
            "-u",
            "-m",
            "ML.image_recognition.food_vision_service"
        ], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONPATH: projectRoot,
                PYTHONIOENCODING: "utf-8"
            }
        });

        workerProcess.stdout.on("data", (chunk) => {
            lineBuffer += chunk.toString("utf-8");
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop(); // keep partial remainder

            for (const rawLine of lines) {
                const trimmed = rawLine.trim();
                if (!trimmed) continue;

                // Extract valid JSON substring safely even if C++ library logs precede or follow
                const jsonStart = trimmed.indexOf("{");
                const jsonEnd = trimmed.lastIndexOf("}");
                if (jsonStart === -1 || jsonEnd <= jsonStart) continue;

                try {
                    const msg = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
                    if (msg.status === "ready") {
                        isReady = true;
                        isStarting = false;
                        console.log(`🌱 [AGRI-SWAP] ResNet50 Food Vision worker is READY (${msg.classesCount} produce classes in memory).`);
                    } else if (msg.status === "error") {
                        console.warn("⚠️ [WARN] Vision worker error:", msg.error);
                        isStarting = false;
                    } else if (msg.id && pendingRequests.has(msg.id)) {
                        const { resolve, reject, timer } = pendingRequests.get(msg.id);
                        clearTimeout(timer);
                        pendingRequests.delete(msg.id);
                        if (msg.success) {
                            resolve(msg);
                        } else {
                            reject(new Error(msg.error || "Image prediction failed"));
                        }
                    }
                } catch (e) {
                    // Non-JSON debug output
                }
            }
        });

        workerProcess.stderr.on("data", (d) => {
            const errStr = d.toString("utf-8");
            // Suppress non-fatal TF oneDNN notices
            if (!errStr.includes("oneDNN") && !errStr.includes("cpu_feature_guard") && !errStr.includes("StreamExecutor")) {
                // real warning or info
            }
        });

        workerProcess.on("error", (err) => {
            console.error("⚠️ [ERROR] Vision worker spawn failed:", err.message);
            isReady = false;
            isStarting = false;
            workerProcess = null;
        });

        workerProcess.on("close", (code) => {
            console.warn(`⚠️ [WARN] Vision worker exited with code ${code}. Cleaning up.`);
            isReady = false;
            isStarting = false;
            workerProcess = null;

            // Reject all in-flight pending requests
            for (const [id, req] of pendingRequests.entries()) {
                clearTimeout(req.timer);
                req.reject(new Error("Vision worker process terminated unexpectedly."));
            }
            pendingRequests.clear();

            // Auto-restart persistent worker so subsequent requests don't fall back to slow CLI
            setTimeout(() => {
                if (!workerProcess && !isStarting) {
                    console.log("🌱 [AGRI-SWAP] Auto-restarting ResNet50 Food Vision worker...");
                    startVisionWorker();
                }
            }, 2000);
        });

    } catch (err) {
        console.error("⚠️ [ERROR] Could not start vision worker:", err.message);
        isStarting = false;
    }
}

// Start worker immediately on module load so model weights are warm when user reaches the page
startVisionWorker();

/**
 * Predicts food from image path using persistent in-memory ResNet50 model.
 * Falls back to standalone CLI if persistent worker is unavailable.
 */
async function predictFoodImage(imagePath) {
    // If worker process is not alive and not starting, kick off persistent worker now
    if (!workerProcess && !isStarting) {
        startVisionWorker();
    }

    // If worker is currently starting up, wait up to 40s for initial cold boot
    if (!isReady && isStarting) {
        const startWait = Date.now();
        while (!isReady && isStarting && (Date.now() - startWait < 40000)) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    // Preferred path: Persistent in-memory ResNet50 worker (< 0.5s inference)
    if (isReady && workerProcess && workerProcess.stdin.writable) {
        return new Promise((resolve, reject) => {
            const id = `req_${reqCounter++}_${Date.now()}`;
            const timer = setTimeout(() => {
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject(new Error("Food identification timed out after 15 seconds."));
                }
            }, 15000);

            pendingRequests.set(id, { resolve, reject, timer });

            try {
                workerProcess.stdin.write(JSON.stringify({ id, imagePath }) + "\n");
            } catch (err) {
                clearTimeout(timer);
                pendingRequests.delete(id);
                reject(err);
            }
        });
    }

    // Fallback: Standalone execution if persistent daemon is not running
    console.log("ℹ️ [INFO] Running fallback standalone prediction for:", imagePath);
    return new Promise((resolve, reject) => {
        const child = spawn(pythonCmd, [
            "-m",
            "ML.image_recognition.predict_food",
            imagePath
        ], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONPATH: projectRoot
            }
        });

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (d) => { output += d.toString(); });
        child.stderr.on("data", (d) => { errorOutput += d.toString(); });

        child.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(errorOutput || `Python exited with code ${code}`));
            }
            try {
                const parsed = JSON.parse(output.trim());
                resolve({
                    success: true,
                    status: parsed.status,
                    isValidProduce: parsed.isValidProduce,
                    isSupportedProduce: parsed.isSupportedProduce,
                    rejectionReason: parsed.rejectionReason,
                    message: parsed.message,
                    food: parsed.food,
                    confidence: parsed.confidence,
                    isConfident: parsed.isConfident !== undefined ? parsed.isConfident : (parsed.confidence >= 0.70),
                    topCandidates: parsed.topCandidates || [],
                    fallback: true
                });
            } catch (e) {
                reject(new Error("Invalid response from prediction script: " + output));
            }
        });

        child.on("error", reject);
    });
}

function getVisionStatus() {
    return {
        ready: isReady,
        starting: isStarting,
        workerActive: !!workerProcess
    };
}

module.exports = {
    predictFoodImage,
    getVisionStatus,
    startVisionWorker
};

