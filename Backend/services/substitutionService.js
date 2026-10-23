const { spawn } = require("child_process");
const path = require("path");

let cachedAvailableFoods = null;

function runPythonSubstitution(args) {
    return new Promise((resolve, reject) => {
        const projectRoot = path.join(__dirname, "../..");
        const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

        const pythonProcess = spawn(pythonCmd, [
            "-m",
            "ML.food_substitution.agricultural_food_substitution",
            ...args
        ], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONPATH: projectRoot,
                PYTHONIOENCODING: "utf-8"
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
            console.error("⚠️ [ERROR] Failed to spawn Python substitution service:", err.message);
            reject(new Error(`Failed to execute Python substitution service (${pythonCmd}): ${err.message}`));
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                console.error(`⚠️ [ERROR] Python substitution failed with exit code ${code}:`, errorOutput);
                reject(new Error(errorOutput || `Python exited with code ${code}`));
                return;
            }
            resolve(output);
        });
    });
}

const fs = require("fs");

let DatabaseSync = null;
try {
    const sqliteModule = require("node:sqlite");
    DatabaseSync = sqliteModule.DatabaseSync;
} catch (e) {
    // node:sqlite is optional
}

const DB_PATH = process.env.HISTORICAL_PRICES_DB_PATH || path.join(__dirname, "../data/historical_prices.db");
let persistentDbInstance = null;

function getPersistentDb() {
    if (!DatabaseSync) return null;
    if (persistentDbInstance) return persistentDbInstance;

    try {
        if (fs.existsSync(DB_PATH)) {
            persistentDbInstance = new DatabaseSync(DB_PATH, { readOnly: false });
            persistentDbInstance.exec(`
                CREATE TABLE IF NOT EXISTS substitution_query_cache (
                    cache_key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    food TEXT,
                    quantity REAL,
                    unit TEXT,
                    preference TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `);
            return persistentDbInstance;
        }
    } catch (err) {
        console.warn("⚠️ [WARN] Could not initialize node:sqlite for substitutions:", err.message);
    }
    return null;
}

function getFromPersistentDb(cacheKey) {
    const db = getPersistentDb();
    if (!db) return null;

    try {
        const stmt = db.prepare("SELECT data FROM substitution_query_cache WHERE cache_key = ?");
        const row = stmt.get(cacheKey);
        if (row && row.data) {
            const parsed = JSON.parse(row.data);
            parsed.fromPersistentStorage = true;
            return parsed;
        }
    } catch (err) {}
    return null;
}

function writeToPersistentDb(cacheKey, data, food, quantity, unit, preference) {
    const db = getPersistentDb();
    if (!db) return;

    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO substitution_query_cache 
            (cache_key, data, food, quantity, unit, preference, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        stmt.run(
            cacheKey,
            JSON.stringify(data),
            String(food || ""),
            parseFloat(quantity) || 1.0,
            String(unit || "kg"),
            String(preference || "balanced")
        );
    } catch (err) {
        console.warn("⚠️ [WARN] Failed to write substitution to SQLite:", err.message);
    }
}

// In-memory caches to eliminate redundant Python subprocesses across requests
const SUBSTITUTION_CACHE = new Map();
const PROFILE_CACHE = new Map();
const SUB_IN_FLIGHT = new Map();
const USER_RECS_CACHE = new Map();

