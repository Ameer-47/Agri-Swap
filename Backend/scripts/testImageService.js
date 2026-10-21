/**
 * Verification Script: AGRI-SWAP Vision Service Client
 * Validates:
 *  1. Normalization of URL when /predict is included (the production issue)
 *  2. Trailing slash sanitization
 *  3. Environment variable fallback aliases (VISION_URL, VISION_SERVICE_URL, etc.)
 *  4. Production fallback to DEFAULT_PRODUCTION_VISION_URL when env var is missing
 *  5. Local development fallback to DEFAULT_LOCAL_VISION_URL
 *  6. getVisionStatus() payload structure
 *  7. Live connectivity to deployed vision service on Render (https://agri-swap-vision.onrender.com)
 */

const assert = require("assert");

// Clear all vision-related environment variables for deterministic testing
const ENV_VARS = [
    "VISION_INFERENCE_URL",
    "VISION_URL",
    "VISION_SERVICE_URL",
    "VISION_ENDPOINT",
    "VISION_INFERENCE_ENDPOINT",
    "IMAGE_INFERENCE_URL",
    "IMAGE_SERVICE_URL"
];

function clearEnv() {
    for (const v of ENV_VARS) {
        delete process.env[v];
    }
}

async function runTests() {
    console.log("=====================================================");
    console.log("   AGRI-SWAP Image Service Client Verification Test  ");
    console.log("=====================================================\n");

    let total = 0;
    let passed = 0;

    // Fresh require
    let imageService = require("../services/imageService");

    // Test 1: User's exact Render configuration: URL with /predict appended
    total++;
    try {
        clearEnv();
        process.env.VISION_INFERENCE_URL = "https://agri-swap-vision.onrender.com/predict";
        process.env.NODE_ENV = "production";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.configured, true, "Status must be configured");
        assert.strictEqual(status.inferenceUrl, "https://agri-swap-vision.onrender.com", "Must strip /predict");
        console.log(" [PASS] 1. Strips /predict from VISION_INFERENCE_URL -> https://agri-swap-vision.onrender.com");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 1. Failed to strip /predict:", e.message);
    }

    // Test 2: URL with trailing slashes and /predict/
    total++;
    try {
        clearEnv();
        process.env.VISION_INFERENCE_URL = "https://agri-swap-vision.onrender.com/predict/";
        process.env.NODE_ENV = "production";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.inferenceUrl, "https://agri-swap-vision.onrender.com");
        console.log(" [PASS] 2. Handles trailing slash in /predict/ correctly");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 2. Trailing slash test failed:", e.message);
    }

    // Test 3: Clean base URL without /predict
    total++;
    try {
        clearEnv();
        process.env.VISION_INFERENCE_URL = "https://agri-swap-vision.onrender.com";
        process.env.NODE_ENV = "production";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.inferenceUrl, "https://agri-swap-vision.onrender.com");
        console.log(" [PASS] 3. Preserves clean base URL without modification");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 3. Clean base URL failed:", e.message);
    }

    // Test 4: Alias environment variables (e.g. VISION_URL)
    total++;
    try {
        clearEnv();
        process.env.VISION_URL = "https://custom-vision.example.com/predict";
        process.env.NODE_ENV = "production";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.inferenceUrl, "https://custom-vision.example.com");
        console.log(" [PASS] 4. Recognizes VISION_URL alias");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 4. VISION_URL alias failed:", e.message);
    }

    // Test 5: Production fallback when no env var is set
    total++;
    try {
        clearEnv();
        process.env.NODE_ENV = "production";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.configured, true, "Should be configured via fallback in production");
        assert.strictEqual(status.inferenceUrl, "https://agri-swap-vision.onrender.com", "Fallback to default production microservice URL");
        console.log(" [PASS] 5. Production fallback succeeds when env var is omitted");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 5. Production fallback failed:", e.message);
    }

    // Test 6: Development fallback when no env var is set
    total++;
    try {
        clearEnv();
        process.env.NODE_ENV = "development";
        const status = imageService.getVisionStatus();
        assert.strictEqual(status.configured, true);
        assert.strictEqual(status.inferenceUrl, "http://127.0.0.1:5001");
        console.log(" [PASS] 6. Development fallback correctly defaults to http://127.0.0.1:5001");
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 6. Development fallback failed:", e.message);
    }

    // Test 7: Live connection check against deployed microservice
    total++;
    try {
        clearEnv();
        process.env.VISION_INFERENCE_URL = "https://agri-swap-vision.onrender.com/predict";
        process.env.NODE_ENV = "production";
        console.log("\nProbing live vision microservice on Render (https://agri-swap-vision.onrender.com/health)...");
        const health = await imageService.checkVisionHealth();
        if (!health.online) {
            console.error("Health probe returned offline:", JSON.stringify(health));
        }
        assert.strictEqual(health.online, true, "Remote microservice should be online");
        assert.strictEqual(health.ready, true, "Remote microservice should report ready");
        console.log(` [PASS] 7. Live health probe succeeded:`);
        console.log(`       - Service: ${health.service}`);
        console.log(`       - Model:   ${health.model}`);
        console.log(`       - Runtime: ${health.runtime}`);
        console.log(`       - Classes: ${health.classesCount}`);
        passed++;
    } catch (e) {
        console.error("❌ [FAIL] 7. Live health probe failed:", e.message);
    }

    console.log("\n=====================================================");
    console.log(`Result: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
    console.log("=====================================================\n");

    if (passed !== total) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Unexpected test failure:", err);
    process.exit(1);
});
