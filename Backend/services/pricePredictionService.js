const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let DatabaseSync = null;
try {
    const sqliteModule = require("node:sqlite");
    DatabaseSync = sqliteModule.DatabaseSync;
} catch (e) {
    // node:sqlite is optional
}

const DB_PATH = process.env.HISTORICAL_PRICES_DB_PATH || path.join(__dirname, "../data/historical_prices.db");

// L1 In-memory cache for ultra-fast (<0.05ms) responses
const PREDICTION_SERVER_CACHE = new Map();
const IN_FLIGHT_PROMISES = new Map();

let persistentDbInstance = null;
function getPersistentDb() {
    if (!DatabaseSync) return null;
    if (persistentDbInstance) return persistentDbInstance;

    try {
        if (fs.existsSync(DB_PATH)) {
            persistentDbInstance = new DatabaseSync(DB_PATH, { readOnly: false });
            try {
                persistentDbInstance.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
            } catch (_) {}
            persistentDbInstance.exec(`
                CREATE TABLE IF NOT EXISTS lstm_prediction_cache (
                    commodity TEXT NOT NULL,
                    horizon INTEGER NOT NULL,
                    data TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    PRIMARY KEY (commodity, horizon)
                )
            `);
            return persistentDbInstance;
        }
    } catch (err) {
        console.warn("⚠️ [WARN] Could not initialize node:sqlite for LSTM predictions:", err.message);
    }
    return null;
}

/**
 * Reads cached prediction directly from durable SQLite storage.
 */
function getFromPersistentDb(commodity, horizon) {
    const db = getPersistentDb();
    if (!db) return null;

    try {
        const stmt = db.prepare("SELECT data FROM lstm_prediction_cache WHERE commodity = ? AND horizon = ?");
        const row = stmt.get(commodity.toLowerCase(), horizon);
        if (row && row.data) {
            const parsed = JSON.parse(row.data);
            parsed.fromPersistentStorage = true;
            return parsed;
        }
    } catch (err) {
        // Fall back gracefully
    }
    return null;
}

/**
 * Stores prediction result into durable SQLite storage.
 */
