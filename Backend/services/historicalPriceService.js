const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let DatabaseSync = null;
try {
    const sqliteModule = require("node:sqlite");
    DatabaseSync = sqliteModule.DatabaseSync;
} catch (e) {
    // node:sqlite is optional; if unavailable, Python will directly handle SQLite
}

const DB_PATH = process.env.HISTORICAL_PRICES_DB_PATH || path.join(__dirname, "../data/historical_prices.db");

// L1 In-memory cache for ultra-fast (<0.1ms) responses
const QUERY_CACHE = new Map();
const MAX_CACHE_SIZE = 500;

// Deduplicate concurrent in-flight requests (e.g. during page load / filter click)
const IN_FLIGHT_REQUESTS = new Map();

/**
 * Normalizes query parameters into a deterministic cache key.
 * Exactly matches the key format used by historicalPriceQuery.py and backfillHistoricalPrices.py.
 */
function getNormalizedCacheKey(params = {}) {
    const commodity = String(params.commodity || "All").trim();
    const state = String(params.state || "All").trim();
    const district = String(params.district || "All").trim();
    const market = String(params.market || "All").trim();
    const dateRange = String(params.dateRange || "30d").trim().toLowerCase();
    const search = String(params.search || "").trim().toLowerCase();
    const sortField = String(params.sortField || "date").trim().toLowerCase();
    const sortOrder = String(params.sortOrder || "desc").trim().toLowerCase();
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 10));
    const isTimeline = Boolean(params.timeline === true || params.timeline === "true" || params.timeline === 1 || params.timeline === "1");

    return `hist::c=${commodity}::s=${state}::d=${district}::m=${market}::dr=${dateRange}::q=${search}::sf=${sortField}::so=${sortOrder}::p=${page}::l=${limit}::tl=${isTimeline ? 1 : 0}`;
}

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
            return persistentDbInstance;
        }
    } catch (err) {
        console.warn("⚠️ [WARN] Could not initialize node:sqlite persistent DB connection:", err.message);
    }
    return null;
}

/**
 * Reads cached query directly from durable SQLite storage in Node.
 * Supports exact key lookup, case-insensitive key lookup, and flexible page 1 limit/timeline slicing.
 */
function getFromPersistentDb(cacheKey, params = {}) {
    const db = getPersistentDb();
    if (!db) return null;

    try {
        // 1. Exact match
        const stmt = db.prepare("SELECT data FROM historical_query_cache WHERE cache_key = ?");
        let row = stmt.get(cacheKey);

        // 2. Case-insensitive key match
        if (!row || !row.data) {
            const stmtNoCase = db.prepare("SELECT data FROM historical_query_cache WHERE cache_key = ? COLLATE NOCASE");
            row = stmtNoCase.get(cacheKey);
        }

        if (row && row.data) {
            const parsed = JSON.parse(row.data);
            if (parsed && !parsed.isFallbackMode) {
                parsed.fromPersistentStorage = true;
                parsed.dataSource = "sqlite_cache";
                return parsed;
            }
        }

        // 3. Flexible resolution when Parquet dataset is not available or query has different limit/dateRange
        const isTimeline = Boolean(params.timeline === true || params.timeline === "true" || params.timeline === 1 || params.timeline === "1");
        const page = Math.max(1, parseInt(params.page, 10) || 1);
        const comm = String(params.commodity || "All").trim();
        const state = String(params.state || "All").trim();
        const district = String(params.district || "All").trim();
        const market = String(params.market || "All").trim();

        if (!isTimeline && page === 1) {
            // Flexible Page-1 Table Query: slice available cached records to requested limit
            const requestedLimit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 10));
            const flexStmt = db.prepare(`
                SELECT data FROM historical_query_cache 
                WHERE commodity LIKE ? AND state = ? AND district = ? AND market = ? AND is_timeline = 0
                ORDER BY length(data) DESC LIMIT 1
            `);
            const flexRow = flexStmt.get(comm, state, district, market);
            if (flexRow && flexRow.data) {
                const flexData = JSON.parse(flexRow.data);
                if (flexData && Array.isArray(flexData.records) && flexData.records.length > 0 && !flexData.isFallbackMode) {
                    const slicedRecords = flexData.records.slice(0, requestedLimit);
                    const totalCount = typeof flexData.total === "number" && flexData.total > 0 ? flexData.total : flexData.records.length;
                    const slicedPayload = {
                        ...flexData,
                        records: slicedRecords,
                        count: slicedRecords.length,
                        page: 1,
                        limit: requestedLimit,
                        total: totalCount,
                        totalPages: Math.max(1, Math.ceil(totalCount / requestedLimit)),
                        fromPersistentStorage: true,
                        dataSource: "sqlite_cache"
                    };
                    writeToPersistentDb(cacheKey, slicedPayload, params);
                    return slicedPayload;
                }
            }
        } else if (isTimeline) {
            // Flexible Timeline Query: derive 7d or 14d from cached 30d/all timeline records
            const dr = String(params.dateRange || "30d").trim().toLowerCase();
            const flexTlStmt = db.prepare(`
                SELECT data FROM historical_query_cache 
                WHERE commodity LIKE ? AND state = ? AND district = ? AND market = ? AND is_timeline = 1
                ORDER BY length(data) DESC LIMIT 1
            `);
            const flexTlRow = flexTlStmt.get(comm, state, district, market);
            if (flexTlRow && flexTlRow.data) {
                const flexTlData = JSON.parse(flexTlRow.data);
                if (flexTlData && Array.isArray(flexTlData.records) && flexTlData.records.length > 0 && !flexTlData.isFallbackMode) {
                    let recs = flexTlData.records;
                    if (dr === "7d" && recs.length > 7) {
                        recs = recs.slice(-7);
                    } else if (dr === "14d" && recs.length > 14) {
                        recs = recs.slice(-14);
                    }
                    const slicedTl = {
                        ...flexTlData,
                        records: recs,
                        count: recs.length,
                        fromPersistentStorage: true,
                        dataSource: "sqlite_cache"
                    };
                    writeToPersistentDb(cacheKey, slicedTl, params);
                    return slicedTl;
                }
            }
        }
    } catch (err) {
        // Fall back gracefully to python execution if database is locked or error occurs
    }
    return null;
}


