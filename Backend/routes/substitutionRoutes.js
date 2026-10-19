const express = require("express");
const {
    getSubstitutionRecommendations,
    getFoodSubstitutions,
    getAvailableFoods
} = require("../services/substitutionService");

const router = express.Router();

// GET /api/substitutions/foods - List all distinct available foods for substitution
router.get("/foods", async (req, res) => {
    try {
        const result = await getAvailableFoods();
        res.json(result);
    } catch (error) {
        console.error("Error fetching available foods:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load available foods for substitution",
            error: process.env.NODE_ENV === "production" ? "Unable to retrieve food list" : error.message
        });
    }
});

// GET /api/substitutions - Query substitutions for a single food or for user basket
router.get("/", async (req, res) => {
    try {
        const { food, quantity, unit, preference, userId } = req.query;

        if (food) {
            const parsedQuantity = parseFloat(quantity);
            const validQuantity = (!isNaN(parsedQuantity) && parsedQuantity > 0) ? parsedQuantity : 1.0;
            const validUnit = (unit && typeof unit === "string") ? unit.trim() : "kg";
            const validPreference = (preference && typeof preference === "string") ? preference.trim() : "balanced";

            const result = await getFoodSubstitutions({
                food: food.trim(),
                quantity: validQuantity,
                unit: validUnit,
                preference: validPreference
            });

            return res.json(result);
        }

        if (userId) {
            const result = await getSubstitutionRecommendations(userId);
            const parsedResult = JSON.parse(result);
            return res.json(parsedResult);
        }

        return res.status(400).json({
            success: false,
            message: "Either 'food' or 'userId' query parameter is required."
        });
    } catch (error) {
        console.error("Error generating substitution recommendations:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate substitution recommendations",
            error: process.env.NODE_ENV === "production" ? "Substitution engine failure" : error.message
        });
    }
});

module.exports = router;