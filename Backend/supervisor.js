/**
 * AGRI-SWAP Backend Process Supervisor & Watchdog
 * 
 * Provides:
 *  - Persistent process supervision & crash detection
 *  - Automatic restart with exponential backoff & crash-loop protection
 *  - Port conflict resolution and duplicate process prevention
 *  - Persistent log files with ISO timestamps and stack traces
 *  - HTTP health readiness verification (/api/health)
 *  - Graceful termination handling
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = __dirname;
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const DATA_DIR = path.join(BACKEND_DIR, "data");

const PID_FILE = path.join(DATA_DIR, "supervisor.pid");
const BACKEND_PID_FILE = path.join(DATA_DIR, "backend.pid");

const BACKEND_LOG = path.join(LOGS_DIR, "backend.log");
const BACKEND_ERR_LOG = path.join(LOGS_DIR, "backend_error.log");
const CRASH_LOG = path.join(LOGS_DIR, "backend_crash.log");
const SUPERVISOR_LOG = path.join(LOGS_DIR, "supervisor.log");

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_RESTARTS_IN_WINDOW = 10;
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Ensure required directories exist
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function formatTimestamp() {
    return new Date().toISOString();
}

function appendLog(filePath, message) {
    const entry = `[${formatTimestamp()}] ${message}\n`;
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > MAX_LOG_SIZE_BYTES) {
                // Rotate old log
                const backupPath = `${filePath}.old`;
                if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
                fs.renameSync(filePath, backupPath);
            }
        }
        fs.appendFileSync(filePath, entry, "utf8");
    } catch (e) {
        // Fall back to stderr if write fails
        console.error(`[SUPERVISOR LOG ERROR] Failed to write to ${filePath}:`, e.message);
    }
}

function logSupervisor(msg) {
    console.log(`[SUPERVISOR] ${msg}`);
    appendLog(SUPERVISOR_LOG, msg);
}

function logError(msg, err = null) {
    const detail = err ? `${msg}\nStack: ${err.stack || err.message}` : msg;
    console.error(`[SUPERVISOR ERROR] ${detail}`);
    appendLog(SUPERVISOR_LOG, `ERROR: ${detail}`);
    appendLog(BACKEND_ERR_LOG, `ERROR: ${detail}`);
}

/**
 * Checks if a process PID is currently active in the OS.
 */