/**
 * Stores query result directly into durable SQLite storage.
 */
function writeToPersistentDb(cacheKey, data, params = {}) {
    if (data && data.isFallbackMode) return;
    const db = getPersistentDb();
    if (!db) return;

    try {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO historical_query_cache 
            (cache_key, data, commodity, state, district, market, date_range, is_timeline, record_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);
        const isTimeline = Boolean(params.timeline === true || params.timeline === "true" || params.timeline === 1 || params.timeline === "1");
        stmt.run(
            cacheKey,
            JSON.stringify(data),
            params.commodity || "All",
            params.state || "All",
            params.district || "All",
            params.market || "All",
            params.dateRange || "30d",
            isTimeline ? 1 : 0,
            Array.isArray(data.records) ? data.records.length : 0
        );
    } catch (err) {
        // If write fails, python execution will handle persistence on its next run
    }
}

function cleanOldMemoryCache() {
    if (QUERY_CACHE.size > MAX_CACHE_SIZE) {
        // Drop the oldest entry
        const firstKey = QUERY_CACHE.keys().next().value;
        QUERY_CACHE.delete(firstKey);
    }
}

/**
 * Spawns Python query runner with 15-second safety timeout.
 */
function executePythonHistoricalQuery(params, cacheKey) {
    return new Promise((resolve, reject) => {
        const projectRoot = path.join(__dirname, "../..");
        const scriptPath = path.join(__dirname, "historicalPriceQuery.py");
        const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

        const pythonProcess = spawn(pythonCmd, [scriptPath], {
            cwd: projectRoot,
            env: {
                ...process.env,
                PYTHONPATH: projectRoot
            }
        });

        let output = "";
        let errorOutput = "";
        let isTimedOut = false;

        const timer = setTimeout(() => {
            isTimedOut = true;
            pythonProcess.kill("SIGTERM");
            reject(new Error("Historical price query timed out after 15 seconds."));
        }, 15000);

        pythonProcess.stdout.on("data", (chunk) => {
            output += chunk.toString();
        });

        pythonProcess.stderr.on("data", (chunk) => {
            errorOutput += chunk.toString();
        });

        pythonProcess.on("close", (code) => {
            clearTimeout(timer);
            if (isTimedOut) return;

            if (code !== 0) {
                return reject(new Error(errorOutput || `Python query exited with code ${code}`));
            }

            try {
                const parsed = JSON.parse(output.trim());

                // If this is a fallback response, cache in L1 memory so repeated queries don't re-spawn Python
                if (parsed && parsed.isFallbackMode) {
                    cleanOldMemoryCache();
                    QUERY_CACHE.set(cacheKey, parsed);
                    return resolve(parsed);
                }

                if (!parsed || parsed.success === false) {
                    return reject(new Error(parsed?.error || "Historical price query failed"));
                }

                // Genuine data only: cache in L1 memory and write to SQLite
                cleanOldMemoryCache();
                QUERY_CACHE.set(cacheKey, parsed);
                writeToPersistentDb(cacheKey, parsed, params);

                resolve(parsed);
            } catch (err) {
                reject(new Error(`Failed to parse Python query output: ${err.message}. Raw: ${output.substring(0, 300)}`));
            }
        });

        // Send parameters via stdin
        pythonProcess.stdin.write(JSON.stringify(params));
        pythonProcess.stdin.end();
    });
}

/**
 * Checks whether the physical parquet dataset directory is available on disk.
 */
