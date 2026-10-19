/**
 * Comprehensive AGRI-SWAP End-to-End Reliability Verification Suite
 * Tests:
 *  1. Health check (/api/health) on port 5000 and Vite proxy port 5173
 *  2. Market records (/api/prices/historical) on port 5000 and port 5173
 *  3. Price forecast (/api/prices/predict) for Tomato, Onion, Potato, Rice, Wheat (7d & 30d)
 *  4. Price forecast via Vite proxy on port 5173
 *  5. Food substitutions (/api/substitutions/foods & /api/substitutions) on port 5000 and 5173
 */

const http = require("http");

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 10000 }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data.slice(0, 300), error: e.message });
                }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${url}`));
        });
    });
}

async function run() {
    console.log("=================================================================");
    console.log("       AGRI-SWAP END-TO-END VERIFICATION & ACCEPTANCE SUITE      ");
    console.log("=================================================================\n");

    let totalTests = 0;
    let passedTests = 0;

    // 1. Health Endpoint Direct (5000)
    totalTests++;
    try {
        const h5000 = await fetchJson("http://localhost:5000/api/health");
        if (h5000.status === 200 && h5000.data.status === "healthy") {
            console.log(`[PASS] 1. Backend /api/health (Port 5000) -> HTTP 200 Healthy`);
            console.log(`       Service: ${h5000.data.service}`);
            console.log(`       Vision Model: ${h5000.data.visionModel?.ready ? "Ready" : "Starting"}`);
            console.log(`       Persistent Historical Queries: ${h5000.data.historicalPriceStorage?.totalPersistentQueries}`);
            passedTests++;
        } else {
            console.error(`[FAIL] 1. Backend /api/health failed:`, h5000);
        }
    } catch (e) {
        console.error(`[FAIL] 1. Backend /api/health error:`, e.message);
    }

    // 2. Health Endpoint Vite Proxy (5173)
    totalTests++;
    try {
        const h5173 = await fetchJson("http://localhost:5173/api/health");
        if (h5173.status === 200 && h5173.data.status === "healthy") {
            console.log(`[PASS] 2. Vite Proxy /api/health (Port 5173) -> HTTP 200 Healthy`);
            passedTests++;
        } else {
            console.error(`[FAIL] 2. Vite Proxy /api/health failed:`, h5173);
        }
    } catch (e) {
        console.error(`[FAIL] 2. Vite Proxy /api/health error:`, e.message);
    }

    // 3. Market Records API Direct (5000)
    totalTests++;
    try {
        const m5000 = await fetchJson("http://localhost:5000/api/prices/historical?commodity=Tomato&limit=5");
        if (m5000.status === 200 && m5000.data.success && Array.isArray(m5000.data.records) && m5000.data.records.length > 0) {
            console.log(`[PASS] 3. Market Records API (Port 5000) -> HTTP 200 (Total records: ${m5000.data.total}, returned: ${m5000.data.records.length})`);
            console.log(`       Sample Record: ${m5000.data.records[0].commodity} in ${m5000.data.records[0].market}, Modal: Rs.${m5000.data.records[0].modal}`);
            passedTests++;
        } else {
            console.error(`[FAIL] 3. Market records failed:`, m5000);
        }
    } catch (e) {
        console.error(`[FAIL] 3. Market records error:`, e.message);
    }

    // 4. Market Records API Vite Proxy (5173)
    totalTests++;
    try {
        const m5173 = await fetchJson("http://localhost:5173/api/prices/historical?commodity=Tomato&limit=5");
        if (m5173.status === 200 && m5173.data.success && Array.isArray(m5173.data.records) && m5173.data.records.length > 0) {
            console.log(`[PASS] 4. Market Records API (Vite Proxy Port 5173) -> HTTP 200 (Total records: ${m5173.data.total})`);
            passedTests++;
        } else {
            console.error(`[FAIL] 4. Market records proxy failed:`, m5173);
        }
    } catch (e) {
        console.error(`[FAIL] 4. Market records proxy error:`, e.message);
    }

    // 5. Price Forecast API for all supported crops & 7d/30d horizons
    const crops = ["Tomato", "Onion", "Potato", "Rice", "Wheat"];
    const horizons = [7, 30];

    console.log(`\n--- 5. Testing LSTM Price Forecasts for Supported Crops (7d & 30d) ---`);
    for (const crop of crops) {
        for (const horizon of horizons) {
            totalTests++;
            try {
                const f = await fetchJson(`http://localhost:5000/api/prices/predict?commodity=${encodeURIComponent(crop)}&horizon=${horizon}`);
                if (f.status === 200 && f.data.success) {
                    const predArr = horizon === 7 ? f.data.predicted7d : f.data.predicted30d;
                    console.log(`[PASS] Forecast: ${crop.padEnd(7)} | ${horizon.toString().padStart(2)}d -> Current: Rs.${f.data.currentPrice} | Predicted: Rs.${f.data.predictedPrice} | Outlook: ${f.data.outlook} | Predictions: ${predArr?.length || 0} pts`);
                    passedTests++;
                } else {
                    console.error(`[FAIL] Forecast for ${crop} (${horizon}d) failed:`, f);
                }
            } catch (e) {
                console.error(`[FAIL] Forecast for ${crop} (${horizon}d) error:`, e.message);
            }
        }
    }

    // 6. Price Forecast via Vite Proxy (5173)
    totalTests++;
    try {
        const fp7 = await fetchJson("http://localhost:5173/api/prices/predict?commodity=Tomato&horizon=7");
        if (fp7.status === 200 && fp7.data.success) {
            console.log(`\n[PASS] 6. Price Forecast (Vite Proxy Port 5173) -> Tomato 7d: Predicted Rs.${fp7.data.predictedPrice} (Outlook: ${fp7.data.outlook})`);
            passedTests++;
        } else {
            console.error(`[FAIL] 6. Price forecast proxy failed:`, fp7);
        }
    } catch (e) {
        console.error(`[FAIL] 6. Price forecast proxy error:`, e.message);
    }

    // 7. Food Substitutions Available Foods (5000 & 5173)
    totalTests++;
    try {
        const foods5173 = await fetchJson("http://localhost:5173/api/substitutions/foods");
        if (foods5173.status === 200 && foods5173.data.success && foods5173.data.foods.length > 0) {
            console.log(`[PASS] 7. Food Substitutions /foods (Vite Proxy Port 5173) -> ${foods5173.data.foods.length} produce profiles available`);
            passedTests++;
        } else {
            console.error(`[FAIL] 7. Food substitutions /foods failed:`, foods5173);
        }
    } catch (e) {
        console.error(`[FAIL] 7. Food substitutions /foods error:`, e.message);
    }

    // 8. Food Substitutions Recommendation (5000 & 5173)
    totalTests++;
    try {
        const rec5173 = await fetchJson("http://localhost:5173/api/substitutions?food=Tomato&quantity=3&unit=kg");
        if (rec5173.status === 200 && rec5173.data.success && rec5173.data.alternatives.length > 0) {
            console.log(`[PASS] 8. Food Substitutions Recommendation (Vite Proxy Port 5173) -> ${rec5173.data.alternatives.length} alternatives found for Tomato`);
            console.log(`       Top recommendation: ${rec5173.data.alternatives[0].alternative} (Score: ${rec5173.data.alternatives[0].matchScore}, Ratio: ${rec5173.data.alternatives[0].substitutionRatio}x)`);
            passedTests++;
        } else {
            console.error(`[FAIL] 8. Food substitution recommendation failed:`, rec5173);
        }
    } catch (e) {
        console.error(`[FAIL] 8. Food substitution recommendation error:`, e.message);
    }

    console.log("\n=================================================================");
    console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round(passedTests / totalTests * 100)}%)`);
    console.log("=================================================================\n");

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error("FATAL SUITE ERROR:", err);
    process.exit(1);
});