function isPidAlive(pid) {
    if (!pid || isNaN(pid)) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Gets listening PIDs on the target port (cross-platform Linux/POSIX and Windows).
 */
function getPortOwners(port) {
    if (process.platform !== "win32") {
        try {
            const out = execSync(`lsof -ti:${port} 2>/dev/null || fuser ${port}/tcp 2>/dev/null`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
            const pids = new Set();
            for (const line of out.split("\n")) {
                const pidNum = parseInt(line.trim(), 10);
                if (pidNum && !isNaN(pidNum) && pidNum !== process.pid) {
                    pids.add(pidNum);
                }
            }
            return Array.from(pids);
        } catch (e) {
            return [];
        }
    }
    try {
        const out = execSync(`netstat -aon | findstr :${port}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
        const pids = new Set();
        for (const line of out.split("\n")) {
            if (line.includes("LISTENING")) {
                const parts = line.trim().split(/\s+/);
                const pidStr = parts[parts.length - 1];
                const pidNum = parseInt(pidStr, 10);
                if (pidNum && !isNaN(pidNum) && pidNum !== process.pid) {
                    pids.add(pidNum);
                }
            }
        }
        return Array.from(pids);
    } catch (e) {
        return [];
    }
}

/**
 * Kills a process by PID across Linux and Windows.
 */
function killPid(pid) {
    if (process.platform !== "win32") {
        try {
            process.kill(pid, "SIGKILL");
            return true;
        } catch (_) {
            return false;
        }
    }
    try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        return true;
    } catch (e) {
        try {
            process.kill(pid, "SIGKILL");
            return true;
        } catch (_) {
            return false;
        }
    }
}

/**
 * Queries the HTTP health endpoint.
 */
function queryHealth(timeoutMs = 3000) {
    return new Promise((resolve) => {
        const req = http.get(HEALTH_URL, { timeout: timeoutMs }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed && (parsed.status === "healthy" || parsed.success === true)) {
                            return resolve({ healthy: true, status: res.statusCode, data: parsed });
                        }
                    } catch (e) {
                        return resolve({ healthy: false, status: res.statusCode, error: "Invalid JSON from health endpoint" });
                    }
                }
                resolve({ healthy: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
            });
        });

        req.on("error", (err) => {
            resolve({ healthy: false, error: err.message });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({ healthy: false, error: "Health check timed out" });
        });
    });
}

/**
 * Waits for the health endpoint to report healthy up to a deadline.
 */
async function waitForHealth(maxWaitMs = 60000, intervalMs = 500) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        const res = await queryHealth(2000);
        if (res.healthy) {
            return res;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { healthy: false, error: `Health check did not succeed within ${maxWaitMs / 1000} seconds` };
}

let childProcess = null;
let isManualShutdown = false;
const restartHistory = [];
const recentStderr = [];

function recordStderr(line) {
    recentStderr.push(line);
    if (recentStderr.length > 50) {
        recentStderr.shift();
    }
}

/**
 * Spawns and supervises the Backend Node server.
 */
function startBackend() {
    if (isManualShutdown) return;

    // Clear any stale processes occupying port 5000 before spawning
    const portOwners = getPortOwners(PORT);
    for (const roguePid of portOwners) {
        if (!childProcess || roguePid !== childProcess.pid) {
            logSupervisor(`Port ${PORT} is occupied by rogue PID ${roguePid}. Terminating rogue process...`);
            killPid(roguePid);
        }
    }

    logSupervisor(`Spawning backend server: node server.js (Port ${PORT})...`);
    appendLog(SUPERVISOR_LOG, `Starting child backend from ${BACKEND_DIR}`);

    childProcess = spawn(process.execPath, [path.join(BACKEND_DIR, "server.js")], {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            PROJECT_ROOT: PROJECT_ROOT,
            PYTHONPATH: PROJECT_ROOT,
            PYTHONIOENCODING: "utf-8",
            PORT: String(PORT)
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    const childPid = childProcess.pid;
    logSupervisor(`Backend process spawned with PID ${childPid}.`);
    try {
        fs.writeFileSync(BACKEND_PID_FILE, String(childPid), "utf8");
    } catch (_) {}

    childProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        process.stdout.write(text);
        appendLog(BACKEND_LOG, text.trimEnd());
    });

    childProcess.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        process.stderr.write(text);
        appendLog(BACKEND_ERR_LOG, text.trimEnd());
        for (const line of text.split("\n")) {
            if (line.trim()) recordStderr(line.trim());
        }
    });

    childProcess.on("error", (err) => {
        logError(`Failed to spawn backend process (PID ${childPid}):`, err);
        handleProcessExit(childPid, -1, "SPAWN_ERROR");
    });

    childProcess.on("close", (code, signal) => {
        handleProcessExit(childPid, code, signal);
    });
}

function handleProcessExit(pid, code, signal) {
    childProcess = null;
    try {
        if (fs.existsSync(BACKEND_PID_FILE)) fs.unlinkSync(BACKEND_PID_FILE);
    } catch (_) {}

    if (isManualShutdown) {
        logSupervisor(`Backend process PID ${pid} stopped cleanly for manual shutdown.`);
        return;
    }

    const now = Date.now();
    // Prune restarts older than the 5-minute rolling window
    while (restartHistory.length > 0 && (now - restartHistory[0] > RESTART_WINDOW_MS)) {
        restartHistory.shift();
    }
    restartHistory.push(now);

    const crashBanner = [
        "=================================================================",
        `[BACKEND CRASH DETECTED] Timestamp: ${formatTimestamp()}`,
        `Process PID: ${pid}`,
        `Exit Code:   ${code}`,
        `Exit Signal: ${signal || "None"}`,
        `Recent Stderr Dump:`,
        recentStderr.length > 0 ? recentStderr.join("\n") : "  (No stderr lines captured prior to exit)",
        "================================================================="
    ].join("\n");

    console.error("\n" + crashBanner + "\n");
    appendLog(CRASH_LOG, crashBanner);
    appendLog(SUPERVISOR_LOG, `Backend crashed (PID ${pid}, code: ${code}, signal: ${signal}).`);

    if (restartHistory.length > MAX_RESTARTS_IN_WINDOW) {
        const cooldownMs = 60000;
        const msg = `[CRASH LOOP ALERT] Backend has crashed ${restartHistory.length} times within 5 minutes. Enforcing ${cooldownMs / 1000}s cooldown before retrying.`;
        logError(msg);
        appendLog(CRASH_LOG, msg);
        setTimeout(() => {
            logSupervisor("Cooldown period elapsed. Attempting backend restart...");
            startBackend();
        }, cooldownMs);
        return;
    }

    // Exponential retry backoff: 2s, 3s, 4.5s... up to 10s
    const backoffMs = Math.min(1000 * Math.pow(1.5, restartHistory.length), 10000);
    logSupervisor(`Scheduling backend restart in ${Math.round(backoffMs)}ms (attempt ${restartHistory.length} of ${MAX_RESTARTS_IN_WINDOW} in window)...`);

    setTimeout(() => {
        logSupervisor("Executing scheduled backend restart...");
        startBackend();
    }, backoffMs);
}

function setupShutdownHandlers() {
    function shutdown(sig) {
        if (isManualShutdown) return;
        isManualShutdown = true;
        logSupervisor(`Received ${sig}. Performing graceful supervisor shutdown...`);

        if (childProcess && isPidAlive(childProcess.pid)) {
            const cPid = childProcess.pid;
            logSupervisor(`Terminating child backend process PID ${cPid}...`);
            childProcess.kill("SIGTERM");

            const forceKillTimer = setTimeout(() => {
                if (isPidAlive(cPid)) {
                    logSupervisor(`Force killing unresponsive backend PID ${cPid}...`);
                    killPid(cPid);
                }
            }, 4000);

            childProcess.on("close", () => {
                clearTimeout(forceKillTimer);
                cleanupAndExit(0);
            });
        } else {
            cleanupAndExit(0);
        }
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function cleanupAndExit(code = 0) {
    try {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        if (fs.existsSync(BACKEND_PID_FILE)) fs.unlinkSync(BACKEND_PID_FILE);
    } catch (_) {}
    logSupervisor(`Supervisor shutdown completed. Exiting code ${code}.`);
    process.exit(code);
}

/**
 * Main supervisor initialization.
 */
async function main() {
    const args = process.argv.slice(2);

    // CLI mode: --health
    if (args.includes("--health")) {
        const health = await queryHealth(4000);
        if (health.healthy) {
            console.log(JSON.stringify({ status: "healthy", code: 200, ...health.data }, null, 2));
            process.exit(0);
        } else {
            console.error(JSON.stringify({ status: "unhealthy", error: health.error }, null, 2));
            process.exit(1);
        }
    }

    // CLI mode: --status
    if (args.includes("--status")) {
        let supPid = null;
        if (fs.existsSync(PID_FILE)) {
            supPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
        }
        let bPid = null;
        if (fs.existsSync(BACKEND_PID_FILE)) {
            bPid = parseInt(fs.readFileSync(BACKEND_PID_FILE, "utf8").trim(), 10);
        }

        const health = await queryHealth(2000);
        const statusReport = {
            supervisorRunning: isPidAlive(supPid),
            supervisorPid: supPid,
            backendRunning: isPidAlive(bPid),
            backendPid: bPid,
            port5000Listening: getPortOwners(PORT).length > 0,
            health: health
        };
        console.log(JSON.stringify(statusReport, null, 2));
        process.exit(0);
    }

    // CLI mode: --stop
    if (args.includes("--stop")) {
        let stoppedAny = false;
        if (fs.existsSync(PID_FILE)) {
            const sPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
            if (isPidAlive(sPid)) {
                logSupervisor(`Stopping supervisor PID ${sPid}...`);
                killPid(sPid);
                stoppedAny = true;
            }
            try { fs.unlinkSync(PID_FILE); } catch (_) {}
        }
        if (fs.existsSync(BACKEND_PID_FILE)) {
            const bPid = parseInt(fs.readFileSync(BACKEND_PID_FILE, "utf8").trim(), 10);
            if (isPidAlive(bPid)) {
                logSupervisor(`Stopping child backend PID ${bPid}...`);
                killPid(bPid);
                stoppedAny = true;
            }
            try { fs.unlinkSync(BACKEND_PID_FILE); } catch (_) {}
        }
        const portOwners = getPortOwners(PORT);
        for (const p of portOwners) {
            logSupervisor(`Terminating process PID ${p} on port ${PORT}...`);
            killPid(p);
            stoppedAny = true;
        }
        console.log(stoppedAny ? "[SUCCESS] AGRI-SWAP backend stopped." : "[INFO] No active backend processes found.");
        process.exit(0);
    }

    // Default: Run Supervisor Daemon
    // 1. Check if supervisor is already active
    if (fs.existsSync(PID_FILE)) {
        const existingPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
        if (isPidAlive(existingPid) && existingPid !== process.pid) {
            const currentHealth = await queryHealth(3000);
            if (currentHealth.healthy) {
                logSupervisor(`AGRI-SWAP Supervisor is already running (PID ${existingPid}) and Backend is healthy.`);
                process.exit(0);
            } else {
                logSupervisor(`Existing supervisor PID ${existingPid} found, but backend is not healthy. Reclaiming control...`);
                killPid(existingPid);
            }
        }
    }

    // Write current supervisor PID
    try {
        fs.writeFileSync(PID_FILE, String(process.pid), "utf8");
    } catch (e) {
        logError("Could not write supervisor PID file:", e);
    }

    setupShutdownHandlers();

    logSupervisor(`=================================================================`);
    logSupervisor(`      AGRI-SWAP Process Supervisor Active (PID: ${process.pid})     `);
    logSupervisor(`=================================================================`);

    startBackend();

    // Verify readiness
    const readiness = await waitForHealth(60000, 500);
    if (readiness.healthy) {
        logSupervisor(`🌱 AGRI-SWAP Backend confirmed READY and HEALTHY on port ${PORT}.`);
    } else {
        logError(`⚠️ [WARN] Backend did not pass health check within initial window: ${readiness.error}`);
        logError(`Supervisor will continue monitoring and attempt recovery.`);
    }

    // Active heartbeat watchdog: keep supervisor alive and periodically check health every 10 seconds
    const watchdogInterval = setInterval(async () => {
        if (isManualShutdown) {
            clearInterval(watchdogInterval);
            return;
        }
        try {
            const health = await queryHealth(3000);
            if (!health.healthy) {
                logSupervisor(`⚠️ [WATCHDOG WARNING] Health check failed: ${health.error}. Inspecting backend...`);
                if (!childProcess || !isPidAlive(childProcess.pid)) {
                    logSupervisor(`Watchdog detected dead child process. Triggering restart...`);
                    startBackend();
                }
            }
        } catch (e) {
            // Ignored
        }
    }, 10000);

    // Keep event loop alive indefinitely as long-running daemon
    await new Promise(() => {});
}

main().catch((err) => {
    logError("Fatal Supervisor error:", err);
    cleanupAndExit(1);
});