function isParquetDatasetAvailable() {
    const parquetDir = process.env.PARQUET_DATASET_DIR || path.join(__dirname, "../../Datasets/Agricultural Market Price Dataset/cleaned_dataset");
    try {
        if (!fs.existsSync(parquetDir)) return false;
        const stat = fs.statSync(parquetDir);
        return stat.isDirectory();
    } catch (_) {
        return false;
    }
}

/**
 * Fetches real historical price records from persistent SQLite cache or Cleaned Parquet dataset.
 *
 * @param {Object} params - Query parameters (commodity, state, district, market, dateRange, search, sortField, sortOrder, page, limit)
 * @returns {Promise<Object>} Object containing records, total, page, limit, totalPages
 */
function fetchHistoricalPrices(params = {}) {
    const cacheKey = getNormalizedCacheKey(params);

    // 1. L1 Memory Cache Hit
    const inMemory = QUERY_CACHE.get(cacheKey);
    if (inMemory) {
        return Promise.resolve(inMemory);
    }

    // 2. L2 Persistent SQLite Cache Hit (survives restarts, 0.5ms)
    const fromPersistent = getFromPersistentDb(cacheKey, params);
    if (fromPersistent) {
        cleanOldMemoryCache();
        QUERY_CACHE.set(cacheKey, fromPersistent);
        return Promise.resolve(fromPersistent);
    }

    // 3. If Parquet dataset is not present on disk (Render lightweight mode) and not in SQLite, return clean fallback
    if (!isParquetDatasetAvailable()) {
        const isTimeline = params.timeline === true || params.timeline === "true" || params.timeline === 1 || params.timeline === "1";
        const commodityName = String(params.commodity || "All").trim();
        const fallbackPayload = {
            success: true,
            records: [],
            count: 0,
            total: 0,
            page: Math.max(1, parseInt(params.page, 10) || 1),
            limit: Math.min(100, Math.max(1, parseInt(params.limit, 10) || 10)),
            totalPages: 0,
            isFallbackMode: true,
            fromPersistentStorage: false,
            dataSource: "none",
            fallbackReason: "parquet_dataset_missing",
            message: `Granular mandi records are unavailable in lightweight cloud mode for ${commodityName}. Pre-cached records are available in SQLite.`
        };
        if (isTimeline) {
            fallbackPayload.timeline = true;
            fallbackPayload.commodity = commodityName;
            fallbackPayload.currentPrice = null;
            fallbackPayload.previousPrice = null;
        }
        cleanOldMemoryCache();
        QUERY_CACHE.set(cacheKey, fallbackPayload);
        return Promise.resolve(fallbackPayload);
    }

    // 4. Deduplicate concurrent in-flight requests
    if (IN_FLIGHT_REQUESTS.has(cacheKey)) {
        return IN_FLIGHT_REQUESTS.get(cacheKey);
    }

    // 5. Cache miss -> run query via Python
    const queryPromise = executePythonHistoricalQuery(params, cacheKey)
        .finally(() => {
            IN_FLIGHT_REQUESTS.delete(cacheKey);
        });

    IN_FLIGHT_REQUESTS.set(cacheKey, queryPromise);
    return queryPromise;
}

function fetchHistoricalTimeline(params = {}) {
    return fetchHistoricalPrices({ ...params, timeline: true });
}

/**
 * Returns cache statistics from persistent SQLite storage.
 */
function getCacheStats() {
    const db = getPersistentDb();
    if (!db) {
        return {
            storageType: "sqlite",
            status: "ready",
            memoryCacheEntries: QUERY_CACHE.size,
            persistentDbAvailable: false
        };
    }

    try {
        const totalRow = db.prepare("SELECT count(*) as count FROM historical_query_cache").get();
        const timelineRow = db.prepare("SELECT count(*) as count FROM historical_query_cache WHERE is_timeline = 1").get();
        const metaRows = db.prepare("SELECT key, value FROM system_metadata").all();
        const metadata = {};
        for (const r of metaRows) {
            metadata[r.key] = r.value;
        }

        return {
            storageType: "sqlite",
            status: "ready",
            memoryCacheEntries: QUERY_CACHE.size,
            totalPersistentQueries: totalRow ? totalRow.count : 0,
            timelineQueries: timelineRow ? timelineRow.count : 0,
            tableQueries: totalRow ? (totalRow.count - (timelineRow ? timelineRow.count : 0)) : 0,
            dbPath: DB_PATH,
            autoRefreshDisabled: true,
            metadata
        };
    } catch (err) {
        return {
            storageType: "sqlite",
            status: "error",
            error: err.message,
            memoryCacheEntries: QUERY_CACHE.size
        };
    }
}

module.exports = {
    fetchHistoricalPrices,
    fetchHistoricalTimeline,
    getNormalizedCacheKey,
    getCacheStats
};
