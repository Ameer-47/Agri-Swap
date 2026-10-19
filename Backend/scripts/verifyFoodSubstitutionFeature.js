const http = require('http');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    reject(new Error(`Failed to parse JSON (status ${res.statusCode}): ${body.slice(0, 200)}`));
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log("=================================================");
    console.log("AGRI-SWAP FOOD SUBSTITUTION COMPREHENSIVE VERIFICATION");
    console.log("=================================================\n");

    let testsPassed = 0;
    let testsTotal = 0;

    // Test 1: GET /api/substitutions/foods
    testsTotal++;
    console.log("[Test 1] Available Foods Endpoint (/api/substitutions/foods)...");
    try {
        const res = await fetchJson('http://localhost:5000/api/substitutions/foods');
        if (res.status === 200 && res.data.success && Array.isArray(res.data.foods) && res.data.foods.length === 204) {
            console.log(`✓ PASS: Returned all ${res.data.foods.length} distinct substitution foods.`);
            console.log(`  Sample foods: ${res.data.foods.slice(0, 5).map(f => f.name).join(', ')}`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Unexpected response (count: ${res?.data?.foods?.length}, expected: 204)`, res);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    // Test 2: Tomato Substitution (Balanced)
    testsTotal++;
    console.log("\n[Test 2] Single Food Substitution - Tomato (3 kg, Balanced)...");
    try {
        const res = await fetchJson('http://localhost:5000/api/substitutions?food=Tomato&quantity=3&unit=kg&preference=balanced');
        if (res.status === 200 && res.data.success && res.data.count > 0) {
            const orig = res.data.originalFood;
            const top = res.data.alternatives[0];
            console.log(`✓ PASS: Returned ${res.data.count} ranked alternatives.`);
            console.log(`  Original: ${orig.name} (${orig.quantity} ${orig.unit}) @ ₹${orig.pricePerKg}/kg = ₹${orig.totalCost}`);
            console.log(`  Top Match: #${1} ${top.alternative} (Ratio: ${top.substitutionRatio}x, Recommended: ${top.recommendedQuantity} ${top.unit})`);
            console.log(`  Scores: Match=${top.matchScore}, Nutrition=${top.nutritionSimilarity}%, Price=${top.priceSuitability}%, Cooking=${top.cookingSimilarity}%`);
            console.log(`  Savings: ₹${top.estimatedSavings} (${top.savingsPercent}%)`);
            console.log(`  Explainability reasons: ${top.whyRecommended.length} bullets`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Unexpected response`, res);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    // Test 3: Potato Substitution (Different Preferences: Nutrition vs Price)
    testsTotal++;
    console.log("\n[Test 3] Preference Strategies - Potato (Nutrition vs Savings)...");
    try {
        const resNut = await fetchJson('http://localhost:5000/api/substitutions?food=Potato&quantity=5&unit=kg&preference=nutrition');
        const resPrice = await fetchJson('http://localhost:5000/api/substitutions?food=Potato&quantity=5&unit=kg&preference=price');

        if (resNut.status === 200 && resPrice.status === 200) {
            console.log(`✓ PASS: Successfully generated recommendations for both preference strategies.`);
            console.log(`  Top Nutrition Match for Potato: ${resNut.data.alternatives[0].alternative} (Nut Score: ${resNut.data.alternatives[0].nutritionSimilarity}%)`);
            console.log(`  Top Savings Match for Potato: ${resPrice.data.alternatives[0].alternative} (Price Score: ${resPrice.data.alternatives[0].priceSuitability}%)`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Strategy comparison failed`);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    // Test 4: Onion & Spinach Substitutions
    testsTotal++;
    console.log("\n[Test 4] Additional Commodities - Onion & Spinach...");
    try {
        const resOnion = await fetchJson('http://localhost:5000/api/substitutions?food=Onion&quantity=2&unit=kg&preference=balanced');
        const resSpinach = await fetchJson('http://localhost:5000/api/substitutions?food=Spinach&quantity=1&unit=kg&preference=balanced');

        if (resOnion.data.success && resSpinach.data.success) {
            console.log(`✓ PASS: Onion alternatives (${resOnion.data.count}): Top = ${resOnion.data.alternatives[0].alternative} (Score: ${resOnion.data.alternatives[0].matchScore})`);
            console.log(`✓ PASS: Spinach alternatives (${resSpinach.data.count}): Top = ${resSpinach.data.alternatives[0].alternative} (Score: ${resSpinach.data.alternatives[0].matchScore})`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Onion or Spinach query failed`);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    // Test 5: Missing / Unsupported food graceful handling
    testsTotal++;
    console.log("\n[Test 5] Missing Data / Unsupported Crop Handling...");
    try {
        const resUnknown = await fetchJson('http://localhost:5000/api/substitutions?food=Dragonfruit&quantity=1&unit=kg');
        if (resUnknown.status === 200 && resUnknown.data.success === false && resUnknown.data.count === 0) {
            console.log(`✓ PASS: Gracefully returned empty result with message: "${resUnknown.data.message}"`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Did not handle unsupported crop properly`, resUnknown);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    // Test 6: Legacy User Basket Compatibility (U001)
    testsTotal++;
    console.log("\n[Test 6] Legacy User Basket Compatibility (/api/substitutions?userId=U001)...");
    try {
        const resBasket = await fetchJson('http://localhost:5000/api/substitutions?userId=U001');
        if (resBasket.status === 200 && Array.isArray(resBasket.data.recommendations) && resBasket.data.recommendations.length > 0) {
            console.log(`✓ PASS: Legacy user basket recommendations returned ${resBasket.data.recommendations.length} items without regressions.`);
            testsPassed++;
        } else {
            console.error(`✗ FAIL: Legacy user basket failed`, resBasket);
        }
    } catch (e) {
        console.error(`✗ FAIL: ${e.message}`);
    }

    console.log("\n=================================================");
    console.log(`FINAL RESULT: ${testsPassed}/${testsTotal} TESTS PASSED`);
    console.log("=================================================");

    if (testsPassed === testsTotal) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests();