function scaleSubstitution(baseData, newQty, unit) {
    if (!baseData || !baseData.success) return baseData;
    const origPrice = baseData.originalFood?.pricePerKg ?? baseData.originalFood?.estimatedPricePerKg;
    const origTotal = (origPrice !== null && origPrice !== undefined) ? Math.round(origPrice * newQty * 10) / 10 : null;

    const scaledAlts = (baseData.alternatives || []).map((alt) => {
        const subRatio = Number(alt.substitutionRatio) || 1.0;
        const recQty = Math.round(newQty * subRatio * 100) / 100;
        let altTotalCost = null;
        let savings = null;
        let savingsPct = null;

        if (origTotal !== null && Number(alt.alternativePricePerKg) > 0) {
            altTotalCost = Math.round(alt.alternativePricePerKg * recQty * 10) / 10;
            savings = Math.round((origTotal - altTotalCost) * 10) / 10;
            savingsPct = origTotal > 0 ? Math.round((savings / origTotal) * 1000) / 10 : 0.0;
        }

        const reasons = (alt.whyRecommended || []).map((r) => {
            if (typeof r === "string" && r.startsWith("Estimated savings")) {
                if (savings !== null && savings > 0) {
                    return `Estimated savings of Rs. ${savings.toFixed(1)} (${savingsPct}% lower cost for ${recQty} ${unit})`;
                }
            }
            return r;
        });

        return {
            ...alt,
            recommendedQuantity: recQty,
            alternativeTotalCost: altTotalCost,
            estimatedSavings: savings,
            savingsPercent: savingsPct,
            whyRecommended: reasons
        };
    });

    return {
        ...baseData,
        originalFood: {
            ...baseData.originalFood,
            quantity: newQty,
            totalCost: origTotal,
            totalEstimatedCost: origTotal
        },
        alternatives: scaledAlts
    };
}

function preloadSubstitutions() {
    const db = getPersistentDb();
    if (!db) return;

    try {
        const rows = db.prepare("SELECT cache_key, data FROM substitution_query_cache ORDER BY updated_at DESC LIMIT 300").all();
        let loaded = 0;
        for (const r of rows) {
            if (r.cache_key && r.data) {
                const parsed = JSON.parse(r.data);
                SUBSTITUTION_CACHE.set(r.cache_key, parsed);
                if (parsed.originalFood && parsed.preference) {
                    const profKey = `${String(parsed.originalFood.name).trim().toLowerCase()}_${String(parsed.originalFood.unit || "kg").trim().toLowerCase()}_${String(parsed.preference).trim().toLowerCase()}`;
                    if (!PROFILE_CACHE.has(profKey)) {
                        PROFILE_CACHE.set(profKey, parsed);
                    }
                }
                loaded++;
            }
        }
        if (loaded > 0) {
            console.log(`[AGRI-SWAP] Preloaded ${loaded} food substitution queries (${PROFILE_CACHE.size} profile templates) from SQLite storage.`);
        }
    } catch (err) {}
}

preloadSubstitutions();

async function getSubstitutionRecommendations(userId) {
    const key = String(userId);
    if (USER_RECS_CACHE.has(key)) {
        return USER_RECS_CACHE.get(key);
    }
    const result = await runPythonSubstitution(["--userId", userId]);
    USER_RECS_CACHE.set(key, result);
    return result;
}

