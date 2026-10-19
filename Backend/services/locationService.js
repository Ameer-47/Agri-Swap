const fs = require("fs");
const path = require("path");

let cachedData = null;

/**
 * Loads the location hierarchy extracted from the cleaned agricultural price dataset.
 */
function loadLocationData() {
    if (cachedData) {
        return cachedData;
    }

    const filePath = path.join(__dirname, "../data/locations.json");

    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Location data file not found at ${filePath}. Please run Backend/scripts/generateLocations.py to generate it from the cleaned dataset.`
        );
    }

    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        cachedData = JSON.parse(raw);
        return cachedData;
    } catch (err) {
        console.error("Failed to load location data:", err);
        throw err;
    }
}

/**
 * Returns distinct states available in the cleaned price dataset.
 *
 * @returns {Array<string>} Alphabetically sorted state names
 */
function getStates() {
    const data = loadLocationData();
    return data.states || [];
}

/**
 * Returns distinct districts for a given state.
 *
 * @param {string} stateName - Target state name (e.g. "Tamil Nadu")
 * @returns {Array<string>} Alphabetically sorted district names
 */
function normalizeState(stateName) {
    if (!stateName || stateName === "All") return null;
    if (stateName === "Delhi" || stateName === "NCT of Delhi") return "NCT of Delhi";
    return stateName;
}

/**
 * Returns distinct districts for a given state.
 *
 * @param {string} stateName - Target state name (e.g. "Tamil Nadu")
 * @returns {Array<string>} Alphabetically sorted district names
 */
function getDistricts(stateName) {
    const resolvedState = normalizeState(stateName);
    if (!resolvedState) {
        return [];
    }
    const data = loadLocationData();
    const stateObj = data.hierarchy ? data.hierarchy[resolvedState] : null;
    return stateObj ? stateObj.districts : [];
}

/**
 * Returns distinct markets for a given state and optional district.
 *
 * @param {string} stateName - Target state name
 * @param {string} [districtName] - Optional district name
 * @returns {Array<string>} Alphabetically sorted market mandi names
 */
function getMarkets(stateName, districtName) {
    const resolvedState = normalizeState(stateName);
    if (!resolvedState) {
        return [];
    }
    const data = loadLocationData();
    const stateObj = data.hierarchy ? data.hierarchy[resolvedState] : null;
    if (!stateObj) {
        return [];
    }

    if (districtName && districtName !== "All") {
        return stateObj.district_to_markets[districtName] || [];
    }

    return stateObj.markets || [];
}

/**
 * Unified resolver for dependent location filters.
 *
 * @param {string} [state] - Selected state
 * @param {string} [district] - Selected district
 * @returns {Object} { states, districts, markets, selectedState, selectedDistrict }
 */
function getDependentLocations(state, district) {
    const allStates = getStates();
    const normalizedState = (state && state !== "All") ? state : null;
    const resolvedState = normalizeState(normalizedState);
    const normalizedDistrict = (district && district !== "All") ? district : null;

    let availableDistricts = [];
    let availableMarkets = [];

    if (resolvedState) {
        availableDistricts = getDistricts(resolvedState);

        if (normalizedDistrict && availableDistricts.includes(normalizedDistrict)) {
            availableMarkets = getMarkets(resolvedState, normalizedDistrict);
        } else {
            // When only state is selected (or district is "All"), show all markets in the state
            availableMarkets = getMarkets(resolvedState);
        }
    }

    return {
        states: allStates,
        districts: availableDistricts,
        markets: availableMarkets,
        selectedState: normalizedState || "All",
        selectedDistrict: (normalizedDistrict && availableDistricts.includes(normalizedDistrict)) ? normalizedDistrict : "All"
    };
}

/**
 * Returns distinct commodities available in the cleaned price dataset.
 *
 * @returns {Array<string>} Alphabetically sorted commodity names
 */
function getCommodities() {
    const data = loadLocationData();
    return data.commodities || [];
}

module.exports = {
    getStates,
    getDistricts,
    getMarkets,
    getDependentLocations,
    getCommodities
};
