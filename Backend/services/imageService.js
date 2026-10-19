const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let workerProcess = null;
let isReady = false;
let isStarting = false;
let reqCounter = 1;
const pendingRequests = new Map();
let lineBuffer = "";

const restartTimestamps = [];
let autoRestartDisabled = false;
const MAX_RESTARTS_IN_WINDOW = 3;
const RESTART_WINDOW_MS = 3 * 60 * 1000; // 3-minute rolling window

const projectRoot = path.join(__dirname, "../..");
const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");
const modelPath = process.env.RESNET50_MODEL_PATH || path.join(projectRoot, "ML/image_recognition/resnet50_fruit_vegetable_best.keras");

function checkModelAvailable() {
    return fs.existsSync(modelPath) && fs.statSync(modelPath).size > 1000000;
}

function startVisionWorker() {
    if (process.env.DISABLE_PERSISTENT_VISION === "true") {
        console.log("ℹ️ [AGRI-SWAP] Persistent vision worker is disabled via DISABLE_PERSISTENT_VISION=true. Using on-demand inference.");
        return;
    }

    if (autoRestartDisabled) {
        console.log("ℹ️ [AGRI-SWAP] Persistent vision worker auto-restart is disabled due to crash protection. Using on-demand inference.");
        return;
    }

    if (workerProcess || isStarting) return;
    isStarting = true;
    isReady = false;

    // Check if model file exists before spawning to prevent instant crash loops
    if (!checkModelAvailable()) {
        console.log("🌱 [AGRI-SWAP] ResNet50 model weights not found. Attempting download before spawning vision worker...");
        const downloader = spawn(pythonCmd, [
            path.join(projectRoot, "scripts/download_model.py")
        ], {
            cwd: projectRoot,
            env: { ...process.env, PYTHONPATH: projectRoot }
        });

        downloader.stdout.on("data", (d) => process.stdout.write(d.toString()));
        downloader.stderr.on("data", (d) => process.stderr.write(d.toString()));

        downloader.on("close", (code) => {
            isStarting = false;
            if (code === 0 && checkModelAvailable()) {
                console.log("🌱 [AGRI-SWAP] Model download completed. Starting persistent vision worker...");
                startVisionWorker();
            } else {
                console.warn(`⚠️ [WARN] Model download exited with code ${code}. Vision worker paused. On-demand inference will be attempted when requested.`);
                autoRestartDisabled = true;
            }
        });

        downloader.on("error", (err) => {
            console.error("⚠️ [ERROR] Failed to run model downloader:", err.message);
            isStarting = false;
            autoRestartDisabled = true;
        });

        return;
    }

    console.log("🌱 [AGRI-SWAP] Initializing persistent ResNet50 Food Vision worker (Render low-memory mode)...");

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
                PYTHONIOENCODING: "utf-8",
                OMP_NUM_THREADS: "1",
                TF_NUM_INTRAOP_THREADS: "1",
                TF_NUM_INTEROP_THREADS: "1",
                TF_ENABLE_ONEDNN_OPTS: "0",
                TF_CPP_MIN_LOG_LEVEL: "2"
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
            // Suppress non-fatal TF notices
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

            // Crash-loop protection: prune old restart records
            const now = Date.now();
            while (restartTimestamps.length > 0 && (now - restartTimestamps[0] > RESTART_WINDOW_MS)) {
                restartTimestamps.shift();
            }
            restartTimestamps.push(now);

            if (restartTimestamps.length >= MAX_RESTARTS_IN_WINDOW) {
                autoRestartDisabled = true;
                console.warn(`⚠️ [CRASH LOOP PROTECTION] Vision worker exited ${restartTimestamps.length} times within 3 minutes.`);
                console.warn("   Persistent worker auto-restart is DISABLED to protect server memory on Render free tier.");
                console.warn("   Incoming image requests will use on-demand CLI fallback execution.");
                return;
            }

            // Exponential backoff: 5s, 10s, 20s up to 30s
            const backoffMs = Math.min(5000 * Math.pow(2, restartTimestamps.length - 1), 30000);
            console.log(`🌱 [AGRI-SWAP] Scheduling vision worker restart in ${backoffMs / 1000}s (attempt ${restartTimestamps.length} of ${MAX_RESTARTS_IN_WINDOW})...`);

            setTimeout(() => {
                if (!workerProcess && !isStarting && !autoRestartDisabled) {
                    console.log("🌱 [AGRI-SWAP] Executing scheduled vision worker restart...");
                    startVisionWorker();
                }
            }, backoffMs);
        });

    } catch (err) {
        console.error("⚠️ [ERROR] Could not start vision worker:", err.message);
        isStarting = false;
    }
}

// Stagger worker start to let server boot & database init complete without RAM contention
if (process.env.LAZY_VISION_WORKER !== "true" && process.env.DISABLE_PERSISTENT_VISION !== "true") {
    setTimeout(() => {
        startVisionWorker();
    }, 4000);
}

/**
 * Predicts food from image path using persistent in-memory ResNet50 model.
 * Falls back to standalone CLI if persistent worker is unavailable.
 */
async function predictFoodImage(imagePath) {
    // If worker process is not alive and not starting and auto-restart is allowed, attempt starting it
    if (!workerProcess && !isStarting && !autoRestartDisabled && process.env.DISABLE_PERSISTENT_VISION !== "true") {
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
        workerActive: !!workerProcess,
        autoRestartDisabled: autoRestartDisabled,
        modelAvailable: checkModelAvailable()
    };
}

module.exports = {
    predictFoodImage,
    getVisionStatus,
    startVisionWorker
};