async function getFoodSubstitutions({ food, quantity = 1, unit = "kg", preference = "balanced" }) {
    const cleanFood = String(food).trim().toLowerCase();
    const cleanQty = parseFloat(quantity) || 1;
    const cleanUnit = String(unit).trim().toLowerCase();
    const cleanPref = String(preference).trim().toLowerCase();
    const key = `${cleanFood}_${cleanQty}_${cleanUnit}_${cleanPref}`;
    const profKey = `${cleanFood}_${cleanUnit}_${cleanPref}`;

    // 1. Check L1 in-memory cache
    if (SUBSTITUTION_CACHE.has(key)) {
        return SUBSTITUTION_CACHE.get(key);
    }

    // 2. Check L2 durable SQLite cache
    const persistent = getFromPersistentDb(key);
    if (persistent) {
        SUBSTITUTION_CACHE.set(key, persistent);
        if (!PROFILE_CACHE.has(profKey)) PROFILE_CACHE.set(profKey, persistent);
        return persistent;
    }

    // 3. Fast-path: Check if in-memory profile exists to scale quantity linearly (<0.05ms)
    if (PROFILE_CACHE.has(profKey)) {
        const scaled = scaleSubstitution(PROFILE_CACHE.get(profKey), cleanQty, unit);
        SUBSTITUTION_CACHE.set(key, scaled);
        writeToPersistentDb(key, scaled, food, quantity, unit, preference);
        return scaled;
    }

    // 4. Check if SQLite persistent store has any base profile for this food & preference
    const db = getPersistentDb();
    if (db) {
        try {
            const row = db.prepare("SELECT data FROM substitution_query_cache WHERE LOWER(food) = ? AND LOWER(preference) = ? LIMIT 1").get(cleanFood, cleanPref);
            if (row && row.data) {
                const baseParsed = JSON.parse(row.data);
                PROFILE_CACHE.set(profKey, baseParsed);
                const scaled = scaleSubstitution(baseParsed, cleanQty, unit);
                SUBSTITUTION_CACHE.set(key, scaled);
                writeToPersistentDb(key, scaled, food, quantity, unit, preference);
                return scaled;
            }
        } catch (_) {}
    }

    // 5. Deduplicate concurrent in-flight requests
    if (SUB_IN_FLIGHT.has(key)) {
        return SUB_IN_FLIGHT.get(key);
    }

    const promise = (async () => {
        const args = [
            "--food", String(food),
            "--quantity", String(quantity),
            "--unit", String(unit),
            "--preference", String(preference)
        ];
        const rawOutput = await runPythonSubstitution(args);
        try {
            const firstBrace = rawOutput.indexOf("{");
            const lastBrace = rawOutput.lastIndexOf("}");
            const jsonStr = (firstBrace !== -1 && lastBrace !== -1)
                ? rawOutput.substring(firstBrace, lastBrace + 1)
                : rawOutput.trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed && parsed.success) {
                SUBSTITUTION_CACHE.set(key, parsed);
                PROFILE_CACHE.set(profKey, parsed);
                writeToPersistentDb(key, parsed, food, quantity, unit, preference);
            }
            return parsed;
        } catch (e) {
            console.error("⚠️ [ERROR] Failed to parse substitution output:", e.message, "Raw output:", rawOutput);
            throw new Error("Invalid JSON received from substitution algorithm: " + rawOutput);
        }
    })().finally(() => {
        SUB_IN_FLIGHT.delete(key);
    });

    SUB_IN_FLIGHT.set(key, promise);
    return promise;
}

async function getAvailableFoods() {
    if (cachedAvailableFoods) {
        return cachedAvailableFoods;
    }
    const rawOutput = await runPythonSubstitution(["--list-foods"]);
    try {
        const firstBrace = rawOutput.indexOf("{");
        const lastBrace = rawOutput.lastIndexOf("}");
        const jsonStr = (firstBrace !== -1 && lastBrace !== -1)
            ? rawOutput.substring(firstBrace, lastBrace + 1)
            : rawOutput.trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.success && Array.isArray(parsed.foods)) {
            cachedAvailableFoods = parsed;
        }
        return parsed;
    } catch (e) {
        console.error("⚠️ [ERROR] Failed to parse available foods output:", e.message, "Raw output:", rawOutput);
        throw new Error("Invalid JSON received for available foods: " + rawOutput);
    }
}

function getNutritionStats() {
    const dbPath = path.join(__dirname, "../data/nutrition.db");
    try {
        const fs = require("fs");
        if (!fs.existsSync(dbPath)) return { ready: false, totalProfiles: 0 };
        const { DatabaseSync } = require("node:sqlite");
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const row = db.prepare("SELECT value FROM nutrition_metadata WHERE key = 'total_profiles'").get();
        db.close();
        return {
            ready: true,
            totalProfiles: row ? parseInt(row.value, 10) : 0,
            dbPath
        };
    } catch (e) {
        return { ready: false, error: e.message };
    }
}

module.exports = {
    getSubstitutionRecommendations,
    getFoodSubstitutions,
    getAvailableFoods,
    getNutritionStats
};