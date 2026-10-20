const path = require("path");
require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const dns = require("dns");
const cors = require("cors");

// Only override DNS if explicitly requested
if (process.env.CUSTOM_DNS === "true") {
    try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch (e) {
        console.warn("⚠️ [WARN] Could not set custom DNS servers:", e.message);
    }
}

const express = require("express");
const priceRoutes = require("./routes/priceRoutes");
const substitutionRoutes = require("./routes/substitutionRoutes");
const imageRoutes = require("./routes/imageRoutes");
const connectDB = require("./config/db");
const { getCacheStats } = require("./services/historicalPriceService");
const { getNutritionStats } = require("./services/substitutionService");
const { getVisionStatus } = require("./services/imageService");
const { prewarmForecastCache, getForecastStats } = require("./services/pricePredictionService");

const app = express();

app.use(express.json());

// Configurable CORS for production frontend origins while preserving local development
const defaultAllowedOrigins = ["https://agri-swap.vercel.app"];
const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
    : [];
const allowedOrigins = configuredOrigins.length > 0
    ? [...new Set([...configuredOrigins, ...defaultAllowedOrigins])]
    : null;

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, health probes, same-origin)
        if (!origin) return callback(null, true);

        // In local development or if CORS_ORIGIN is not specified, allow all origins
        if (!allowedOrigins || allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
            return callback(null, true);
        }

        // Allow localhost and 127.0.0.1 during local testing even if a production domain is set
        const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocal || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("CORS policy violation: Origin not allowed"), false);
    },
    credentials: true
}));

// Mount API routes
app.use("/api/prices", priceRoutes);
app.use("/api/substitutions", substitutionRoutes);
app.use("/api/images", imageRoutes);

// Health check and root endpoints
app.get("/api/health", (req, res) => {
    const cacheStats = getCacheStats();
    const nutritionStats = getNutritionStats();
    const visionStats = getVisionStatus();
    const forecastStats = getForecastStats();
    res.json({
        status: "healthy",
        service: "AGRI-SWAP Backend",
        timestamp: new Date().toISOString(),
        historicalPriceStorage: cacheStats,
        nutritionStorage: nutritionStats,
        visionModel: visionStats,
        forecastStorage: forecastStats
    });
});

app.get("/", (req, res) => {
    res.send("AGRI-SWAP Backend is running");
});

// Asynchronously attempt MongoDB connection without blocking server boot
connectDB().catch((err) => {
    console.warn("⚠️ [WARN] MongoDB initialization error:", err.message);
});

// Start listening on port 5000 (explicit 0.0.0.0 dual-stack IPv4/IPv6)
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
    console.log(`\n====================================================`);
    console.log(`🌱 AGRI-SWAP Backend running on port ${PORT} (${HOST})`);
    console.log(`   Health Check: http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);

    const stats = getCacheStats();
    if (stats.totalPersistentQueries > 0) {
        console.log(`[AGRI-SWAP] Historical price storage ready: ${stats.totalPersistentQueries} queries permanently persisted. Daily auto-refresh is disabled.`);
    } else {
        console.log("[AGRI-SWAP] Historical price storage ready. Queries will be persisted to SQLite on-demand.");
    }

    const nutStats = getNutritionStats();
    if (nutStats.ready) {
        console.log(`[AGRI-SWAP] Persistent nutrition store ready: ${nutStats.totalProfiles} food profiles active in SQLite. Daily auto-refresh is disabled.`);
    } else {
        console.warn(`⚠️ [WARN] Nutrition store not ready: ${nutStats.error || 'Database missing at ' + nutStats.dbPath}`);
    }

    // Safely pre-warm persistent LSTM forecast cache in background without blocking startup
    prewarmForecastCache().catch((err) => {
        console.warn("⚠️ [WARN] Initial forecast pre-warming error:", err.message);
    });
});

// Explicit error handler for port conflicts (EADDRINUSE) and startup failures
server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\n❌ [STARTUP FAILURE] Port ${PORT} is already bound by another process.`);
        console.error(`   A duplicate backend process may already be running.`);
        console.error(`   To identify and terminate the process holding port ${PORT}:`);
        console.error(`   PowerShell: Get-NetTCPConnection -LocalPort ${PORT} | Select-Object OwningProcess`);
        console.error(`   Windows CMD: netstat -ano | findstr :${PORT}\n`);
        process.exit(1);
    } else {
        console.error(`\n❌ [STARTUP FAILURE] Server failed to start:`, err.message);
        process.exit(1);
    }
});

// Safe global process error handlers to prevent silent crashes
process.on("unhandledRejection", (reason) => {
    console.error("⚠️ [UNHANDLED REJECTION]", reason?.stack || reason?.message || reason);
});

process.on("uncaughtException", (err) => {
    console.error("❌ [UNCAUGHT EXCEPTION]", err?.stack || err?.message || err);
});

// Graceful shutdown handlers
process.on("SIGINT", () => {
    console.log("\n[AGRI-SWAP] Gracefully shutting down backend server...");
    server.close(() => {
        console.log("[AGRI-SWAP] Server stopped cleanly.");
        process.exit(0);
    });
});

process.on("SIGTERM", () => {
    console.log("\n[AGRI-SWAP] SIGTERM received. Closing backend server...");
    server.close(() => {
        process.exit(0);
    });
});