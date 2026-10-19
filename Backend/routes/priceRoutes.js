const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const Price = require("../models/Price");
const { getLSTMPrediction, prewarmForecastCache } = require("../services/pricePredictionService");
const {
    getStates,
    getDistricts,
    getMarkets,
    getDependentLocations,
    getCommodities
} = require("../services/locationService");
const { 
    fetchHistoricalPrices, 
    fetchHistoricalTimeline, 
    getCacheStats 
} = require("../services/historicalPriceService");

const router = express.Router();

/**
 * GET /api/prices/cache-stats
 * Returns persistence status, cached query counts, and metadata.
 */
router.get("/cache-stats", (req, res) => {
    try {
        const stats = getCacheStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch cache statistics",
            error: error.message
        });
    }
});

/**
 * POST /api/prices/backfill
 * Explicit manual backfill / refresh mechanism.
 * Query or body options: force=true, commodity=Tomato
 */
router.post("/backfill", (req, res) => {
    try {
        const force = req.query.force === "true" || req.body?.force === true;
        const commodity = req.query.commodity || req.body?.commodity;
        const scriptPath = path.join(__dirname, "../scripts/backfillHistoricalPrices.py");
        const projectRoot = path.join(__dirname, "../..");

        const args = [scriptPath];
        if (force) args.push("--force");
        if (commodity) args.push(`--commodity=${commodity}`);

        const pythonCmd = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");
        const child = spawn(pythonCmd, args, {
            cwd: projectRoot,
            env: { ...process.env, PYTHONPATH: projectRoot }
        });

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (d) => { output += d.toString(); });
        child.stderr.on("data", (d) => { errorOutput += d.toString(); });

        child.on("close", (code) => {
            if (code !== 0) {
                return res.status(500).json({
                    success: false,
                    message: "Manual backfill failed",
                    error: errorOutput || `Process exited with code ${code}`
                });
            }
            try {
                // Find last JSON line from output
                const lines = output.trim().split("\n");
                const lastLine = lines[lines.length - 1];
                const parsed = JSON.parse(lastLine);
                res.json({
                    success: true,
                    message: "Manual backfill completed successfully",
                    result: parsed
                });
                prewarmForecastCache(commodity ? [commodity] : undefined).catch(() => {});
            } catch (err) {
                res.json({
                    success: true,
                    message: "Manual backfill finished",
                    rawOutput: output.trim()
                });
                prewarmForecastCache(commodity ? [commodity] : undefined).catch(() => {});
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to initiate manual backfill",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/locations
 * Returns dependent distinct states, districts, and markets from the cleaned dataset.
 * Query parameters:
 *   - state: string (optional)
 *   - district: string (optional)
 */
router.get("/locations", (req, res) => {
    try {
        const { state, district } = req.query;
        const locations = getDependentLocations(state, district);
        res.json({
            success: true,
            ...locations
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch location hierarchy",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/locations/states
 * Returns all distinct states available in the cleaned price dataset.
 */
router.get("/locations/states", (req, res) => {
    try {
        const states = getStates();
        res.json({
            success: true,
            count: states.length,
            states
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch states",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/locations/districts
 * Returns distinct districts for a specific state.
 */
router.get("/locations/districts", (req, res) => {
    try {
        const { state } = req.query;
        const districts = getDistricts(state);
        res.json({
            success: true,
            state: state || null,
            count: districts.length,
            districts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch districts",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/locations/markets
 * Returns distinct markets for a specific state and optional district.
 */
router.get("/locations/markets", (req, res) => {
    try {
        const { state, district } = req.query;
        const markets = getMarkets(state, district);
        res.json({
            success: true,
            state: state || null,
            district: district || null,
            count: markets.length,
            markets
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch markets",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/commodities
 * Returns all distinct commodities available across the cleaned price dataset.
 */
router.get("/commodities", (req, res) => {
    try {
        const commodities = getCommodities();
        res.json({
            success: true,
            count: commodities.length,
            commodities
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch commodities",
            error: error.message
        });
    }
});

/**
 * GET /api/prices/predict
 * Generates forward price predictions using the trained PyTorch LSTM model.
 * Query parameters:
 *   - commodity: string (e.g. "Tomato", "Onion", "Potato", "Rice", "Wheat")
 *   - horizon: number (7 or 30 days)
 */
router.get("/predict", async (req, res) => {
    try {
        const commodity = req.query.commodity || "Tomato";
        const horizon = parseInt(req.query.horizon, 10) || 7;

        // Support batch prediction for basket commodities to eliminate network round-trips
        if (typeof commodity === "string" && commodity.includes(",")) {
            const list = commodity.split(",").map(c => c.trim()).filter(Boolean);
            const results = await Promise.all(
                list.map(async (c) => {
                    try {
                        const pred = await getLSTMPrediction(c, horizon);
                        return { commodity: c, data: pred };
                    } catch (err) {
                        return { commodity: c, data: null, error: err.message };
                    }
                })
            );
            const predictions = {};
            for (const r of results) {
                if (r.data && r.data.success) {
                    predictions[r.commodity] = r.data;
                }
            }
            return res.json({
                success: true,
                forecastAvailable: Object.keys(predictions).length > 0,
                horizon: `${horizon}d`,
                predictions
            });
        }

        const predictionResult = await getLSTMPrediction(commodity, horizon);

        if (!predictionResult || !predictionResult.success) {
            return res.status(500).json({
                success: false,
                message: predictionResult?.error || "LSTM prediction failed"
            });
        }

        res.json(predictionResult);
    } catch (error) {
        console.error("LSTM prediction error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate LSTM price prediction",
            error: process.env.NODE_ENV === "production" ? "Forecasting model failure" : error.message
        });
    }
});

/**
 * GET /api/prices/timeline
 * Queries chronological daily modal price records across recorded mandis for any commodity.
 * Supports: commodity, state, district, market, dateRange
 */
router.get("/timeline", async (req, res) => {
    try {
        const result = await fetchHistoricalTimeline(req.query);
        res.json(result);
    } catch (error) {
        console.error("Timeline query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch historical price timeline",
            error: process.env.NODE_ENV === "production" ? "Unable to query price timeline" : error.message,
            records: [],
            count: 0
        });
    }
});

/**
 * GET /api/prices/historical
 * Queries actual historical price records from the cleaned agricultural parquet dataset.
 * Supports: commodity, state, district, market, dateRange, search, sortField, sortOrder, page, limit
 */
router.get("/historical", async (req, res) => {
    try {
        if (req.query.timeline === "true" || req.query.timeline === true) {
            const result = await fetchHistoricalTimeline(req.query);
            return res.json(result);
        }
        const result = await fetchHistoricalPrices(req.query);
        res.json(result);
    } catch (error) {
        console.error("Historical price query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch historical market prices",
            error: process.env.NODE_ENV === "production" ? "Unable to query market price dataset" : error.message,
            records: [],
            total: 0
        });
    }
});

/**
 * GET /api/prices
 * Default price route: returns historical price records from the cleaned parquet dataset.
 */
router.get("/", async (req, res) => {
    try {
        const result = await fetchHistoricalPrices(req.query);
        res.json(result);
    } catch (error) {
        console.error("Price query error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch prices",
            error: process.env.NODE_ENV === "production" ? "Unable to query market price dataset" : error.message,
            records: [],
            total: 0
        });
    }
});

module.exports = router;