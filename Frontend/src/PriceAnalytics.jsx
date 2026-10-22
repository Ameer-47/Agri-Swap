import React, { useState, useEffect, useMemo, useRef } from "react";
import "./PriceAnalytics.css";
import { getApiEndpoints } from "./apiConfig";

// Demo Agricultural Commodity Dataset
const COMMODITIES_DATA = {
  Tomato: {
    name: "Tomato",
    icon: "🍅",
    currentPrice: 2450,
    previousPrice: 2320,
    unit: "Quintal",
    retailEquivalent: 24.5,
    predictedPrice: 2580,
    riskLevel: "Medium",
    riskScore: 38,
    volatility: "±8.4%",
    supplyStatus: "Supply data is not available.",
    outlook: "Forecast not available",
    riskExplanation:
      "Based on recorded market prices and LSTM forecasting models.",
    historical: [
      { date: "10 Sep", modal: 2180, min: 1950, max: 2350, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "12 Sep", modal: 2200, min: 2000, max: 2380, market: "Pune", state: "Maharashtra", district: "Pune" },
      { date: "14 Sep", modal: 2190, min: 1960, max: 2360, market: "Kolar", state: "Karnataka", district: "Kolar" },
      { date: "16 Sep", modal: 2240, min: 2050, max: 2420, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "18 Sep", modal: 2260, min: 2070, max: 2440, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "20 Sep", modal: 2290, min: 2100, max: 2480, market: "Pimpalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "22 Sep", modal: 2310, min: 2120, max: 2500, market: "Pune", state: "Maharashtra", district: "Pune" },
      { date: "24 Sep", modal: 2300, min: 2100, max: 2490, market: "Vashi APMC", state: "Maharashtra", district: "Thane" },
      { date: "26 Sep", modal: 2330, min: 2140, max: 2520, market: "Kolar", state: "Karnataka", district: "Kolar" },
      { date: "28 Sep", modal: 2350, min: 2160, max: 2550, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "30 Sep", modal: 2320, min: 2130, max: 2510, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "02 Oct", modal: 2380, min: 2190, max: 2580, market: "Pune", state: "Maharashtra", district: "Pune" },
      { date: "04 Oct", modal: 2410, min: 2220, max: 2610, market: "Pimpalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "06 Oct", modal: 2430, min: 2240, max: 2630, market: "Vashi APMC", state: "Maharashtra", district: "Thane" },
      { date: "08 Oct", modal: 2440, min: 2250, max: 2640, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "09 Oct", modal: 2450, min: 2260, max: 2650, market: "Pune", state: "Maharashtra", district: "Pune" }
    ],
    predicted7d: [
      { date: "10 Oct", price: 2465, lower: 2410, upper: 2520, conf: 96 },
      { date: "11 Oct", price: 2480, lower: 2420, upper: 2540, conf: 95 },
      { date: "12 Oct", price: 2510, lower: 2440, upper: 2580, conf: 94 },
      { date: "13 Oct", price: 2535, lower: 2460, upper: 2610, conf: 94 },
      { date: "14 Oct", price: 2555, lower: 2475, upper: 2635, conf: 93 },
      { date: "15 Oct", price: 2570, lower: 2485, upper: 2655, conf: 92 },
      { date: "16 Oct", price: 2580, lower: 2490, upper: 2670, conf: 91 }
    ],
    predicted30d: [
      { date: "10 Oct", price: 2465, lower: 2410, upper: 2520, conf: 96 },
      { date: "12 Oct", price: 2510, lower: 2440, upper: 2580, conf: 94 },
      { date: "14 Oct", price: 2555, lower: 2475, upper: 2635, conf: 93 },
      { date: "16 Oct", price: 2580, lower: 2490, upper: 2670, conf: 91 },
      { date: "18 Oct", price: 2595, lower: 2500, upper: 2690, conf: 90 },
      { date: "20 Oct", price: 2605, lower: 2505, upper: 2705, conf: 89 },
      { date: "22 Oct", price: 2590, lower: 2480, upper: 2700, conf: 88 },
      { date: "24 Oct", price: 2560, lower: 2440, upper: 2680, conf: 87 },
      { date: "26 Oct", price: 2530, lower: 2400, upper: 2660, conf: 86 },
      { date: "28 Oct", price: 2495, lower: 2360, upper: 2630, conf: 85 },
      { date: "30 Oct", price: 2460, lower: 2320, upper: 2600, conf: 84 },
      { date: "02 Nov", price: 2430, lower: 2280, upper: 2580, conf: 83 },
      { date: "05 Nov", price: 2390, lower: 2230, upper: 2550, conf: 82 },
      { date: "08 Nov", price: 2360, lower: 2190, upper: 2530, conf: 81 }
    ]
  },
  Onion: {
    name: "Onion",
    icon: "🧅",
    currentPrice: 3100,
    previousPrice: 2880,
    unit: "Quintal",
    retailEquivalent: 31.0,
    predictedPrice: 3350,
    riskLevel: "High",
    riskScore: 72,
    volatility: "±12.1%",
    supplyStatus: "Supply data is not available.",
    outlook: "Forecast not available",
    riskExplanation:
      "Based on recorded market prices and LSTM forecasting models.",
    historical: [
      { date: "10 Sep", modal: 2650, min: 2400, max: 2850, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "12 Sep", modal: 2690, min: 2430, max: 2900, market: "Solapur", state: "Maharashtra", district: "Solapur" },
      { date: "14 Sep", modal: 2720, min: 2470, max: 2930, market: "Ahmednagar", state: "Maharashtra", district: "Ahmednagar" },
      { date: "16 Sep", modal: 2750, min: 2500, max: 2960, market: "Hubli (Amaragol)", state: "Karnataka", district: "Dharwad" },
      { date: "18 Sep", modal: 2790, min: 2540, max: 3010, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "20 Sep", modal: 2830, min: 2570, max: 3060, market: "Solapur", state: "Maharashtra", district: "Solapur" },
      { date: "22 Sep", modal: 2850, min: 2600, max: 3080, market: "Pune", state: "Maharashtra", district: "Pune" },
      { date: "24 Sep", modal: 2880, min: 2620, max: 3110, market: "Ahmednagar", state: "Maharashtra", district: "Ahmednagar" },
      { date: "26 Sep", modal: 2920, min: 2660, max: 3160, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "28 Sep", modal: 2970, min: 2710, max: 3210, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "30 Sep", modal: 2990, min: 2730, max: 3230, market: "Solapur", state: "Maharashtra", district: "Solapur" },
      { date: "02 Oct", modal: 3020, min: 2760, max: 3270, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "04 Oct", modal: 3050, min: 2790, max: 3300, market: "Hubli (Amaragol)", state: "Karnataka", district: "Dharwad" },
      { date: "06 Oct", modal: 3070, min: 2810, max: 3320, market: "Ahmednagar", state: "Maharashtra", district: "Ahmednagar" },
      { date: "08 Oct", modal: 3090, min: 2830, max: 3350, market: "Lasalgaon", state: "Maharashtra", district: "Nashik" },
      { date: "09 Oct", modal: 3100, min: 2840, max: 3360, market: "Pune", state: "Maharashtra", district: "Pune" }
    ],
    predicted7d: [
      { date: "10 Oct", price: 3130, lower: 3050, upper: 3210, conf: 95 },
      { date: "11 Oct", price: 3165, lower: 3075, upper: 3255, conf: 94 },
      { date: "12 Oct", price: 3210, lower: 3110, upper: 3310, conf: 93 },
      { date: "13 Oct", price: 3250, lower: 3140, upper: 3360, conf: 92 },
      { date: "14 Oct", price: 3290, lower: 3170, upper: 3410, conf: 91 },
      { date: "15 Oct", price: 3325, lower: 3195, upper: 3455, conf: 90 },
      { date: "16 Oct", price: 3350, lower: 3210, upper: 3490, conf: 89 }
    ],
    predicted30d: [
      { date: "10 Oct", price: 3130, lower: 3050, upper: 3210, conf: 95 },
      { date: "12 Oct", price: 3210, lower: 3110, upper: 3310, conf: 93 },
      { date: "14 Oct", price: 3290, lower: 3170, upper: 3410, conf: 91 },
      { date: "16 Oct", price: 3350, lower: 3210, upper: 3490, conf: 89 },
      { date: "18 Oct", price: 3390, lower: 3230, upper: 3550, conf: 88 },
      { date: "20 Oct", price: 3420, lower: 3240, upper: 3600, conf: 86 },
      { date: "22 Oct", price: 3400, lower: 3210, upper: 3590, conf: 85 },
      { date: "24 Oct", price: 3360, lower: 3160, upper: 3560, conf: 84 },
      { date: "26 Oct", price: 3310, lower: 3100, upper: 3520, conf: 83 },
      { date: "28 Oct", price: 3250, lower: 3020, upper: 3480, conf: 82 },
      { date: "30 Oct", price: 3180, lower: 2940, upper: 3420, conf: 81 },
      { date: "02 Nov", price: 3110, lower: 2860, upper: 3360, conf: 80 },
      { date: "05 Nov", price: 3020, lower: 2750, upper: 3290, conf: 79 },
      { date: "08 Nov", price: 2940, lower: 2650, upper: 3230, conf: 78 }
    ]
  },
  Potato: {
    name: "Potato",
    icon: "🥔",
    currentPrice: 1680,
    previousPrice: 1720,
    unit: "Quintal",
    retailEquivalent: 16.8,
    predictedPrice: 1650,
    riskLevel: "Low",
    riskScore: 22,
    volatility: "±3.2%",
    supplyStatus: "Supply data is not available.",
    outlook: "Forecast not available",
    riskExplanation:
      "Based on recorded market prices and LSTM forecasting models.",
    historical: [
      { date: "10 Sep", modal: 1740, min: 1580, max: 1880, market: "Agra", state: "Uttar Pradesh", district: "Agra" },
      { date: "12 Sep", modal: 1730, min: 1570, max: 1870, market: "Farrukhabad", state: "Uttar Pradesh", district: "Farrukhabad" },
      { date: "14 Sep", modal: 1735, min: 1580, max: 1880, market: "Aligarh", state: "Uttar Pradesh", district: "Aligarh" },
      { date: "16 Sep", modal: 1725, min: 1570, max: 1860, market: "Hooghly APMC", state: "West Bengal", district: "Hooghly" },
      { date: "18 Sep", modal: 1720, min: 1560, max: 1860, market: "Agra", state: "Uttar Pradesh", district: "Agra" },
      { date: "20 Sep", modal: 1715, min: 1550, max: 1850, market: "Fatehpur", state: "Uttar Pradesh", district: "Fatehpur" },
      { date: "22 Sep", modal: 1720, min: 1560, max: 1860, market: "Farrukhabad", state: "Uttar Pradesh", district: "Farrukhabad" },
      { date: "24 Sep", modal: 1710, min: 1550, max: 1850, market: "Aligarh", state: "Uttar Pradesh", district: "Aligarh" },
      { date: "26 Sep", modal: 1705, min: 1540, max: 1840, market: "Agra", state: "Uttar Pradesh", district: "Agra" },
      { date: "28 Sep", modal: 1700, min: 1540, max: 1840, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "30 Sep", modal: 1695, min: 1530, max: 1830, market: "Hooghly APMC", state: "West Bengal", district: "Hooghly" },
      { date: "02 Oct", modal: 1690, min: 1530, max: 1830, market: "Agra", state: "Uttar Pradesh", district: "Agra" },
      { date: "04 Oct", modal: 1685, min: 1520, max: 1820, market: "Farrukhabad", state: "Uttar Pradesh", district: "Farrukhabad" },
      { date: "06 Oct", modal: 1680, min: 1520, max: 1820, market: "Fatehpur", state: "Uttar Pradesh", district: "Fatehpur" },
      { date: "08 Oct", modal: 1680, min: 1520, max: 1820, market: "Aligarh", state: "Uttar Pradesh", district: "Aligarh" },
      { date: "09 Oct", modal: 1680, min: 1520, max: 1820, market: "Agra", state: "Uttar Pradesh", district: "Agra" }
    ],
    predicted7d: [
      { date: "10 Oct", price: 1675, lower: 1640, upper: 1710, conf: 97 },
      { date: "11 Oct", price: 1670, lower: 1630, upper: 1710, conf: 96 },
      { date: "12 Oct", price: 1665, lower: 1620, upper: 1705, conf: 96 },
      { date: "13 Oct", price: 1660, lower: 1615, upper: 1705, conf: 95 },
      { date: "14 Oct", price: 1655, lower: 1605, upper: 1700, conf: 95 },
      { date: "15 Oct", price: 1650, lower: 1600, upper: 1700, conf: 94 },
      { date: "16 Oct", price: 1650, lower: 1595, upper: 1700, conf: 93 }
    ],
    predicted30d: [
      { date: "10 Oct", price: 1675, lower: 1640, upper: 1710, conf: 97 },
      { date: "12 Oct", price: 1665, lower: 1620, upper: 1705, conf: 96 },
      { date: "14 Oct", price: 1655, lower: 1605, upper: 1700, conf: 95 },
      { date: "16 Oct", price: 1650, lower: 1595, upper: 1700, conf: 93 },
      { date: "18 Oct", price: 1645, lower: 1585, upper: 1705, conf: 92 },
      { date: "20 Oct", price: 1640, lower: 1575, upper: 1705, conf: 91 },
      { date: "22 Oct", price: 1635, lower: 1565, upper: 1705, conf: 90 },
      { date: "24 Oct", price: 1630, lower: 1555, upper: 1705, conf: 89 },
      { date: "26 Oct", price: 1630, lower: 1550, upper: 1710, conf: 88 },
      { date: "28 Oct", price: 1635, lower: 1550, upper: 1720, conf: 87 },
      { date: "30 Oct", price: 1640, lower: 1550, upper: 1730, conf: 86 },
      { date: "02 Nov", price: 1645, lower: 1550, upper: 1740, conf: 85 },
      { date: "05 Nov", price: 1650, lower: 1550, upper: 1750, conf: 84 },
      { date: "08 Nov", price: 1655, lower: 1550, upper: 1760, conf: 83 }
    ]
  },
  Rice: {
    name: "Rice",
    icon: "🌾",
    currentPrice: 3850,
    previousPrice: 3820,
    unit: "Quintal",
    retailEquivalent: 38.5,
    predictedPrice: 3890,
    riskLevel: "Low",
    riskScore: 18,
    volatility: "±2.1%",
    supplyStatus: "Supply data is not available.",
    outlook: "Forecast not available",
    riskExplanation:
      "Based on recorded market prices and LSTM forecasting models.",
    historical: [
      { date: "10 Sep", modal: 3810, min: 3500, max: 4100, market: "Khanna", state: "Punjab", district: "Ludhiana" },
      { date: "12 Sep", modal: 3815, min: 3510, max: 4110, market: "Karnal", state: "Haryana", district: "Karnal" },
      { date: "14 Sep", modal: 3820, min: 3520, max: 4120, market: "Burdwan APMC", state: "West Bengal", district: "Purba Bardhaman" },
      { date: "16 Sep", modal: 3815, min: 3510, max: 4110, market: "Nizamabad", state: "Telangana", district: "Nizamabad" },
      { date: "18 Sep", modal: 3820, min: 3520, max: 4120, market: "Khanna", state: "Punjab", district: "Ludhiana" },
      { date: "20 Sep", modal: 3825, min: 3530, max: 4130, market: "Karnal", state: "Haryana", district: "Karnal" },
      { date: "22 Sep", modal: 3830, min: 3530, max: 4130, market: "Burdwan APMC", state: "West Bengal", district: "Purba Bardhaman" },
      { date: "24 Sep", modal: 3835, min: 3540, max: 4140, market: "Nizamabad", state: "Telangana", district: "Nizamabad" },
      { date: "26 Sep", modal: 3830, min: 3530, max: 4130, market: "Khanna", state: "Punjab", district: "Ludhiana" },
      { date: "28 Sep", modal: 3840, min: 3550, max: 4150, market: "Karnal", state: "Haryana", district: "Karnal" },
      { date: "30 Sep", modal: 3840, min: 3550, max: 4150, market: "Burdwan APMC", state: "West Bengal", district: "Purba Bardhaman" },
      { date: "02 Oct", modal: 3845, min: 3560, max: 4160, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "04 Oct", modal: 3845, min: 3560, max: 4160, market: "Khanna", state: "Punjab", district: "Ludhiana" },
      { date: "06 Oct", modal: 3850, min: 3570, max: 4170, market: "Karnal", state: "Haryana", district: "Karnal" },
      { date: "08 Oct", modal: 3850, min: 3570, max: 4170, market: "Nizamabad", state: "Telangana", district: "Nizamabad" },
      { date: "09 Oct", modal: 3850, min: 3570, max: 4170, market: "Khanna", state: "Punjab", district: "Ludhiana" }
    ],
    predicted7d: [
      { date: "10 Oct", price: 3855, lower: 3810, upper: 3900, conf: 98 },
      { date: "11 Oct", price: 3860, lower: 3815, upper: 3910, conf: 97 },
      { date: "12 Oct", price: 3865, lower: 3815, upper: 3915, conf: 96 },
      { date: "13 Oct", price: 3870, lower: 3820, upper: 3925, conf: 95 },
      { date: "14 Oct", price: 3880, lower: 3825, upper: 3935, conf: 95 },
      { date: "15 Oct", price: 3885, lower: 3830, upper: 3945, conf: 94 },
      { date: "16 Oct", price: 3890, lower: 3830, upper: 3955, conf: 93 }
    ],
    predicted30d: [
      { date: "10 Oct", price: 3855, lower: 3810, upper: 3900, conf: 98 },
      { date: "12 Oct", price: 3865, lower: 3815, upper: 3915, conf: 96 },
      { date: "14 Oct", price: 3880, lower: 3825, upper: 3935, conf: 95 },
      { date: "16 Oct", price: 3890, lower: 3830, upper: 3955, conf: 93 },
      { date: "18 Oct", price: 3900, lower: 3835, upper: 3970, conf: 92 },
      { date: "20 Oct", price: 3905, lower: 3835, upper: 3980, conf: 91 },
      { date: "22 Oct", price: 3910, lower: 3835, upper: 3990, conf: 90 },
      { date: "24 Oct", price: 3915, lower: 3830, upper: 4000, conf: 89 },
      { date: "26 Oct", price: 3920, lower: 3830, upper: 4015, conf: 88 },
      { date: "28 Oct", price: 3925, lower: 3825, upper: 4030, conf: 87 },
      { date: "30 Oct", price: 3930, lower: 3820, upper: 4040, conf: 86 },
      { date: "02 Nov", price: 3935, lower: 3815, upper: 4055, conf: 85 },
      { date: "05 Nov", price: 3940, lower: 3810, upper: 4070, conf: 84 },
      { date: "08 Nov", price: 3945, lower: 3800, upper: 4090, conf: 83 }
    ]
  },
  Wheat: {
    name: "Wheat",
    icon: "🌾",
    currentPrice: 2740,
    previousPrice: 2690,
    unit: "Quintal",
    retailEquivalent: 27.4,
    predictedPrice: 2790,
    riskLevel: "Low",
    riskScore: 26,
    volatility: "±2.8%",
    supplyStatus: "Supply data is not available.",
    outlook: "Forecast not available",
    riskExplanation:
      "Based on recorded market prices and LSTM forecasting models.",
    historical: [
      { date: "10 Sep", modal: 2680, min: 2450, max: 2880, market: "Sehore", state: "Madhya Pradesh", district: "Sehore" },
      { date: "12 Sep", modal: 2685, min: 2460, max: 2890, market: "Indore APMC", state: "Madhya Pradesh", district: "Indore" },
      { date: "14 Sep", modal: 2690, min: 2460, max: 2900, market: "Kota", state: "Rajasthan", district: "Kota" },
      { date: "16 Sep", modal: 2695, min: 2470, max: 2910, market: "Khanna", state: "Punjab", district: "Ludhiana" },
      { date: "18 Sep", modal: 2700, min: 2480, max: 2920, market: "Sehore", state: "Madhya Pradesh", district: "Sehore" },
      { date: "20 Sep", modal: 2710, min: 2490, max: 2930, market: "Bhopal", state: "Madhya Pradesh", district: "Bhopal" },
      { date: "22 Sep", modal: 2715, min: 2500, max: 2940, market: "Indore APMC", state: "Madhya Pradesh", district: "Indore" },
      { date: "24 Sep", modal: 2720, min: 2500, max: 2950, market: "Kota", state: "Rajasthan", district: "Kota" },
      { date: "26 Sep", modal: 2725, min: 2510, max: 2950, market: "Sehore", state: "Madhya Pradesh", district: "Sehore" },
      { date: "28 Sep", modal: 2730, min: 2520, max: 2960, market: "Azadpur", state: "Delhi", district: "New Delhi" },
      { date: "30 Sep", modal: 2730, min: 2520, max: 2960, market: "Indore APMC", state: "Madhya Pradesh", district: "Indore" },
      { date: "02 Oct", modal: 2735, min: 2530, max: 2970, market: "Kota", state: "Rajasthan", district: "Kota" },
      { date: "04 Oct", modal: 2740, min: 2530, max: 2980, market: "Sehore", state: "Madhya Pradesh", district: "Sehore" },
      { date: "06 Oct", modal: 2735, min: 2530, max: 2970, market: "Bhopal", state: "Madhya Pradesh", district: "Bhopal" },
      { date: "08 Oct", modal: 2740, min: 2540, max: 2980, market: "Indore APMC", state: "Madhya Pradesh", district: "Indore" },
      { date: "09 Oct", modal: 2740, min: 2540, max: 2980, market: "Sehore", state: "Madhya Pradesh", district: "Sehore" }
    ],
    predicted7d: [
      { date: "10 Oct", price: 2745, lower: 2710, upper: 2785, conf: 97 },
      { date: "11 Oct", price: 2750, lower: 2715, upper: 2795, conf: 96 },
      { date: "12 Oct", price: 2760, lower: 2720, upper: 2805, conf: 96 },
      { date: "13 Oct", price: 2765, lower: 2725, upper: 2815, conf: 95 },
      { date: "14 Oct", price: 2775, lower: 2730, upper: 2825, conf: 94 },
      { date: "15 Oct", price: 2780, lower: 2735, upper: 2835, conf: 94 },
      { date: "16 Oct", price: 2790, lower: 2740, upper: 2850, conf: 93 }
    ],
    predicted30d: [
      { date: "10 Oct", price: 2745, lower: 2710, upper: 2785, conf: 97 },
      { date: "12 Oct", price: 2760, lower: 2720, upper: 2805, conf: 96 },
      { date: "14 Oct", price: 2775, lower: 2730, upper: 2825, conf: 94 },
      { date: "16 Oct", price: 2790, lower: 2740, upper: 2850, conf: 93 },
      { date: "18 Oct", price: 2800, lower: 2745, upper: 2865, conf: 92 },
      { date: "20 Oct", price: 2810, lower: 2750, upper: 2880, conf: 91 },
      { date: "22 Oct", price: 2815, lower: 2750, upper: 2890, conf: 90 },
      { date: "24 Oct", price: 2820, lower: 2750, upper: 2900, conf: 89 },
      { date: "26 Oct", price: 2825, lower: 2750, upper: 2915, conf: 88 },
      { date: "28 Oct", price: 2830, lower: 2745, upper: 2925, conf: 87 },
      { date: "30 Oct", price: 2835, lower: 2740, upper: 2940, conf: 86 },
      { date: "02 Nov", price: 2840, lower: 2735, upper: 2955, conf: 85 },
      { date: "05 Nov", price: 2845, lower: 2730, upper: 2970, conf: 84 },
      { date: "08 Nov", price: 2850, lower: 2720, upper: 2990, conf: 83 }
    ]
  }
};

// Module-level in-memory cache for LSTM predictions across component re-mounts
const PREDICTION_CACHE = new Map();
// In-flight promises to deduplicate concurrent requests across components & horizon toggles
const PREDICTION_IN_FLIGHT = new Map();
// Module-level cache for dynamic location queries (states, districts, markets)
const LOCATION_CACHE = new Map();
// Module-level cache for dynamic commodity timeline records from cleaned parquet dataset
const TIMELINE_CACHE = new Map();

// Cached working endpoint to eliminate serial connection attempts
let preferredPriceBaseUrl = "";

function roundMetric(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// Dual-horizon cache populator: stores both 7-day and 30-day views from any model prediction
function populateAnalyticsCache(commodity, data) {
  if (!data || !data.success || !data.forecastAvailable) return;
  const cName = data.commodity || commodity;
  const normName = cName.trim();
  const curP = typeof data.currentPrice === "number" ? data.currentPrice : 0;

  // 1. 7-Day Horizon
  if (Array.isArray(data.predicted7d) && data.predicted7d.length > 0) {
    const p7 = Number(data.predicted7d[data.predicted7d.length - 1].price);
    const diff7 = roundMetric(p7 - curP, 1);
    const pct7 = curP > 0 ? roundMetric((diff7 / curP) * 100, 2) : 0;
    const data7 = {
      ...data,
      horizon: "7d",
      predictedPrice: p7,
      priceChange: diff7,
      priceChangePercent: pct7
    };
    PREDICTION_CACHE.set(`${normName}_7`, data7);
  } else if (data.horizon === "7d") {
    PREDICTION_CACHE.set(`${normName}_7`, data);
  }

  // 2. 30-Day Horizon
  if (Array.isArray(data.predicted30d) && data.predicted30d.length > 0) {
    const p30 = Number(data.predicted30d[data.predicted30d.length - 1].price);
    const diff30 = roundMetric(p30 - curP, 1);
    const pct30 = curP > 0 ? roundMetric((diff30 / curP) * 100, 2) : 0;
    const data30 = {
      ...data,
      horizon: "30d",
      predictedPrice: p30,
      priceChange: diff30,
      priceChangePercent: pct30
    };
    PREDICTION_CACHE.set(`${normName}_30`, data30);
  } else if (data.horizon === "30d") {
    PREDICTION_CACHE.set(`${normName}_30`, data);
  }
}

// Resilient multi-endpoint fetch helper with cached endpoint & timeout
async function fetchPriceApi(pathWithQuery, options = {}) {
  const cleanPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const rawEndpoints = getApiEndpoints(cleanPath);

  let endpoints;
  if (preferredPriceBaseUrl !== undefined && preferredPriceBaseUrl !== null && preferredPriceBaseUrl !== "") {
    const preferredFull = preferredPriceBaseUrl.endsWith("/")
      ? preferredPriceBaseUrl.slice(0, -1) + cleanPath
      : preferredPriceBaseUrl + cleanPath;
    endpoints = [preferredFull, ...rawEndpoints.filter((u) => u !== preferredFull)];
  } else {
    endpoints = rawEndpoints;
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 8000);

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    options.signal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }

  const fetchOptions = {
    ...options,
    signal: timeoutController.signal
  };

  let lastError = null;
  try {
    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(baseUrl, fetchOptions);
        if (res.ok) {
          if (!preferredPriceBaseUrl) {
            preferredPriceBaseUrl = baseUrl.startsWith("http") ? new URL(baseUrl).origin : "/";
          }
          return await res.json();
        }

        // Try to parse error details from backend response
        let serverErrorMsg = `Server returned HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson && (errJson.message || errJson.error)) {
            serverErrorMsg = errJson.message || errJson.error;
          }
        } catch (_) {}

        lastError = new Error(serverErrorMsg);
        // If we got a direct HTTP response from the backend (not a proxy gateway error 502/504), don't fall through
        if (res.status >= 400 && res.status < 600 && res.status !== 502 && res.status !== 504) {
          throw lastError;
        }
      } catch (err) {
        if (err.name === "AbortError" || fetchOptions.signal?.aborted) {
          throw err;
        }
        if (err.message && !err.message.includes("Failed to fetch") && !err.message.includes("NetworkError")) {
          throw err;
        }
        lastError = err;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
  throw lastError || new Error("Failed to connect to AGRI-SWAP backend service on port 5000.");
}

const COMMODITY_ICONS = {
  Tomato: "🍅",
  Onion: "🧅",
  Potato: "🥔",
  Rice: "🌾",
  Wheat: "🌾",
  Apple: "🍎",
  Banana: "🍌",
  Maize: "🌽",
  Mustard: "🌱",
  "Bengal Gram (Gram)(Whole)": "🫘",
  "Bengal Gram": "🫘",
  Gram: "🫘",
  Soyabean: "🌱",
  Soybean: "🌱",
  Cotton: "☁️",
  Garlic: "🧄",
  Ginger: "🫚",
  Grapes: "🍇",
  Lemon: "🍋",
  Mango: "🥭",
  Orange: "🍊",
  Papaya: "🍈",
  Pineapple: "🍍",
  Pomegranate: "🫐",
  Carrot: "🥕",
  Brinjal: "🍆",
  Cabbage: "🥬",
  Cauliflower: "🥦",
  Chilli: "🌶️",
  "Green Chilli": "🌶️",
  Turmeric: "🫚",
  Pumpkin: "🎃",
  Plum: "🫐",
  "Bhindi(Ladies Finger)": "🥒",
  Bhindi: "🥒",
  "Ladies Finger": "🥒",
  Beetroot: "🍠",
  Cucumber: "🥒",
  Spinach: "🥬",
  Watermelon: "🍉",
  Peas: "🫛",
  "Green Peas": "🫛",
  Radish: "🥕",
  Raddish: "🥕",
  Capsicum: "🫑",
  "Bell Pepper": "🫑"
};

function getCommodityIcon(name) {
  if (!name) return "🌾";
  if (COMMODITY_ICONS[name]) return COMMODITY_ICONS[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(COMMODITY_ICONS)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return "🌾";
}

// Bounded, internally scrollable dropdown component displaying ~12 options at a time
function CustomDropdown({
  id,
  value,
  onChange,
  options = [],
  disabled = false,
  className = "",
  placeholder = "Select...",
  alignRight = false,
  ariaLabel
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector(".custom-dropdown-item.active");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (val) => {
    if (disabled) return;
    onChange(val);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-dropdown-container ${className} ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
    >
      <button
        id={id}
        type="button"
        className="custom-dropdown-trigger"
        onClick={handleToggle}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel || id}
      >
        <span className="custom-dropdown-label">{displayLabel}</span>
        <span className="custom-dropdown-chevron" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div
          ref={listRef}
          className={`custom-dropdown-menu ${alignRight ? "align-right" : ""}`}
          role="listbox"
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={opt.value}
                className={`custom-dropdown-item ${isSelected ? "active" : ""}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                title={opt.label}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden select for accessibility & DOM synchronization */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: "none" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PriceAnalyticsMain({ initialCommodity = "Tomato", onNavigateToShock } = {}) {
  // 1. Search & Filter States
  const [selectedCommodity, setSelectedCommodity] = useState(initialCommodity || "Tomato");
  const [commoditySearch, setCommoditySearch] = useState("");
  const [filterState, setFilterState] = useState("All");
  const [filterDistrict, setFilterDistrict] = useState("All");
  const [filterMarket, setFilterMarket] = useState("All");
  const [dateRange, setDateRange] = useState("30d");

  // Dynamic Location Options from Backend API (derived from cleaned price dataset)
  const [availableStates, setAvailableStates] = useState(() => LOCATION_CACHE.get("all_states") || []);
  const [availableDistricts, setAvailableDistricts] = useState([]);
  const [availableMarkets, setAvailableMarkets] = useState([]);
  const [availableCommodities, setAvailableCommodities] = useState(() => LOCATION_CACHE.get("all_commodities") || []);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Sync external initialCommodity navigation updates when kept alive
  useEffect(() => {
    if (initialCommodity && initialCommodity !== selectedCommodity) {
      setSelectedCommodity(initialCommodity);
    }
  }, [initialCommodity]);

  // Fetch available distinct states and commodities on component mount
  useEffect(() => {
    let isMounted = true;
    const fetchMetadata = async () => {
      // 1. Fetch States
      if (LOCATION_CACHE.has("all_states")) {
        const cachedStates = LOCATION_CACHE.get("all_states");
        if (isMounted && cachedStates && cachedStates.length > 0) {
          setAvailableStates(cachedStates);
        }
      } else {
        try {
          const data = await fetchPriceApi("/api/prices/locations/states");
          if (data && data.success && Array.isArray(data.states)) {
            LOCATION_CACHE.set("all_states", data.states);
            if (isMounted) setAvailableStates(data.states);
          }
        } catch (err) {
          console.warn("Failed to fetch states from backend:", err);
        }
      }

      // 2. Fetch Commodities
      if (LOCATION_CACHE.has("all_commodities")) {
        const cachedCommodities = LOCATION_CACHE.get("all_commodities");
        if (isMounted && cachedCommodities && cachedCommodities.length > 0) {
          setAvailableCommodities(cachedCommodities);
        }
      } else {
        try {
          const data = await fetchPriceApi("/api/prices/commodities");
          if (data && data.success && Array.isArray(data.commodities)) {
            LOCATION_CACHE.set("all_commodities", data.commodities);
            if (isMounted) setAvailableCommodities(data.commodities);
          }
        } catch (err) {
          console.warn("Failed to fetch commodities from backend:", err);
        }
      }
    };

    fetchMetadata();
    return () => { isMounted = false; };
  }, []);

  // Fetch dependent districts and markets when filterState or filterDistrict changes
  useEffect(() => {
    let isMounted = true;
    if (filterState === "All") {
      setAvailableDistricts([]);
      setAvailableMarkets([]);
      if (filterDistrict !== "All") setFilterDistrict("All");
      if (filterMarket !== "All") setFilterMarket("All");
      return;
    }

    const fetchLocationDetails = async () => {
      const cacheKey = `loc_${filterState}_${filterDistrict}`;
      if (LOCATION_CACHE.has(cacheKey)) {
        const cached = LOCATION_CACHE.get(cacheKey);
        if (isMounted) {
          const distList = Array.isArray(cached.districts) ? cached.districts : [];
          const mktList = Array.isArray(cached.markets) ? cached.markets : [];
          setAvailableDistricts(distList);
          setAvailableMarkets(mktList);
          // Auto-reset mismatched child selections
          if (filterDistrict !== "All" && !distList.includes(filterDistrict)) {
            setFilterDistrict("All");
          }
          if (filterMarket !== "All" && !mktList.includes(filterMarket)) {
            setFilterMarket("All");
          }
        }
        return;
      }

      setIsLoadingLocations(true);
      try {
        const queryPath = `/api/prices/locations?state=${encodeURIComponent(filterState)}${filterDistrict !== "All" ? `&district=${encodeURIComponent(filterDistrict)}` : ""}`;
        const data = await fetchPriceApi(queryPath);
        if (data && data.success) {
          LOCATION_CACHE.set(cacheKey, data);
          if (isMounted) {
            const distList = Array.isArray(data.districts) ? data.districts : [];
            const mktList = Array.isArray(data.markets) ? data.markets : [];
            setAvailableDistricts(distList);
            setAvailableMarkets(mktList);
            // Auto-reset mismatched child selections
            if (filterDistrict !== "All" && !distList.includes(filterDistrict)) {
              setFilterDistrict("All");
            }
            if (filterMarket !== "All" && !mktList.includes(filterMarket)) {
              setFilterMarket("All");
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch location hierarchy:", err);
      } finally {
        if (isMounted) setIsLoadingLocations(false);
      }
    };

    fetchLocationDetails();
    return () => { isMounted = false; };
  }, [filterState, filterDistrict]);

  const handleStateChange = (newState) => {
    setFilterState(newState);
    setFilterDistrict("All");
    setFilterMarket("All");
    setCurrentPage(1);
  };

  const handleDistrictChange = (newDistrict) => {
    setFilterDistrict(newDistrict);
    setFilterMarket("All");
    setCurrentPage(1);
  };

  const handleMarketChange = (newMarket) => {
    setFilterMarket(newMarket);
    setCurrentPage(1);
  };

  // Ensure dropdown opens downwards and is not clipped by viewport boundaries
  const handleDropdownFocus = (e) => {
    const select = e.currentTarget;
    if (!select) return;
    const rect = select.getBoundingClientRect();
    const topbarOffset = 70; // Clearance for sticky topbar
    const minSpaceBelow = 320; // Clearance needed below so native dropdown opens downward
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < minSpaceBelow) {
      const scrollAmount = minSpaceBelow - spaceBelow;
      window.scrollBy({ top: scrollAmount, behavior: "instant" });
    } else if (rect.top < topbarOffset) {
      window.scrollBy({ top: rect.top - topbarOffset - 10, behavior: "instant" });
    }
  };

  // Dismiss open dropdowns if user scrolls the page to prevent floating/detached popups
  useEffect(() => {
    const handleScroll = () => {
      if (document.activeElement && document.activeElement.tagName === "SELECT") {
        document.activeElement.blur();
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Memoized Options for Dropdowns (without category headings in Commodity dropdown)
  const commodityOptions = useMemo(() => {
    const list = [
      {
        value: "All",
        label: `All Commodities (${availableCommodities.length > 0 ? availableCommodities.length : "All"})`
      }
    ];
    // Model Commodities directly in list without category headings
    Object.keys(COMMODITIES_DATA).forEach((cName) => {
      list.push({
        value: cName,
        label: `${cName} (${COMMODITIES_DATA[cName].unit})`
      });
    });
    // Cleaned Dataset Commodities directly in list without category headings
    if (availableCommodities.length > 0) {
      availableCommodities
        .filter((cName) => !Object.keys(COMMODITIES_DATA).includes(cName))
        .forEach((cName) => {
          list.push({
            value: cName,
            label: cName
          });
        });
    }
    return list;
  }, [availableCommodities]);

  const stateOptions = useMemo(() => {
    const list = [
      {
        value: "All",
        label: `All States (${availableStates.length > 0 ? availableStates.length : "Loading..."})`
      }
    ];
    availableStates.forEach((st) => {
      list.push({ value: st, label: st });
    });
    return list;
  }, [availableStates]);

  const districtOptions = useMemo(() => {
    const defaultLabel = filterState === "All"
      ? "All Districts (Select State first)"
      : isLoadingLocations
      ? "Loading districts..."
      : `All Districts in ${filterState} (${availableDistricts.length})`;

    const list = [{ value: "All", label: defaultLabel }];
    availableDistricts.forEach((dst) => {
      list.push({ value: dst, label: dst });
    });
    return list;
  }, [filterState, isLoadingLocations, availableDistricts]);

  const marketOptions = useMemo(() => {
    const defaultLabel = filterState === "All"
      ? "All Markets (Select State first)"
      : isLoadingLocations
      ? "Loading markets..."
      : filterDistrict !== "All"
      ? `All Markets in ${filterDistrict} (${availableMarkets.length})`
      : `All Markets in ${filterState} (${availableMarkets.length})`;

    const list = [{ value: "All", label: defaultLabel }];
    availableMarkets.forEach((mkt) => {
      list.push({ value: mkt, label: mkt });
    });
    return list;
  }, [filterState, filterDistrict, isLoadingLocations, availableMarkets]);

  const dateRangeOptions = useMemo(() => [
    { value: "7d", label: "Last 7 Days" },
    { value: "14d", label: "Last 14 Days" },
    { value: "30d", label: "Last 30 Days (Full)" },
    { value: "all", label: "All Available Records" }
  ], []);

  // 2. LSTM Prediction States
  const [predictionPeriod, setPredictionPeriod] = useState("7d"); // "7d" or "30d"

  // 3. Table States (Backed by Real Cleaned Dataset API)
  const [tableSearch, setTableSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" or "desc"
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [tableRecords, setTableRecords] = useState([]);
  const [totalTableRecords, setTotalTableRecords] = useState(0);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  const tableAbortRef = React.useRef(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(tableSearch);
    }, 350);
    return () => clearTimeout(handler);
  }, [tableSearch]);

  // 4. Hover tooltips
  const [activeHistTooltip, setActiveHistTooltip] = useState(null);
  const [activePredTooltip, setActivePredTooltip] = useState(null);

  // 5. Live LSTM Model Prediction State
  // Initialize with cached prediction for active commodity/horizon to prevent empty/stale flash
  const [lstmApiData, setLstmApiData] = useState(() => {
    const horizonParam = predictionPeriod === "30d" ? 30 : 7;
    return PREDICTION_CACHE.get(`${selectedCommodity || "Tomato"}_${horizonParam}`) || null;
  });
  const [isLoadingLstm, setIsLoadingLstm] = useState(false);
  const [lstmError, setLstmError] = useState(null);

  const abortControllerRef = React.useRef(null);
  const isMountedRef = React.useRef(true);
  const activePredictionKeyRef = React.useRef(`${selectedCommodity || "Tomato"}_${predictionPeriod === "30d" ? 30 : 7}`);

  const fetchPrediction = React.useCallback(async (commodityArg, periodArg) => {
    const targetCommodity = (typeof commodityArg === "string" && commodityArg) ? commodityArg : selectedCommodity;
    const targetPeriod = (typeof periodArg === "string" && periodArg) ? periodArg : predictionPeriod;
    const horizonParam = targetPeriod === "30d" ? 30 : 7;
    const cacheKey = `${targetCommodity}_${horizonParam}`;
    activePredictionKeyRef.current = cacheKey;

    // Fast-path: display cached response immediately if available and return
    if (PREDICTION_CACHE.has(cacheKey)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setLstmApiData(PREDICTION_CACHE.get(cacheKey));
      setLstmError(null);
      setIsLoadingLstm(false);
      return;
    }

    // Abort previous in-flight fetch to prevent race conditions & duplicate worker overload
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isMountedRef.current) {
      setIsLoadingLstm(true);
      setLstmError(null);
    }

    try {
      let fetchPromise;
      if (PREDICTION_IN_FLIGHT.has(cacheKey)) {
        fetchPromise = PREDICTION_IN_FLIGHT.get(cacheKey);
      } else {
        fetchPromise = fetchPriceApi(
          `/api/prices/predict?commodity=${encodeURIComponent(targetCommodity)}&horizon=${horizonParam}`
        )
          .then((data) => {
            if (data && data.success) {
              populateAnalyticsCache(targetCommodity, data);
            }
            return data;
          })
          .finally(() => {
            PREDICTION_IN_FLIGHT.delete(cacheKey);
          });
        PREDICTION_IN_FLIGHT.set(cacheKey, fetchPromise);
      }

      const data = await fetchPromise;

      if (controller.signal.aborted || !isMountedRef.current || activePredictionKeyRef.current !== cacheKey) {
        return; // Discard outdated response from previous selection
      }

      if (data && data.success) {
        const resolved = PREDICTION_CACHE.get(cacheKey) || data;
        setLstmApiData(resolved);
        setLstmError(null);
      } else {
        throw new Error(data?.message || data?.error || "Price forecast service returned an error");
      }
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted || activePredictionKeyRef.current !== cacheKey) {
        return; // Expected cancellation on unmount or fast parameter change
      }
      if (isMountedRef.current) {
        setLstmError(err.message || "Could not connect to the price prediction service");
        if (!PREDICTION_CACHE.has(cacheKey)) {
          setLstmApiData(null);
        }
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted && activePredictionKeyRef.current === cacheKey) {
        setIsLoadingLstm(false);
      }
    }
  }, [selectedCommodity, predictionPeriod]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchPrediction(selectedCommodity, predictionPeriod);

    // Background prefetch alternate horizon to make period switching instant
    const altPeriod = predictionPeriod === "7d" ? "30d" : "7d";
    const altHorizon = altPeriod === "30d" ? 30 : 7;
    const altKey = `${selectedCommodity}_${altHorizon}`;
    const timer = setTimeout(() => {
      if (!PREDICTION_CACHE.has(altKey) && !PREDICTION_IN_FLIGHT.has(altKey)) {
        fetchPriceApi(`/api/prices/predict?commodity=${encodeURIComponent(selectedCommodity)}&horizon=${altHorizon}`)
          .then((data) => {
            if (data && data.success) populateAnalyticsCache(selectedCommodity, data);
          })
          .catch(() => {});
      }
    }, 1200);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedCommodity, predictionPeriod, fetchPrediction]);

  // 6. Fetch Real Historical Daily Timeline Observations from Cleaned Parquet API
  const [timelineRecords, setTimelineRecords] = useState([]);
  const [timelineStats, setTimelineStats] = useState(null);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const timelineAbortRef = React.useRef(null);

  const fetchTimelineData = React.useCallback(async () => {
    if (timelineAbortRef.current) {
      timelineAbortRef.current.abort();
    }
    const controller = new AbortController();
    timelineAbortRef.current = controller;

    const cacheKey = `tl_${selectedCommodity}_${filterState}_${filterDistrict}_${filterMarket}_${dateRange}`;
    if (TIMELINE_CACHE.has(cacheKey)) {
      const cached = TIMELINE_CACHE.get(cacheKey);
      setTimelineRecords(cached.records || []);
      setTimelineStats({
        currentPrice: cached.currentPrice,
        previousPrice: cached.previousPrice,
        count: cached.count
      });
      setTimelineError(null);
      setIsLoadingTimeline(false);
      return;
    }

    setIsLoadingTimeline(true);
    setTimelineError(null);

    try {
      const params = new URLSearchParams({
        commodity: selectedCommodity,
        state: filterState,
        district: filterDistrict,
        market: filterMarket,
        dateRange: dateRange
      });

      const data = await fetchPriceApi(`/api/prices/timeline?${params.toString()}`, {
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (data && (data.success || data.isFallbackMode)) {
        if (Array.isArray(data.records) && data.records.length > 0) {
          TIMELINE_CACHE.set(cacheKey, data);
        }
        setTimelineRecords(Array.isArray(data.records) ? data.records : []);
        setTimelineStats({
          currentPrice: typeof data.currentPrice === "number" ? data.currentPrice : null,
          previousPrice: typeof data.previousPrice === "number" ? data.previousPrice : null,
          count: typeof data.count === "number" ? data.count : (Array.isArray(data.records) ? data.records.length : 0)
        });
      } else {
        throw new Error(data?.message || data?.error || "Failed to load timeline records");
      }
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted) return;
      setTimelineError(err.message || "Failed to fetch timeline data");
      setTimelineRecords([]);
      setTimelineStats(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingTimeline(false);
      }
    }
  }, [selectedCommodity, filterState, filterDistrict, filterMarket, dateRange]);

  useEffect(() => {
    fetchTimelineData();
    return () => {
      if (timelineAbortRef.current) {
        timelineAbortRef.current.abort();
      }
    };
  }, [fetchTimelineData]);

  // 7. Fetch Real Historical Market Price Records from Cleaned Parquet API
  const fetchTableData = React.useCallback(async () => {
    if (tableAbortRef.current) {
      tableAbortRef.current.abort();
    }
    const controller = new AbortController();
    tableAbortRef.current = controller;

    const cacheKey = `hist_${selectedCommodity}_${filterState}_${filterDistrict}_${filterMarket}_${dateRange}_${debouncedSearch}_${sortField}_${sortOrder}_${currentPage}_${pageSize}`;
    if (LOCATION_CACHE.has(cacheKey)) {
      const cached = LOCATION_CACHE.get(cacheKey);
      setTableRecords(cached.records || []);
      setTotalTableRecords(cached.total || 0);
      setTableError(null);
      return;
    }

    setIsLoadingTable(true);
    setTableError(null);

    try {
      const params = new URLSearchParams({
        commodity: selectedCommodity,
        state: filterState,
        district: filterDistrict,
        market: filterMarket,
        dateRange: dateRange,
        search: debouncedSearch,
        sortField: sortField,
        sortOrder: sortOrder,
        page: String(currentPage),
        limit: String(pageSize)
      });

      const data = await fetchPriceApi(`/api/prices/historical?${params.toString()}`, {
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (data && (data.success || data.isFallbackMode)) {
        if (Array.isArray(data.records) && data.records.length > 0) {
          LOCATION_CACHE.set(cacheKey, data);
        }
        setTableRecords(Array.isArray(data.records) ? data.records : []);
        setTotalTableRecords(typeof data.total === "number" ? data.total : (Array.isArray(data.records) ? data.records.length : 0));
      } else {
        throw new Error(data?.message || data?.error || "Failed to load historical price records");
      }
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted) return;
      setTableError(err.message || "Failed to fetch historical market data");
      setTableRecords([]);
      setTotalTableRecords(0);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingTable(false);
      }
    }
  }, [
    selectedCommodity,
    filterState,
    filterDistrict,
    filterMarket,
    dateRange,
    debouncedSearch,
    sortField,
    sortOrder,
    currentPage,
    pageSize
  ]);

  useEffect(() => {
    fetchTableData();
    return () => {
      if (tableAbortRef.current) {
        tableAbortRef.current.abort();
      }
    };
  }, [fetchTableData]);

  // Selected Commodity Data (Prioritizing Cleaned Parquet Dataset & Real Timeline)
  const baseCommodityData = useMemo(() => {
    if (COMMODITIES_DATA[selectedCommodity]) {
      return COMMODITIES_DATA[selectedCommodity];
    }
    return {
      name: selectedCommodity === "All" ? "All Commodities" : selectedCommodity,
      icon: getCommodityIcon(selectedCommodity),
      unit: "Quintal",
      currentPrice: null,
      previousPrice: null,
      retailEquivalent: null,
      predictedPrice: null,
      riskLevel: "Cannot be assessed",
      riskScore: null,
      volatility: "N/A",
      supplyStatus: "Supply data is not available.",
      outlook: "Forecast not available",
      historical: [],
      predicted7d: [],
      predicted30d: []
    };
  }, [selectedCommodity]);

  const currentCommodityData = useMemo(() => {
    const base = baseCommodityData;

    // Prioritize real timeline observations from cleaned parquet dataset
    const hasTimelineRecords = Array.isArray(timelineRecords) && timelineRecords.length > 0;
    const isSpecificLocation = filterState !== "All" || filterDistrict !== "All" || filterMarket !== "All";

    // If a location filter is selected and the query returned 0 records, do NOT fall back to dummy/national prices!
    let rawHist = [];
    if (hasTimelineRecords) {
      rawHist = timelineRecords;
    } else if (!isSpecificLocation && !timelineStats) {
      // National / default initial state before timeline query completes
      rawHist = (lstmApiData && lstmApiData.success && lstmApiData.forecastAvailable && Array.isArray(lstmApiData.historical) && lstmApiData.historical.length > 0)
        ? lstmApiData.historical
        : (Array.isArray(base.historical) ? base.historical : []);
    }

    // Sanitize every historical observation so min, max, modal, and geographic fields are valid
    const safeHistorical = rawHist.map((item, idx) => {
      const modal = typeof item.modal === "number" && !isNaN(item.modal)
        ? item.modal
        : 0;
      const min = typeof item.min === "number" && !isNaN(item.min)
        ? item.min
        : Math.round(modal * 0.92);
      const max = typeof item.max === "number" && !isNaN(item.max)
        ? item.max
        : Math.round(modal * 1.08);

      return {
        ...item,
        modal,
        min,
        max,
        market: item.market ? String(item.market) : "APMC Mandi",
        state: item.state ? String(item.state) : "All India",
        district: item.district ? String(item.district) : "General",
        date: item.date ? String(item.date) : `Obs ${idx + 1}`
      };
    });

    // Prices: prefer timelineStats, then latest safeHistorical, then lstmApiData, then base (national only)
    let currentPrice = null;
    let previousPrice = null;

    if (timelineStats && typeof timelineStats.currentPrice === "number") {
      currentPrice = timelineStats.currentPrice;
      previousPrice = typeof timelineStats.previousPrice === "number" ? timelineStats.previousPrice : currentPrice;
    } else if (hasTimelineRecords && safeHistorical.length > 0) {
      currentPrice = safeHistorical[safeHistorical.length - 1].modal;
      previousPrice = safeHistorical.length >= 7 ? safeHistorical[safeHistorical.length - 7].modal : safeHistorical[0].modal;
    } else if (!isSpecificLocation && !timelineStats) {
      // National benchmark fallback only on initial render before timeline query completes
      if (lstmApiData && lstmApiData.forecastAvailable && typeof lstmApiData.currentPrice === "number") {
        currentPrice = lstmApiData.currentPrice;
        previousPrice = typeof lstmApiData.previousPrice === "number" ? lstmApiData.previousPrice : null;
      } else if (typeof base.currentPrice === "number") {
        currentPrice = base.currentPrice;
        previousPrice = typeof base.previousPrice === "number" ? base.previousPrice : null;
      }
    }

    // Forecast availability:
    const hasModelForecast = Boolean(
      lstmApiData &&
      lstmApiData.success &&
      lstmApiData.forecastAvailable &&
      Array.isArray(lstmApiData.predicted7d) &&
      lstmApiData.predicted7d.length > 0
    );

    const safePred7d = hasModelForecast ? lstmApiData.predicted7d : [];
    const safePred30d = hasModelForecast ? lstmApiData.predicted30d : [];

    const predictedPrice = hasModelForecast && typeof lstmApiData.predictedPrice === "number"
      ? (predictionPeriod === "30d" && safePred30d.length > 0
          ? Number(safePred30d[safePred30d.length - 1].price)
          : (safePred7d.length > 0 ? Number(safePred7d[safePred7d.length - 1].price) : lstmApiData.predictedPrice))
      : null;

    return {
      ...base,
      name: selectedCommodity === "All" ? "All Commodities" : (base.name || selectedCommodity),
      icon: getCommodityIcon(selectedCommodity),
      currentPrice,
      previousPrice,
      retailEquivalent: currentPrice !== null ? Number((currentPrice / 100).toFixed(1)) : null,
      hasModelForecast,
      predictedPrice,
      priceChange: (hasModelForecast && predictedPrice !== null && currentPrice !== null)
        ? Number((predictedPrice - currentPrice).toFixed(1))
        : null,
      priceChangePercent: (hasModelForecast && predictedPrice !== null && currentPrice !== null && currentPrice > 0)
        ? Number((((predictedPrice - currentPrice) / currentPrice) * 100).toFixed(2))
        : null,
      supplyStatus: "Supply data is not available.",
      historical: safeHistorical,
      predicted7d: safePred7d,
      predicted30d: safePred30d,
      modelMetadata: hasModelForecast ? (lstmApiData.modelMetadata || null) : null
    };
  }, [selectedCommodity, baseCommodityData, timelineRecords, timelineStats, lstmApiData, predictionPeriod, filterState, filterDistrict, filterMarket]);

  // Available quick-select commodity names
  const commodityList = Object.keys(COMMODITIES_DATA);

  // Price Change Calculation
  const hasValidPrices = typeof currentCommodityData.currentPrice === "number" && typeof currentCommodityData.previousPrice === "number";
  const priceChangeAmount = hasValidPrices ? currentCommodityData.currentPrice - currentCommodityData.previousPrice : 0;
  const priceChangePct = hasValidPrices && currentCommodityData.previousPrice > 0
    ? ((priceChangeAmount / currentCommodityData.previousPrice) * 100).toFixed(2)
    : "0.00";
  const isPriceIncrease = priceChangeAmount >= 0;

  // Filtered Historical Data by Date Range
  const slicedHistoricalData = useMemo(() => {
    if (Array.isArray(timelineRecords) && timelineRecords.length > 0) {
      return timelineRecords;
    }
    const list = [...(currentCommodityData.historical || [])];
    if (dateRange === "7d") return list.slice(-5);
    if (dateRange === "14d") return list.slice(-8);
    if (dateRange === "30d") return list;
    return list;
  }, [timelineRecords, currentCommodityData.historical, dateRange]);

  // Overall Historical Trend Indicator
  const histTrend = useMemo(() => {
    if (slicedHistoricalData.length < 2) return { isUp: true, pct: "0.0", diff: 0 };
    const first = slicedHistoricalData[0]?.modal || 1;
    const last = slicedHistoricalData[slicedHistoricalData.length - 1]?.modal || first;
    const diff = last - first;
    const pct = first !== 0 ? ((diff / first) * 100).toFixed(1) : "0.0";
    return { isUp: diff >= 0, diff, pct };
  }, [slicedHistoricalData]);

  // Active Forecast Data (7-Day vs 30-Day)
  const activeForecast = useMemo(() => {
    return predictionPeriod === "7d"
      ? (currentCommodityData.predicted7d || [])
      : (currentCommodityData.predicted30d || []);
  }, [currentCommodityData, predictionPeriod]);

  // 7. Dynamic, Evidence-Based Market Risk Assessment (Documented Calculation Matrix)
  const marketRiskAssessment = useMemo(() => {
    const isSpecificLocation = filterState !== "All" || filterMarket !== "All";
    const locationName = filterMarket !== "All"
      ? `${filterMarket}, ${filterDistrict}`
      : filterState !== "All"
      ? (filterDistrict !== "All" ? `${filterDistrict}, ${filterState}` : filterState)
      : "All Reporting Mandis (Macro / National)";

    // Use sliced historical records from cleaned dataset, falling back to table records if needed
    const rawRecords = (Array.isArray(slicedHistoricalData) && slicedHistoricalData.length > 0)
      ? slicedHistoricalData
      : tableRecords;

    // Filter valid positive modal prices and deduplicate daily observations
    const dateMap = new Map();
    (rawRecords || []).forEach((r) => {
      const p = typeof r.modal === "number" && !isNaN(r.modal) ? r.modal : null;
      if (p !== null && p > 0) {
        const dKey = r.raw_date || r.date || "";
        if (dKey) {
          if (!dateMap.has(dKey)) dateMap.set(dKey, []);
          dateMap.get(dKey).push(p);
        }
      }
    });

    const dedupedDailyPrices = [];
    dateMap.forEach((prices, dKey) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      dedupedDailyPrices.push({ date: dKey, price: avg });
    });

    const distinctDatesCount = dedupedDailyPrices.length;

    // Indicator 1: Market Supply
    const marketSupply = {
      label: "Market Supply",
      value: "Not available",
      isAvailable: false,
      explanation: "Supply data is not available."
    };

    // Indicator 2: Price Changes (Historical Volatility)
    let priceChanges = {
      label: "Price Changes",
      value: "Insufficient data",
      numericCV: null,
      distinctDates: distinctDatesCount,
      isAvailable: false,
      explanation: `Need at least 3 dates to calculate changes (${distinctDatesCount} recorded).`,
      sourceText: `${distinctDatesCount} dates (${dateRange.toUpperCase()})`
    };

    if (distinctDatesCount >= 3) {
      const pVals = dedupedDailyPrices.map((d) => d.price);
      const mean = pVals.reduce((a, b) => a + b, 0) / pVals.length;
      const variance = pVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (pVals.length - 1);
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
      const formattedCV = Number(cv.toFixed(1));

      let expl = "";
      if (cv < 5.0) {
        expl = `Prices remained steady (±${formattedCV}%).`;
      } else if (cv < 15.0) {
        expl = `Prices changed moderately (±${formattedCV}%).`;
      } else {
        expl = `Prices fluctuated significantly (±${formattedCV}%).`;
      }

      priceChanges = {
        label: "Price Changes",
        value: `±${formattedCV}%`,
        numericCV: formattedCV,
        distinctDates: distinctDatesCount,
        isAvailable: true,
        explanation: expl,
        sourceText: `${distinctDatesCount} recorded dates (${dateRange.toUpperCase()})`
      };
    }

    // Indicator 3: Expected Price Trend (LSTM Forecast)
    let expectedPriceTrend = {
      label: "Expected Price Trend",
      value: "Forecast not available",
      numericChangePct: null,
      isAvailable: false,
      explanation: "Forecast not available for this commodity.",
      sourceText: "LSTM model forecast"
    };

    if (isSpecificLocation) {
      expectedPriceTrend.value = "Forecast not available for specific markets";
      expectedPriceTrend.isAvailable = false;
      expectedPriceTrend.explanation = "Model forecasts national trends, not individual markets. Historical price changes above remain active.";
      expectedPriceTrend.sourceText = "Market-level forecast not available";
    } else if (!currentCommodityData.hasModelForecast || !lstmApiData || !lstmApiData.forecastAvailable) {
      expectedPriceTrend.value = "Forecast not available";
      expectedPriceTrend.isAvailable = false;
      expectedPriceTrend.explanation = `Model forecast is not available for ${selectedCommodity}. Historical market prices remain fully active.`;
      expectedPriceTrend.sourceText = "Forecast not available";
    } else {
      const curP = typeof currentCommodityData.currentPrice === "number" ? currentCommodityData.currentPrice : (typeof lstmApiData.currentPrice === "number" ? lstmApiData.currentPrice : 1);
      const predP = typeof currentCommodityData.predictedPrice === "number" ? currentCommodityData.predictedPrice : (typeof lstmApiData.predictedPrice === "number" ? lstmApiData.predictedPrice : curP);
      const changeAmount = predP - curP;
      const changePct = curP > 0 ? (changeAmount / curP) * 100 : 0;
      const formattedPct = typeof currentCommodityData.priceChangePercent === "number"
        ? currentCommodityData.priceChangePercent
        : Number(changePct.toFixed(2));
      const absPct = Math.abs(formattedPct);
      const horizonDays = predictionPeriod === "30d" ? 30 : 7;

      let trendVal = "";
      let trendExpl = "";

      if (absPct < 3.0) {
        trendVal = `Fairly Stable (${formattedPct >= 0 ? "+" : ""}${formattedPct}%)`;
        trendExpl = `Estimated ${formattedPct >= 0 ? "+" : ""}${formattedPct}% shift over next ${horizonDays} days (₹${Math.round(curP)} → ₹${Math.round(predP)}/Qtl).`;
      } else if (changePct >= 3.0) {
        trendVal = `Expected to Rise (+${formattedPct}%)`;
        trendExpl = `Estimated +${formattedPct}% rise over next ${horizonDays} days (₹${Math.round(curP)} → ₹${Math.round(predP)}/Qtl).`;
      } else {
        trendVal = `Expected to Fall (${formattedPct}%)`;
        trendExpl = `Estimated ${formattedPct}% drop over next ${horizonDays} days (₹${Math.round(curP)} → ₹${Math.round(predP)}/Qtl).`;
      }

      expectedPriceTrend = {
        label: "Expected Price Trend",
        value: trendVal,
        numericChangePct: formattedPct,
        isAvailable: true,
        explanation: trendExpl,
        sourceText: `LSTM forecast (${predictionPeriod.toUpperCase()} horizon)`
      };
    }

    // Indicator 4: Overall Price Risk Level Evaluation (Consistent, data-driven conditions)
    let riskLevel = "Cannot be assessed";
    let riskScore = null;
    let riskSubtitle = "";
    let riskReason = "";
    let buyerRecommendation = "";

    const hasHist = priceChanges.isAvailable && priceChanges.numericCV !== null;
    const hasPred = expectedPriceTrend.isAvailable && expectedPriceTrend.numericChangePct !== null;

    if (!hasHist && !hasPred) {
      riskLevel = "Cannot be assessed";
      riskSubtitle = "Risk cannot be assessed";
      riskReason = `Insufficient price records (${distinctDatesCount} date(s) found) and no model prediction for ${selectedCommodity}.`;
      buyerRecommendation = "Select a broader date range or an active market hub.";
    } else if (hasHist && hasPred) {
      const cv = priceChanges.numericCV;
      const absPred = Math.abs(expectedPriceTrend.numericChangePct);

      if (cv >= 18.0 || absPred >= 20.0) {
        riskLevel = "High";
        riskScore = Math.min(95, Math.max(70, Math.round(70 + Math.max(cv - 18.0, absPred - 20.0) * 1.5)));
        riskReason = `Prices fluctuated significantly (±${cv}%) and the forecast expects a ${expectedPriceTrend.numericChangePct >= 0 ? "+" : ""}${expectedPriceTrend.numericChangePct}% shift.`;
        buyerRecommendation = "Prices are volatile. Consider shorter buying cycles or staggered purchases.";
      } else if (cv >= 8.0 || absPred >= 8.0) {
        riskLevel = "Medium";
        riskScore = Math.min(68, Math.max(36, Math.round(36 + Math.max(cv - 8.0, absPred - 8.0) * 2.2)));
        riskReason = `Prices changed moderately (±${cv}%) with a ${expectedPriceTrend.numericChangePct >= 0 ? "+" : ""}${expectedPriceTrend.numericChangePct}% expected shift.`;
        buyerRecommendation = "Prices are shifting moderately. Compare mandi rates before buying in bulk.";
      } else {
        riskLevel = "Low";
        riskScore = Math.min(35, Math.max(10, Math.round(Math.max(cv * 2.5, absPred * 2.5))));
        riskReason = `Prices remained steady (±${cv}%) with stable forecast outlook.`;
        buyerRecommendation = "Market conditions are steady for procurement.";
      }
      riskSubtitle = `Price Risk: ${riskLevel}`;
    } else if (hasHist && !hasPred) {
      const cv = priceChanges.numericCV;
      if (cv >= 18.0) {
        riskLevel = "High";
        riskScore = Math.min(95, Math.max(70, Math.round(70 + (cv - 18.0) * 1.5)));
        riskReason = `Prices fluctuated significantly (±${cv}%). Forecast not available.`;
        buyerRecommendation = "Prices are volatile. Consider shorter buying cycles.";
      } else if (cv >= 8.0) {
        riskLevel = "Medium";
        riskScore = Math.min(68, Math.max(36, Math.round(36 + (cv - 8.0) * 2.2)));
        riskReason = `Prices changed moderately (±${cv}%). Forecast not available.`;
        buyerRecommendation = "Monitor daily market rates before buying in bulk.";
      } else {
        riskLevel = "Low";
        riskScore = Math.min(35, Math.max(10, Math.round(cv * 3.0)));
        riskReason = `Prices remained steady (±${cv}%). Forecast not available.`;
        buyerRecommendation = "Market conditions are steady and predictable.";
      }
      riskSubtitle = `Price Risk: ${riskLevel} (Historical Only)`;
    } else if (!hasHist && hasPred) {
      const absPred = Math.abs(expectedPriceTrend.numericChangePct);
      if (absPred >= 20.0) {
        riskLevel = "High";
        riskScore = Math.min(95, Math.max(70, Math.round(70 + (absPred - 20.0) * 1.5)));
        riskReason = `Forecast expects a significant ${expectedPriceTrend.numericChangePct >= 0 ? "+" : ""}${expectedPriceTrend.numericChangePct}% shift.`;
        buyerRecommendation = "Prices are volatile. Consider shorter buying cycles.";
      } else if (absPred >= 8.0) {
        riskLevel = "Medium";
        riskScore = Math.min(68, Math.max(36, Math.round(36 + (absPred - 8.0) * 2.2)));
        riskReason = `Forecast expects a moderate ${expectedPriceTrend.numericChangePct >= 0 ? "+" : ""}${expectedPriceTrend.numericChangePct}% shift.`;
        buyerRecommendation = "Monitor market rates before bulk purchases.";
      } else {
        riskLevel = "Low";
        riskScore = Math.min(35, Math.max(10, Math.round(absPred * 3.0)));
        riskReason = `Forecast expects stable prices (${expectedPriceTrend.numericChangePct >= 0 ? "+" : ""}${expectedPriceTrend.numericChangePct}%).`;
        buyerRecommendation = "Market conditions are steady and predictable.";
      }
      riskSubtitle = `Price Risk: ${riskLevel} (Forecast Only)`;
    }

    const riskLevelClass = riskLevel === "Low"
      ? "low"
      : riskLevel === "Medium"
      ? "medium"
      : riskLevel === "High"
      ? "high"
      : "unknown";

    return {
      isSpecificLocation,
      locationName,
      distinctDatesCount,
      marketSupply,
      priceChanges,
      expectedPriceTrend,
      riskLevel,
      riskLevelClass,
      riskScore,
      riskSubtitle,
      riskReason,
      buyerRecommendation
    };
  }, [
    selectedCommodity,
    filterState,
    filterDistrict,
    filterMarket,
    dateRange,
    predictionPeriod,
    tableRecords,
    slicedHistoricalData,
    lstmApiData,
    lstmError,
    currentCommodityData
  ]);

  // Dynamic Pagination calculation backed by actual Parquet record count
  const totalPages = Math.max(1, Math.ceil(totalTableRecords / pageSize));

  // Reset Filters Handler
  const handleResetFilters = () => {
    setFilterState("All");
    setFilterDistrict("All");
    setFilterMarket("All");
    setDateRange("30d");
    setTableSearch("");
    setCurrentPage(1);
  };

  // Sorting Handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  // Location and Date labels for honest messaging
  const locationLabel = useMemo(() => {
    if (filterMarket !== "All") return `${filterMarket} (${filterDistrict !== "All" ? `${filterDistrict}, ` : ""}${filterState})`;
    if (filterDistrict !== "All") return `${filterDistrict}, ${filterState}`;
    if (filterState !== "All") return filterState;
    return "selected mandis across India";
  }, [filterState, filterDistrict, filterMarket]);

  const dateRangeLabel = useMemo(() => {
    if (dateRange === "7d") return "the last 7 days";
    if (dateRange === "14d") return "the last 14 days";
    if (dateRange === "30d") return "the last 30 days";
    return "all recorded dates in the dataset";
  }, [dateRange]);

  // Chart Dimension Helpers
  const chartWidth = 760;
  const chartHeight = 260;
  const padX = 50;
  const padY = 32;

  // --- Historical Chart Math ---
  const histValues = slicedHistoricalData
    .map((d) => d.modal)
    .filter((v) => typeof v === "number" && !isNaN(v));
  const histMin = histValues.length ? Math.min(...histValues) * 0.96 : 0;
  const histMax = histValues.length ? Math.max(...histValues) * 1.04 : 100;
  const histRange = Math.max(1, histMax - histMin);

  const histPoints = slicedHistoricalData.map((d, i) => {
    const x = padX + (i / Math.max(1, slicedHistoricalData.length - 1)) * (chartWidth - padX * 2);
    const val = typeof d.modal === "number" && !isNaN(d.modal) ? d.modal : histMin;
    const y = chartHeight - padY - ((val - histMin) / histRange) * (chartHeight - padY * 2);
    return { ...d, x, y };
  });

  const histPath = histPoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );
  const histArea = histPoints.length > 0
    ? `${histPath} L ${histPoints[histPoints.length - 1].x} ${chartHeight - padY} L ${histPoints[0].x} ${chartHeight - padY} Z`
    : "";

  // --- LSTM Prediction Chart Math ---
  const baselineHistorical = slicedHistoricalData.slice(-4);
  const safeActiveForecast = Array.isArray(activeForecast) ? activeForecast : [];
  const allPredValues = [
    ...baselineHistorical.map((d) => d.modal),
    ...safeActiveForecast.map((d) => d.price),
    ...safeActiveForecast.map((d) => d.upper),
    ...safeActiveForecast.map((d) => d.lower)
  ].filter((v) => typeof v === "number" && !isNaN(v));

  const predMin = allPredValues.length ? Math.min(...allPredValues) * 0.95 : 0;
  const predMax = allPredValues.length ? Math.max(...allPredValues) * 1.05 : 100;
  const predRange = Math.max(1, predMax - predMin);

  const totalPredSteps = Math.max(1, baselineHistorical.length + safeActiveForecast.length - 1);

  const predBasePoints = baselineHistorical.map((d, i) => {
    const x = padX + (i / totalPredSteps) * (chartWidth - padX * 2);
    const val = typeof d.modal === "number" && !isNaN(d.modal) ? d.modal : predMin;
    const y = chartHeight - padY - ((val - predMin) / predRange) * (chartHeight - padY * 2);
    return { ...d, x, y, isForecast: false, price: val };
  });

  const predForecastPoints = safeActiveForecast.map((d, i) => {
    const stepIdx = Math.max(0, baselineHistorical.length - 1) + (i + 1);
    const x = padX + (stepIdx / totalPredSteps) * (chartWidth - padX * 2);
    const val = typeof d.price === "number" && !isNaN(d.price) ? d.price : predMin;
    const valUpper = typeof d.upper === "number" && !isNaN(d.upper) ? d.upper : val;
    const valLower = typeof d.lower === "number" && !isNaN(d.lower) ? d.lower : val;
    const y = chartHeight - padY - ((val - predMin) / predRange) * (chartHeight - padY * 2);
    const yUpper = chartHeight - padY - ((valUpper - predMin) / predRange) * (chartHeight - padY * 2);
    const yLower = chartHeight - padY - ((valLower - predMin) / predRange) * (chartHeight - padY * 2);
    return { ...d, x, y, yUpper, yLower, isForecast: true, price: val, upper: valUpper, lower: valLower };
  });

  // Base path (historical line)
  const predBasePath = predBasePoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  // Forecast path (connecting safely from the last base point)
  const lastBasePoint = predBasePoints.length > 0 ? predBasePoints[predBasePoints.length - 1] : null;
  const predForecastPath = predForecastPoints.reduce(
    (acc, pt, i) => (i === 0 ? (lastBasePoint ? `M ${lastBasePoint.x} ${lastBasePoint.y} L ${pt.x} ${pt.y}` : `M ${pt.x} ${pt.y}`) : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  // Confidence Corridor (Shaded Band between upper and lower)
  const upperPathD = predForecastPoints.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.yUpper}`).join(" ");
  const lowerPathD = [...predForecastPoints].reverse().map((pt) => `L ${pt.x} ${pt.yLower}`).join(" ");
  const confidenceBandD = predForecastPoints.length > 0 ? `${upperPathD} ${lowerPathD} Z` : "";

  return (
    <div className="price-analytics-page">
      {/* 1. Page Header */}
      <div className="pa-header">
        <div className="pa-header-content">
          <span className="pa-eyebrow">Market Intelligence</span>
          <h1 className="pa-main-title">Price Analytics</h1>
          <p className="pa-subtitle">
            Track daily market prices, wholesale mandi trends, and future price predictions.
          </p>
        </div>
        {onNavigateToShock && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              className="pa-action-chip"
              onClick={() => onNavigateToShock(selectedCommodity)}
              title="See how this food affects your monthly budget"
            >
              ⚡ Check Food Basket Impact →
            </button>
          </div>
        )}

        {/* Commodity Selector Chips */}
        <div className="pa-commodity-chips-wrapper">
          <span className="chips-label">Quick Select:</span>
          <div className="pa-commodity-chips">
            {commodityList.map((cName) => {
              const cItem = COMMODITIES_DATA[cName];
              return (
                <button
                  key={cName}
                  type="button"
                  className={`pa-chip-btn ${selectedCommodity === cName ? "active" : ""}`}
                  onClick={() => {
                    setSelectedCommodity(cName);
                    handleResetFilters();
                  }}
                >
                  <span className="chip-icon">{cItem.icon}</span>
                  <span className="chip-name">{cName}</span>
                  <span className="chip-price">₹{cItem.currentPrice}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real-time Model Error Alert (if backend offline) */}
      {lstmError && (!lstmApiData || !lstmApiData.success) && (
        <div className="pa-api-error-banner" role="alert">
          <span className="pa-error-symbol">⚠️</span>
          <div className="pa-error-text">
            <strong>Price Forecast Service Temporarily Unavailable</strong>
            <p>
              Could not load the price forecast right now ({lstmError}). Real market prices and historical data below are still fully working.
            </p>
          </div>
          <button
            type="button"
            className="pa-error-retry-btn"
            onClick={() => fetchPrediction(selectedCommodity, predictionPeriod)}
            disabled={isLoadingLstm}
          >
            {isLoadingLstm ? "Retrying..." : "↻ Try Again"}
          </button>
        </div>
      )}

      {/* 2. Interactive Search & Filters Bar */}
      <div className="pa-filter-card">
        <div className="pa-filter-grid">
          {/* Commodity Search / Select */}
          <div className="pa-filter-item">
            <label htmlFor="commodity-select">
              Commodity {availableCommodities.length > 0 && <span className="pa-filter-badge">({availableCommodities.length})</span>}
            </label>
            <div className="pa-select-wrapper">
              <CustomDropdown
                id="commodity-select"
                value={selectedCommodity}
                onChange={(val) => {
                  setSelectedCommodity(val);
                  handleResetFilters();
                }}
                options={commodityOptions}
                placeholder="Choose commodity..."
              />
            </div>
          </div>

          {/* State Filter */}
          <div className="pa-filter-item">
            <label htmlFor="state-filter">
              State {availableStates.length > 0 && <span className="pa-filter-badge">({availableStates.length})</span>}
            </label>
            <div className="pa-select-wrapper">
              <CustomDropdown
                id="state-filter"
                value={filterState}
                onChange={(val) => handleStateChange(val)}
                options={stateOptions}
                placeholder="Select state..."
              />
            </div>
          </div>

          {/* District Filter (Dependent on State) */}
          <div className="pa-filter-item">
            <label htmlFor="district-filter">
              District {filterState !== "All" && <span className="pa-filter-badge">({availableDistricts.length})</span>}
            </label>
            <div className="pa-select-wrapper">
              <CustomDropdown
                id="district-filter"
                value={filterDistrict}
                disabled={filterState === "All" || isLoadingLocations}
                onChange={(val) => handleDistrictChange(val)}
                options={districtOptions}
                placeholder="Select district..."
              />
            </div>
          </div>

          {/* Market Filter (Dependent on State & District) */}
          <div className="pa-filter-item">
            <label htmlFor="market-filter">
              Market Mandi {filterState !== "All" && <span className="pa-filter-badge">({availableMarkets.length})</span>}
            </label>
            <div className="pa-select-wrapper">
              <CustomDropdown
                id="market-filter"
                value={filterMarket}
                disabled={filterState === "All" || isLoadingLocations}
                onChange={(val) => handleMarketChange(val)}
                options={marketOptions}
                placeholder="Select market..."
              />
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="pa-filter-item">
            <label htmlFor="date-range-filter">Date Range</label>
            <div className="pa-select-wrapper">
              <CustomDropdown
                id="date-range-filter"
                value={dateRange}
                onChange={(val) => {
                  setDateRange(val);
                  setCurrentPage(1);
                }}
                options={dateRangeOptions}
                alignRight={true}
              />
            </div>
          </div>

          {/* Reset Action */}
          <div className="pa-filter-btn-wrapper">
            <button
              type="button"
              className="pa-reset-filters-btn"
              onClick={handleResetFilters}
              title="Reset all filters to default"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>

      {/* 3. Summary Cards (Current Price, Previous Price, Change, Predicted, Risk) */}
      <div className="pa-summary-grid">
        {/* Card 1: Current Market Price */}
        <div className="pa-card pa-metric-card pa-card-emerald">
          <div className="pa-card-header">
            <span className="pa-card-label">Current Price</span>
            <span className="pa-card-icon-badge">{currentCommodityData.icon}</span>
          </div>
          <div className="pa-metric-main">
            {isLoadingTimeline ? (
              <strong className="pa-metric-num pa-loading-metric">Loading...</strong>
            ) : currentCommodityData.currentPrice !== null ? (
              <>
                <strong className="pa-metric-num pa-text-emerald">
                  ₹{Number(currentCommodityData.currentPrice).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                </strong>
                <span className="pa-metric-unit">/ {currentCommodityData.unit}</span>
              </>
            ) : (
              <strong className="pa-metric-num factor-unavailable">No Data</strong>
            )}
          </div>
          <div className="pa-card-footer">
            <span className="pa-subtext">
              {isLoadingTimeline ? (
                "Retrieving recorded mandi price..."
              ) : currentCommodityData.retailEquivalent !== null ? (
                <>Around <strong>₹{currentCommodityData.retailEquivalent} per kg</strong> in retail markets</>
              ) : (
                "No market transactions recorded"
              )}
            </span>
          </div>
        </div>

        {/* Card 2: Previous Price */}
        <div className="pa-card pa-metric-card pa-card-teal">
          <div className="pa-card-header">
            <span className="pa-card-label">Previous Price</span>
            <span className="pa-card-time-tag">Recent Benchmark</span>
          </div>
          <div className="pa-metric-main">
            {isLoadingTimeline ? (
              <strong className="pa-metric-num pa-loading-metric">Loading...</strong>
            ) : currentCommodityData.previousPrice !== null ? (
              <>
                <strong className="pa-metric-num pa-text-teal">
                  ₹{Number(currentCommodityData.previousPrice).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                </strong>
                <span className="pa-metric-unit">/ {currentCommodityData.unit}</span>
              </>
            ) : (
              <strong className="pa-metric-num factor-unavailable">No Data</strong>
            )}
          </div>
          <div className="pa-card-footer">
            <span className="pa-subtext">
              {isLoadingTimeline ? "Retrieving earlier rate..." : "Earlier recorded wholesale rate"}
            </span>
          </div>
        </div>

        {/* Card 3: Price Change (Amount & Percentage) */}
        <div className="pa-card pa-metric-card pa-card-cyan">
          <div className="pa-card-header">
            <span className="pa-card-label">Price Change</span>
            {isLoadingTimeline ? (
              <span className="pa-trend-pill">...</span>
            ) : hasValidPrices ? (
              <span
                className={`pa-trend-pill ${isPriceIncrease ? "trend-up" : "trend-down"}`}
              >
                {isPriceIncrease ? "▲ Rising" : "▼ Cooling"}
              </span>
            ) : (
              <span className="pa-trend-pill trend-down">N/A</span>
            )}
          </div>
          <div className="pa-metric-main">
            {isLoadingTimeline ? (
              <strong className="pa-metric-num pa-loading-metric">Loading...</strong>
            ) : hasValidPrices ? (
              <>
                <strong
                  className={`pa-metric-num ${isPriceIncrease ? "pa-text-emerald" : "pa-text-teal"}`}
                >
                  {isPriceIncrease ? "+" : ""}₹{Math.abs(priceChangeAmount).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                </strong>
                <span
                  className={`pa-change-pct ${isPriceIncrease ? "text-increase" : "text-decrease"}`}
                >
                  ({isPriceIncrease ? "+" : ""}{priceChangePct}%)
                </span>
              </>
            ) : (
              <strong className="pa-metric-num factor-unavailable">N/A</strong>
            )}
          </div>
          <div className="pa-card-footer">
            <span className="pa-subtext">
              {isLoadingTimeline ? "Calculating price change..." : "Difference from earlier recorded rate"}
            </span>
          </div>
        </div>

        {/* Card 4: Predicted Price (LSTM) */}
        <div className="pa-card pa-metric-card pa-card-ai">
          <div className="pa-card-header">
            <span className="pa-card-label pa-ai-label">Predicted Price</span>
            <span className={`pa-ai-badge ${isLoadingLstm ? "loading" : ""}`}>
              {isLoadingLstm
                ? "⟳ Forecasting..."
                : currentCommodityData.hasModelForecast
                ? "● AI Forecast"
                : "Forecast not available"}
            </span>
          </div>
          <div className="pa-metric-main">
            {currentCommodityData.hasModelForecast && currentCommodityData.predictedPrice !== null ? (
              <>
                <strong className="pa-metric-num pa-text-violet">
                  ₹{Number(currentCommodityData.predictedPrice).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                </strong>
                <span className="pa-metric-unit">/ {currentCommodityData.unit}</span>
              </>
            ) : (
              <strong className="pa-metric-num factor-unavailable" style={{ fontSize: "1.15rem", lineHeight: "1.4" }}>
                Forecast not available
              </strong>
            )}
          </div>
          <div className="pa-card-footer">
            <span className="pa-subtext">
              {currentCommodityData.hasModelForecast ? (
                <>
                  Projected {predictionPeriod} outlook:{" "}
                  <strong>
                    {currentCommodityData.priceChangePercent !== null
                      ? `${currentCommodityData.priceChangePercent >= 0 ? "+" : ""}${currentCommodityData.priceChangePercent}% change`
                      : "Calculating..."}
                  </strong>
                </>
              ) : (
                "Trained for benchmark foods"
              )}
            </span>
          </div>
        </div>

        {/* Card 5: Price Risk Level */}
        <div
          className={`pa-card pa-metric-card pa-risk-card pa-risk-${marketRiskAssessment.riskLevelClass}`}
        >
          <div className="pa-card-header">
            <span className="pa-card-label">Price Risk Level</span>
            <span
              className={`pa-risk-pill risk-${marketRiskAssessment.riskLevelClass}`}
            >
              {marketRiskAssessment.riskLevel === "Cannot be assessed"
                ? "Unassessed"
                : `${marketRiskAssessment.riskLevel} Risk`}
            </span>
          </div>
          <div className="pa-metric-main">
            <strong className="pa-metric-num pa-risk-title">
              {marketRiskAssessment.riskLevel === "Cannot be assessed"
                ? "Unassessed"
                : marketRiskAssessment.riskLevel}
            </strong>
            <span className="pa-volatility-sub">
              Vol: {marketRiskAssessment.priceChanges.isAvailable ? marketRiskAssessment.priceChanges.value : "N/A"}
            </span>
          </div>
          <div className="pa-card-footer">
            <div className="pa-risk-bar">
              <div
                className={`pa-risk-bar-fill risk-${marketRiskAssessment.riskLevelClass}`}
                style={{ width: `${marketRiskAssessment.riskScore || 0}%` }}
              />
            </div>
            <span className="pa-subtext">
              {marketRiskAssessment.riskScore !== null
                ? `Risk Score: ${marketRiskAssessment.riskScore}/100`
                : "Risk Score: N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Historical Price Analysis Section (Line Chart with Tooltip) */}
      <div className="pa-card pa-chart-card">
        <div className="pa-chart-header">
          <div className="pa-chart-title-group">
            <span className="pa-section-eyebrow">Price History</span>
            <h2 className="pa-chart-title">
              {currentCommodityData.name} Price Trend
            </h2>
            <p className="pa-chart-subtitle">
              Prices recorded in agricultural markets
            </p>
          </div>

          <div className="pa-chart-controls">
            {/* Trend Indicator Banner */}
            <div
              className={`pa-trend-indicator ${histTrend.isUp ? "trend-up" : "trend-down"}`}
            >
              <span>{histTrend.isUp ? "▲ Increased" : "▼ Decreased"}</span>
              <strong>
                {histTrend.isUp ? "+" : ""}{histTrend.pct}%
              </strong>
              <small>in selected period</small>
            </div>

            {/* Date Range Tabs */}
            <div className="pa-period-tabs">
              {[
                { id: "7d", label: "7 Days" },
                { id: "14d", label: "14 Days" },
                { id: "30d", label: "30 Days" },
                { id: "all", label: "All Time" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`pa-tab-btn ${dateRange === tab.id ? "active" : ""}`}
                  onClick={() => setDateRange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG Interactive Historical Chart */}
        <div className="pa-svg-wrapper">
          {isLoadingTimeline ? (
            <div className="pa-empty-table" style={{ minHeight: chartHeight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="pa-loading-spinner" />
              <h3 style={{ marginTop: "1rem" }}>Loading Market Price Data...</h3>
              <p>Loading market price records from dataset.</p>
            </div>
          ) : histPoints.length >= 2 ? (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="pa-price-svg"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line
                x1={padX}
                y1={padY}
                x2={chartWidth - padX}
                y2={padY}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeDasharray="4 4"
              />
              <line
                x1={padX}
                y1={chartHeight / 2}
                x2={chartWidth - padX}
                y2={chartHeight / 2}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeDasharray="4 4"
              />
              <line
                x1={padX}
                y1={chartHeight - padY}
                x2={chartWidth - padX}
                y2={chartHeight - padY}
                stroke="rgba(148, 163, 184, 0.22)"
              />

              {/* Area Fill */}
              {histArea && <path d={histArea} fill="url(#histGrad)" />}

              {/* Main Historical Line */}
              {histPath && (
                <path
                  d={histPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points */}
              {histPoints.map((pt, idx) => (
                <g
                  key={idx}
                  className="pa-chart-point"
                  onMouseEnter={() => setActiveHistTooltip(pt)}
                  onMouseLeave={() => setActiveHistTooltip(null)}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5"
                    fill="#0b1226"
                    stroke="#34d399"
                    strokeWidth="2.5"
                  />
                  {/* Date labels at bottom */}
                  {(idx % Math.ceil(histPoints.length / 6) === 0 ||
                    idx === histPoints.length - 1) && (
                    <text
                      x={pt.x}
                      y={chartHeight - 10}
                      fill="#94a3b8"
                      fontSize="11"
                      textAnchor="middle"
                    >
                      {pt.date}
                    </text>
                  )}
                </g>
              ))}

              {/* Active Hover Tooltip */}
              {activeHistTooltip && (
                <g className="pa-svg-tooltip">
                  <line
                    x1={activeHistTooltip.x}
                    y1={padY}
                    x2={activeHistTooltip.x}
                    y2={chartHeight - padY}
                    stroke="#34d399"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={activeHistTooltip.x}
                    cy={activeHistTooltip.y}
                    r="7"
                    fill="#34d399"
                    stroke="#064e3b"
                    strokeWidth="2"
                  />
                  <g
                    transform={`translate(${Math.min(
                      chartWidth - 140,
                      Math.max(10, activeHistTooltip.x - 65)
                    )}, ${Math.max(12, activeHistTooltip.y - 62)})`}
                  >
                    <rect
                      width="130"
                      height="52"
                      rx="6"
                      fill="#0a142e"
                      stroke="#34d399"
                      strokeWidth="1.5"
                    />
                    <text x="65" y="18" fill="#94a3b8" fontSize="10.5" textAnchor="middle">
                      {activeHistTooltip.date} • {activeHistTooltip.market}
                    </text>
                    <text
                      x="65"
                      y="38"
                      fill="#34d399"
                      fontSize="13"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      ₹{activeHistTooltip.modal} / Qtl
                    </text>
                  </g>
                </g>
              )}
            </svg>
          ) : histPoints.length === 1 ? (
            <div className="pa-single-point-view" style={{ minHeight: chartHeight }}>
              <div className="pa-single-badge">📍 Spot Price Recorded</div>
              <div style={{ fontSize: "2rem", fontWeight: "800", color: "#10b981", margin: "0.6rem 0" }}>
                ₹{histPoints[0].modal} / Quintal
              </div>
              <p style={{ maxWidth: "480px", color: "#94a3b8", fontSize: "0.92rem", margin: 0, lineHeight: 1.5 }}>
                Single price recorded on <strong>{histPoints[0].date}</strong> at <strong>{histPoints[0].market}</strong>. More dates are needed for a trend line.
              </p>
            </div>
          ) : (
            <div className="pa-empty-table" style={{ minHeight: chartHeight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="pa-empty-icon">📊</div>
              <h3>No Recorded Market Transactions</h3>
              <p>
                No market transactions were recorded for {currentCommodityData.name} in {locationLabel} for {dateRangeLabel}.
              </p>
            </div>
          )}
        </div>

        <div className="pa-chart-legend-strip">
          <div className="pa-legend-item">
            <span className="pa-legend-color-dot emerald" />
            <span>Actual Market Price (₹/Quintal)</span>
          </div>
          <div className="pa-legend-note">
            Hover over any point to inspect prices and dates.
          </div>
        </div>
      </div>

      {/* 5. LSTM Price Prediction Section (UI Comparison Section) */}
      <div className="pa-card pa-lstm-section">
        <div className="pa-lstm-header">
          <div className="pa-lstm-title-area">
            <div className="pa-ai-tag">
              <span className="pa-ai-sparkle">✦</span> AI Price Forecast
              {currentCommodityData.hasModelForecast && lstmApiData && (
                <span className="pa-model-epoch-badge">
                  • Active Model
                </span>
              )}
            </div>
            <h2 className="pa-lstm-heading">
              {currentCommodityData.name} Price Forecast
            </h2>
            <p className="pa-lstm-desc">
              Estimated future price trends based on recent market patterns
            </p>
          </div>

          <div className="pa-lstm-controls">
            <span className="pa-forecast-label">Forecast Horizon:</span>
            <div className="pa-period-tabs">
              <button
                type="button"
                className={`pa-tab-btn ${predictionPeriod === "7d" ? "active" : ""}`}
                onClick={() => setPredictionPeriod("7d")}
              >
                7-Day Forecast
              </button>
              <button
                type="button"
                className={`pa-tab-btn ${predictionPeriod === "30d" ? "active" : ""}`}
                onClick={() => setPredictionPeriod("30d")}
              >
                30-Day Forecast
              </button>
            </div>
          </div>
        </div>

        {currentCommodityData.hasModelForecast ? (
          <>
            {/* LSTM Comparison Chart */}
            <div className="pa-svg-wrapper">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="pa-price-svg"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="corridorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.04" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                <line
                  x1={padX}
                  y1={padY}
                  x2={chartWidth - padX}
                  y2={padY}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padX}
                  y1={chartHeight / 2}
                  x2={chartWidth - padX}
                  y2={chartHeight / 2}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeDasharray="4 4"
                />
                <line
                  x1={padX}
                  y1={chartHeight - padY}
                  x2={chartWidth - padX}
                  y2={chartHeight - padY}
                  stroke="rgba(148, 163, 184, 0.2)"
                />

                {/* Confidence Corridor Band */}
                {confidenceBandD && <path d={confidenceBandD} fill="url(#corridorGrad)" />}

                {/* Historical Solid Line */}
                {predBasePath && (
                  <path
                    d={predBasePath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Forecast Dashed Line */}
                {predForecastPath && (
                  <path
                    d={predForecastPath}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Historical Points */}
                {predBasePoints.map((pt, i) => (
                  <circle
                    key={`base-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="4.5"
                    fill="#0b1226"
                    stroke="#10b981"
                    strokeWidth="2.2"
                  />
                ))}

                {/* Forecast Points with Tooltip */}
                {predForecastPoints.map((pt, i) => (
                  <g
                    key={`pred-${i}`}
                    className="pa-chart-point"
                    onMouseEnter={() => setActivePredTooltip(pt)}
                    onMouseLeave={() => setActivePredTooltip(null)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="5"
                      fill="#0b1226"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                    />
                    {/* Date labels at bottom */}
                    {(i % Math.ceil(predForecastPoints.length / 5) === 0 ||
                      i === predForecastPoints.length - 1) && (
                      <text
                        x={pt.x}
                        y={chartHeight - 10}
                        fill="#38bdf8"
                        fontSize="11"
                        textAnchor="middle"
                      >
                        {pt.date}
                      </text>
                    )}
                  </g>
                ))}

                {/* Active Forecast Hover Tooltip */}
                {activePredTooltip && (
                  <g className="pa-svg-tooltip">
                    <line
                      x1={activePredTooltip.x}
                      y1={padY}
                      x2={activePredTooltip.x}
                      y2={chartHeight - padY}
                      stroke="#22d3ee"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={activePredTooltip.x}
                      cy={activePredTooltip.y}
                      r="7"
                      fill="#22d3ee"
                      stroke="#083344"
                      strokeWidth="2"
                    />
                    <g
                      transform={`translate(${Math.min(
                        chartWidth - 170,
                        Math.max(10, activePredTooltip.x - 85)
                      )}, ${Math.max(12, activePredTooltip.y - 70)})`}
                    >
                      <rect
                        width="170"
                        height="62"
                        rx="6"
                        fill="#08182b"
                        stroke="#22d3ee"
                        strokeWidth="1.5"
                      />
                      <text x="85" y="16" fill="#94a3b8" fontSize="10.5" textAnchor="middle">
                        LSTM Projected • {activePredTooltip.date}
                      </text>
                      <text
                        x="85"
                        y="34"
                        fill="#22d3ee"
                        fontSize="13"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        Est: ₹{activePredTooltip.price} / Qtl
                      </text>
                      <text x="85" y="52" fill="#38bdf8" fontSize="10" textAnchor="middle">
                        Range: ₹{activePredTooltip.lower} – ₹{activePredTooltip.upper} ({activePredTooltip.conf}% Conf)
                      </text>
                    </g>
                  </g>
                )}
              </svg>
            </div>

            {/* Forecast Legend and Disclaimer Notice */}
            <div className="pa-lstm-footer">
              <div className="pa-lstm-legend">
                <div className="pa-legend-item">
                  <span className="pa-legend-line solid-emerald" />
                  <span>Historical Baseline</span>
                </div>
                <div className="pa-legend-item">
                  <span className="pa-legend-line dashed-cyan" />
                  <span>LSTM Predicted Horizon ({predictionPeriod.toUpperCase()})</span>
                </div>
                <div className="pa-legend-item">
                  <span className="pa-legend-box cyan-shade" />
                  <span>90% Confidence Corridor</span>
                </div>
              </div>

              <div className="pa-lstm-disclaimer">
                <span className="pa-disclaimer-icon">✓</span>
                <span>
                  <strong>AI Price Forecast Active:</strong> Predictions are generated using machine learning trained on actual mandi market records (accuracy: ±₹537/quintal). Use this forecast as a helpful guide alongside real market rates.
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="pa-forecast-unavailable-box">
            <div className="pa-forecast-unavailable-pill">Forecast Not Available</div>
            <h3 className="pa-forecast-unavailable-title">
              Price Forecast Not Available for {currentCommodityData.name}
            </h3>
            <p className="pa-forecast-unavailable-text">
              Forecasts are trained for benchmark crops (Tomato, Onion, Potato, Rice, Wheat, Maize, Bengal Gram, Mustard). Historical market prices and price volatility indicators remain fully active.
            </p>
            <div className="pa-forecast-unavailable-note">
              ✓ Historical market prices and price indicators above remain fully active.
            </div>
          </div>
        )}
      </div>

      {/* 6. Price Risk Analysis Section */}
      <div className="pa-card pa-risk-analysis-section">
        <div className="pa-risk-analysis-header">
          <div>
            <span className="pa-section-eyebrow">Market Stability</span>
            <h2 className="pa-section-title">Price Risk</h2>
            <p className="pa-section-subtitle">
              Price stability and volatility for {currentCommodityData.name}
            </p>
          </div>

          <div className={`pa-risk-pill-large risk-${marketRiskAssessment.riskLevelClass}`}>
            <span className="risk-indicator-dot" />
            <span>
              {marketRiskAssessment.riskLevel === "Cannot be assessed"
                ? "Risk Cannot Be Assessed"
                : `Price Risk: ${marketRiskAssessment.riskLevel}`}
            </span>
            {(marketRiskAssessment.isSpecificLocation || !marketRiskAssessment.expectedPriceTrend.isAvailable) && marketRiskAssessment.riskLevel !== "Cannot be assessed" && (
              <span className="pa-pill-subtag">(Historical Only)</span>
            )}
          </div>
        </div>

        {/* Assessment Scope & Context Metadata Strip */}
        <div className="pa-risk-context-strip">
          <div className="pa-risk-context-item">
            <span>Food:</span> <strong>{selectedCommodity}</strong>
          </div>
          <div className="pa-risk-context-item">
            <span>Market:</span> <strong>{marketRiskAssessment.locationName}</strong>
          </div>
          <div className="pa-risk-context-item">
            <span>Period:</span>{" "}
            <strong>
              {dateRange.toUpperCase()} ({marketRiskAssessment.distinctDatesCount} dates)
            </strong>
          </div>
          <div className="pa-risk-context-item">
            <span>Forecast:</span>{" "}
            <strong>
              {marketRiskAssessment.isSpecificLocation
                ? "Historical only"
                : (marketRiskAssessment.expectedPriceTrend.isAvailable
                  ? `${predictionPeriod.toUpperCase()} (AI Model)`
                  : "Not available")}
            </strong>
          </div>
        </div>

        {/* Risk Overview Cards Grid: Price Risk, Price Changes, Forecast */}
        <div className={`pa-risk-cards-grid ${!marketRiskAssessment.expectedPriceTrend.isAvailable ? "has-no-forecast" : ""}`}>
          {/* Card 1: Price Risk */}
          <div className={`pa-factor-box pa-risk-card-item risk-border-${marketRiskAssessment.riskLevelClass}`}>
            <div className="pa-factor-top">
              <span className="factor-label">PRICE RISK</span>
              <span className={`pa-risk-badge risk-${marketRiskAssessment.riskLevelClass}`}>
                {marketRiskAssessment.riskLevel === "Cannot be assessed" ? "Unassessed" : `${marketRiskAssessment.riskLevel}`}
              </span>
            </div>
            <strong className={`factor-val risk-val-${marketRiskAssessment.riskLevelClass}`}>
              {marketRiskAssessment.riskLevel === "Cannot be assessed" ? "Cannot be assessed" : `${marketRiskAssessment.riskLevel} Risk`}
            </strong>
            {marketRiskAssessment.riskScore !== null && (
              <div className="pa-risk-mini-bar">
                <div
                  className={`pa-risk-mini-fill risk-${marketRiskAssessment.riskLevelClass}`}
                  style={{ width: `${marketRiskAssessment.riskScore}%` }}
                />
              </div>
            )}
            <p className="factor-desc">
              {marketRiskAssessment.riskReason}
            </p>
            <span className="factor-source-tag">
              {marketRiskAssessment.isSpecificLocation || !marketRiskAssessment.expectedPriceTrend.isAvailable
                ? "Based on historical records"
                : "Historical volatility + AI forecast"}
            </span>
          </div>

          {/* Card 2: Price Changes */}
          <div className="pa-factor-box pa-risk-card-item">
            <div className="pa-factor-top">
              <span className="factor-label">PRICE CHANGES</span>
              <span className="pa-metric-tag-cyan">Historical</span>
            </div>
            <strong className={`factor-val ${marketRiskAssessment.priceChanges.isAvailable ? "pa-text-cyan" : "factor-unavailable"}`}>
              {marketRiskAssessment.priceChanges.value}
            </strong>
            <p className="factor-desc">
              {marketRiskAssessment.priceChanges.explanation}
            </p>
            <span className="factor-source-tag">
              {marketRiskAssessment.priceChanges.sourceText}
            </span>
          </div>

          {/* Card 3: Forecast (Displayed only when an LSTM forecast is available) */}
          {marketRiskAssessment.expectedPriceTrend.isAvailable && (
            <div className="pa-factor-box pa-risk-card-item">
              <div className="pa-factor-top">
                <span className="factor-label">FORECAST</span>
                <span className="pa-metric-tag-violet">Prediction</span>
              </div>
              <strong className="factor-val pa-text-violet">
                {marketRiskAssessment.expectedPriceTrend.value}
              </strong>
              <p className="factor-desc">
                {marketRiskAssessment.expectedPriceTrend.explanation}
              </p>
              <span className="factor-source-tag">
                {marketRiskAssessment.expectedPriceTrend.sourceText}
              </span>
            </div>
          )}
        </div>

        {/* Quick Tip Guidance Banner */}
        <div className="pa-risk-tip-banner">
          <div className="pa-tip-icon">💡</div>
          <div className="pa-tip-content">
            <span className="pa-tip-label">Quick Tip:</span>
            <p className="pa-tip-text">{marketRiskAssessment.buyerRecommendation}</p>
          </div>
        </div>
      </div>

      {/* 7. Market Price Details Table (Search, Filter, Sort, Pagination) */}
      <div className="pa-card pa-table-card">
        <div className="pa-table-header">
          <div>
            <span className="pa-section-eyebrow">MANDI RECORDS</span>
            <h2 className="pa-section-title">Latest Market Prices</h2>
            <p className="pa-section-subtitle">
              Prices recorded in agricultural markets
            </p>
          </div>

          {/* In-table Search Bar */}
          <div className="pa-table-search-bar">
            <input
              type="text"
              placeholder="Search market, district, state..."
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
            {tableSearch && (
              <button
                type="button"
                className="pa-table-search-clear"
                onClick={() => setTableSearch("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {isLoadingTable ? (
          <div className="pa-table-loading">
            <div className="pa-loading-spinner" />
            <p>Loading market transactional records from cleaned dataset...</p>
          </div>
        ) : tableError ? (
          <div className="pa-empty-table">
            <div className="pa-empty-icon">⚠️</div>
            <h3>Unable to fetch market records</h3>
            <p>{tableError}</p>
            <button
              type="button"
              className="pa-reset-filters-btn"
              onClick={fetchTableData}
            >
              ↻ Retry Query
            </button>
          </div>
        ) : tableRecords.length === 0 ? (
          <div className="pa-empty-table">
            <div className="pa-empty-icon">🔍</div>
            <h3>No matching market records found</h3>
            <p>
              No transactional records match {selectedCommodity} in{" "}
              {filterMarket !== "All"
                ? `${filterMarket}, ${filterDistrict}`
                : filterDistrict !== "All"
                ? `${filterDistrict}, ${filterState}`
                : filterState !== "All"
                ? filterState
                : "the selected criteria"}.
            </p>
            <button
              type="button"
              className="pa-reset-filters-btn"
              onClick={handleResetFilters}
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="pa-table-container">
            <table className="pa-data-table">
              <thead>
                <tr>
                  <th className="pa-col-commodity" onClick={() => handleSort("commodity")}>
                    Commodity {sortField === "commodity" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-date" onClick={() => handleSort("date")}>
                    Date {sortField === "date" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-state" onClick={() => handleSort("state")}>
                    State {sortField === "state" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-district" onClick={() => handleSort("district")}>
                    District {sortField === "district" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-market" onClick={() => handleSort("market")}>
                    Market {sortField === "market" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-min" onClick={() => handleSort("min")}>
                    Min (₹/Qtl) {sortField === "min" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-max" onClick={() => handleSort("max")}>
                    Max (₹/Qtl) {sortField === "max" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="pa-col-modal" onClick={() => handleSort("modal")}>
                    Modal (₹/Qtl) {sortField === "modal" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRecords.map((row, idx) => {
                  const commodityName = row.commodity || selectedCommodity;
                  const dateVal = row.date || "—";
                  const stateVal = row.state || "—";
                  const districtVal = row.district || "—";
                  const marketVal = row.market || "—";
                  const minPriceStr = `₹${Number(row.min || 0).toLocaleString("en-IN")}`;
                  const maxPriceStr = `₹${Number(row.max || 0).toLocaleString("en-IN")}`;
                  const modalPriceStr = `₹${Number(row.modal || 0).toLocaleString("en-IN")}`;

                  return (
                    <tr key={row.id ? `${row.id}-${commodityName}-${idx}` : `${commodityName}-${marketVal}-${dateVal}-${idx}`}>
                      <td className="pa-col-commodity" title={commodityName}>
                        <span className="pa-table-commodity-cell">
                          <span className="commodity-dot" />
                          <strong>{commodityName}</strong>
                        </span>
                      </td>
                      <td className="pa-col-date" title={dateVal}>
                        <span className="pa-cell-truncate">{dateVal}</span>
                      </td>
                      <td className="pa-col-state" title={stateVal}>
                        <span className="pa-cell-truncate">{stateVal}</span>
                      </td>
                      <td className="pa-col-district" title={districtVal}>
                        <span className="pa-cell-truncate">{districtVal}</span>
                      </td>
                      <td className="pa-col-market" title={marketVal}>
                        <span className="pa-table-market-badge">{marketVal}</span>
                      </td>
                      <td className="pa-price-cell pa-col-min" title={minPriceStr}>{minPriceStr}</td>
                      <td className="pa-price-cell pa-col-max" title={maxPriceStr}>{maxPriceStr}</td>
                      <td className="pa-price-cell pa-modal-highlight pa-col-modal" title={modalPriceStr}>
                        <strong>{modalPriceStr}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer with Pagination */}
        {tableRecords.length > 0 && (
          <div className="pa-table-footer">
            <div className="pa-records-count">
              Showing{" "}
              <strong>
                {totalTableRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0}
              </strong>{" "}
              to{" "}
              <strong>
                {Math.min(
                  totalTableRecords,
                  currentPage * pageSize
                )}
              </strong>{" "}
              of <strong>{totalTableRecords.toLocaleString("en-IN")}</strong> records from cleaned dataset
            </div>

            <div className="pa-pagination-controls">
              <div className="pa-page-size-selector">
                <span>Per Page:</span>
                <select
                  value={pageSize}
                  onMouseDown={handleDropdownFocus}
                  onFocus={handleDropdownFocus}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>

              <div className="pa-pagination-buttons">
                <button
                  type="button"
                  className="pa-page-nav-btn"
                  disabled={currentPage === 1 || isLoadingTable}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="pa-page-num-indicator">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="pa-page-nav-btn"
                  disabled={currentPage >= totalPages || isLoadingTable}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// React Error Boundary to protect Price Analytics from unmounting or vanishing on unexpected errors
class PriceAnalyticsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PriceAnalytics caught an unexpected error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="price-analytics-page">
          <div className="pa-header">
            <h1 className="pa-main-title">Price Analytics</h1>
            <p className="pa-subtitle">Agricultural Market Intelligence</p>
          </div>
          <div className="pa-api-error-banner" role="alert" style={{ margin: "24px 0" }}>
            <span className="pa-error-symbol">⚠️</span>
            <div className="pa-error-text">
              <strong>Price Analytics Display Restored</strong>
              <p>An unexpected display error occurred. Please click below to reset and refresh the view.</p>
            </div>
            <button
              type="button"
              className="pa-error-retry-btn"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              ↻ Refresh Price Analytics
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PriceAnalytics(props) {
  return (
    <PriceAnalyticsErrorBoundary>
      <PriceAnalyticsMain {...props} />
    </PriceAnalyticsErrorBoundary>
  );
}