function writeToPersistentDb(commodity, horizon, data) {
    const db = getPersistentDb();
    if (!db) return;

    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO lstm_prediction_cache (commodity, horizon, data, updated_at)
            VALUES (?, ?, ?, datetime('now'))
        `);
        stmt.run(commodity.toLowerCase(), horizon, JSON.stringify(data));
    } catch (err) {
        console.warn("⚠️ [WARN] Failed to write prediction to SQLite:", err.message);
    }
}

/**
 * Preloads all persistent predictions on server startup into L1 memory cache.
 */
function preloadPredictions() {
    const db = getPersistentDb();
    if (!db) return 0;

    try {
        const rows = db.prepare("SELECT commodity, horizon, data FROM lstm_prediction_cache").all();
        let loaded = 0;
        for (const r of rows) {
            if (r.data) {
                const key = `${r.commodity.toLowerCase()}_${r.horizon}`;
                PREDICTION_SERVER_CACHE.set(key, JSON.parse(r.data));
                loaded++;
            }
        }
        if (loaded > 0) {
            console.log(`[AGRI-SWAP] Preloaded ${loaded} LSTM price predictions from SQLite storage.`);
        }
        return loaded;
    } catch (err) {
        return 0;
    }
}

// Initialize on module load
preloadPredictions();

/**
 * Returns cache statistics for health check and diagnostics.
 */
function getForecastStats() {
    let totalPersistent = 0;
    const db = getPersistentDb();
    if (db) {
        try {
            const row = db.prepare("SELECT count(*) as cnt FROM lstm_prediction_cache").get();
            totalPersistent = row?.cnt || 0;
        } catch (_) {}
    }
    return {
        memoryCached: PREDICTION_SERVER_CACHE.size,
        persistentCached: totalPersistent
    };
}

/**
 * Safely pre-warms persistent cache for core commodities in the background.
 * Guarantees that requests for primary commodities return in <0.1ms without cold spawns.
 */
let isPrewarming = false;
async function prewarmForecastCache(commodities = ["Tomato", "Onion", "Potato", "Rice", "Wheat"], horizons = [7, 30]) {
    if (isPrewarming) return;
    isPrewarming = true;

    try {
        const missing = [];
        for (const c of commodities) {
            for (const h of horizons) {
                const key = `${c.toLowerCase()}_${h}`;
                if (!PREDICTION_SERVER_CACHE.has(key) && !getFromPersistentDb(c, h)) {
                    missing.push({ commodity: c, horizon: h });
                }
            }
        }

        if (missing.length === 0) {
            console.log("[AGRI-SWAP] All primary LSTM price forecasts are already warm in persistent SQLite cache.");
            isPrewarming = false;
            return;
        }

        console.log(`🌱 [AGRI-SWAP] Pre-warming ${missing.length} missing LSTM price forecasts in background...`);
        for (const item of missing) {
            try {
                await getLSTMPrediction(item.commodity, item.horizon);
                console.log(`   ✓ Pre-warmed LSTM forecast: ${item.commodity} (${item.horizon}d)`);
            } catch (err) {
                console.warn(`   ⚠️ [WARN] Could not pre-warm forecast for ${item.commodity} (${item.horizon}d): ${err.message}`);
            }
        }
        console.log("🌱 [AGRI-SWAP] LSTM forecast cache pre-warming completed.");
    } catch (err) {
        console.warn("⚠️ [WARN] Forecast pre-warming error:", err.message);
    } finally {
        isPrewarming = false;
    }
}

/**
 * Executes the PyTorch LSTM price prediction model via Python subprocess.
 * Uses L1 memory cache -> L2 durable SQLite storage -> Python inference fallback.
 *
 * @param {string} commodity - Target commodity (e.g. "Tomato", "Onion", "Potato", "Rice", "Wheat")
 * @param {number} horizon - Forecast horizon in days (e.g. 7 or 30)
 * @returns {Promise<Object>} Formatted prediction JSON from the model
 */
function getLSTMPrediction(commodity = "Tomato", horizon = 7) {
    const cleanCommodity = String(commodity).trim().toLowerCase();
    const cleanHorizon = parseInt(horizon, 10) || 7;
    const key = `${cleanCommodity}_${cleanHorizon}`;

    // 1. Check L1 Memory Cache
    if (PREDICTION_SERVER_CACHE.has(key)) {
        return Promise.resolve(PREDICTION_SERVER_CACHE.get(key));
    }

    // 2. Check L2 Durable SQLite Storage
    const persistent = getFromPersistentDb(cleanCommodity, cleanHorizon);
    if (persistent) {
        PREDICTION_SERVER_CACHE.set(key, persistent);
        return Promise.resolve(persistent);
    }

    // 3. Deduplicate concurrent in-flight requests
    if (IN_FLIGHT_PROMISES.has(key)) {
        return IN_FLIGHT_PROMISES.get(key);
    }

    // 4. Fallback to Python LSTM model execution
    const promise = new Promise((resolve, reject) => {
        const projectRoot = path.join(__dirname, "../..");
        const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

        const pythonProcess = spawn(pythonCmd, [
            "-m",
            "ML.price_prediction.predict_price_lstm",
            "--commodity",
            commodity,
            "--horizon",
            String(cleanHorizon)
        ], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONPATH: projectRoot
            }
        });

        let output = "";
        let errorOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on("error", (err) => {
            console.error("⚠️ [ERROR] Failed to spawn Python LSTM inference:", err.message);
            reject(new Error(`Failed to execute Python LSTM inference (${pythonCmd}): ${err.message}`));
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(errorOutput || `Python inference exited with code ${code}`));
            }

            try {
                const parsed = JSON.parse(output.trim());
                if (parsed && parsed.success) {
                    PREDICTION_SERVER_CACHE.set(key, parsed);
                    writeToPersistentDb(cleanCommodity, cleanHorizon, parsed);

                    // Dual-cache alternate horizon if present in model output
                    if (cleanHorizon === 7 && Array.isArray(parsed.predicted30d) && parsed.predicted30d.length > 0) {
                        const altKey = `${cleanCommodity}_30`;
                        if (!PREDICTION_SERVER_CACHE.has(altKey)) {
                            const curP = Number(parsed.currentPrice) || 1;
                            const p30 = Number(parsed.predicted30d[parsed.predicted30d.length - 1].price);
                            const diff30 = Math.round((p30 - curP) * 10) / 10;
                            const pct30 = Math.round(((diff30 / curP) * 100) * 100) / 100;
                            const altData = {
                                ...parsed,
                                horizon: "30d",
                                predictedPrice: p30,
                                priceChange: diff30,
                                priceChangePercent: pct30
                            };
                            PREDICTION_SERVER_CACHE.set(altKey, altData);
                            writeToPersistentDb(cleanCommodity, 30, altData);
                        }
                    } else if (cleanHorizon === 30 && Array.isArray(parsed.predicted7d) && parsed.predicted7d.length > 0) {
                        const altKey = `${cleanCommodity}_7`;
                        if (!PREDICTION_SERVER_CACHE.has(altKey)) {
                            const curP = Number(parsed.currentPrice) || 1;
                            const p7 = Number(parsed.predicted7d[parsed.predicted7d.length - 1].price);
                            const diff7 = Math.round((p7 - curP) * 10) / 10;
                            const pct7 = Math.round(((diff7 / curP) * 100) * 100) / 100;
                            const altData = {
                                ...parsed,
                                horizon: "7d",
                                predictedPrice: p7,
                                priceChange: diff7,
                                priceChangePercent: pct7
                            };
                            PREDICTION_SERVER_CACHE.set(altKey, altData);
                            writeToPersistentDb(cleanCommodity, 7, altData);
                        }
                    }
                }
                resolve(parsed);
            } catch (err) {
                reject(new Error(`Failed to parse LSTM model output: ${err.message}. Raw output: ${output}`));
            }
        });
    }).finally(() => {
        IN_FLIGHT_PROMISES.delete(key);
    });

    IN_FLIGHT_PROMISES.set(key, promise);
    return promise;
}

module.exports = {
    getLSTMPrediction,
    prewarmForecastCache,
    getForecastStats,
    preloadPredictions
};
