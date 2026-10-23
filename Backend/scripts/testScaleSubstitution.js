const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("AGRI-SWAP: scaleSubstitution() TARGETED TEST SUITE");
console.log("=================================================");

// Extract and test the exact scaleSubstitution function from substitutionService.js
const servicePath = path.resolve(__dirname, "../services/substitutionService.js");
const serviceCode = fs.readFileSync(servicePath, "utf8");
const fnMatch = serviceCode.match(/function scaleSubstitution\([\s\S]*?\n\}/);
if (!fnMatch) {
    throw new Error("Could not extract scaleSubstitution function from substitutionService.js");
}

const scaleSubstitution = new Function(
    "baseData", "newQty", "unit",
    fnMatch[0] + "\nreturn scaleSubstitution(baseData, newQty, unit);"
);

function createMock(priceProps) {
    return {
        success: true,
        originalFood: {
            name: "Cauliflower",
            quantity: 1,
            unit: "kg",
            totalCost: 17.3,
            priceRisk: "Unknown",
            nutrition: { calories: 25 },
            ...priceProps
        },
        preference: "balanced",
        count: 1,
        alternatives: [
            {
                alternative: "Cabbage",
                substitutionRatio: 0.25,
                recommendedQuantity: 0.25,
                unit: "kg",
                alternativePricePerKg: 14.0,
                alternativeTotalCost: 3.5,
                estimatedSavings: 13.8,
                savingsPercent: 79.8,
                whyRecommended: ["Estimated savings of Rs. 13.8 (79.8% lower cost for 0.25 kg)"]
            }
        ]
    };
}

const testSuites = [
    {
        name: "Case 1: Standard pricePerKg only (Python direct output)",
        props: { pricePerKg: 20.0 }
    },
    {
        name: "Case 2: Legacy estimatedPricePerKg only",
        props: { estimatedPricePerKg: 20.0 }
    },
    {
        name: "Case 3: Both pricePerKg and estimatedPricePerKg present",
        props: { pricePerKg: 20.0, estimatedPricePerKg: 20.0 }
    }
];

const testQuantities = [1, 5, 0.5];
let passed = 0;
let total = 0;

for (const suite of testSuites) {
    console.log(`\n[Suite] ${suite.name}`);
    for (const q of testQuantities) {
        total++;
        const base = createMock(suite.props);
        const result = scaleSubstitution(base, q, "kg");

        const expectedTotal = Math.round(20.0 * q * 10) / 10;
        const expectedRecQty = Math.round(q * 0.25 * 100) / 100;
        const expectedAltCost = Math.round(14.0 * expectedRecQty * 10) / 10;
        const expectedSavings = Math.round((expectedTotal - expectedAltCost) * 10) / 10;
        const expectedSavingsPct = Math.round((expectedSavings / expectedTotal) * 1000) / 10;

        assert.strictEqual(result.originalFood.quantity, q, `Quantity should be ${q}`);
        assert.strictEqual(result.originalFood.totalCost, expectedTotal, `totalCost should be ${expectedTotal}`);
        assert.strictEqual(result.originalFood.totalEstimatedCost, expectedTotal, `totalEstimatedCost should be ${expectedTotal}`);

        const alt = result.alternatives[0];
        assert.strictEqual(alt.recommendedQuantity, expectedRecQty, `Alt qty should be ${expectedRecQty}`);
        assert.strictEqual(alt.alternativeTotalCost, expectedAltCost, `Alt cost should be ${expectedAltCost}`);
        assert.strictEqual(alt.estimatedSavings, expectedSavings, `Savings should be ${expectedSavings}`);
        assert.strictEqual(alt.savingsPercent, expectedSavingsPct, `Savings percent should be ${expectedSavingsPct}`);

        console.log(`  PASS: Quantity ${q} kg -> totalCost: ${result.originalFood.totalCost}, totalEstimatedCost: ${result.originalFood.totalEstimatedCost}, altCost: ${alt.alternativeTotalCost}, savings: ${alt.estimatedSavings}`);
        passed++;
    }
}

// 4. Test edge case: null or zero price
total++;
console.log("\n[Suite] Edge Case: Null price handling");
const nullPriceMock = createMock({ pricePerKg: null, estimatedPricePerKg: null });
const nullResult = scaleSubstitution(nullPriceMock, 3, "kg");
assert.strictEqual(nullResult.originalFood.totalCost, null);
assert.strictEqual(nullResult.originalFood.totalEstimatedCost, null);
assert.strictEqual(nullResult.alternatives[0].alternativeTotalCost, null);
console.log("  PASS: Null price handled cleanly without exceptions");
passed++;

console.log("\n=================================================");
console.log(`ALL TARGETED TESTS PASSED: ${passed} / ${total} (100%)`);
console.log("=================================================");
