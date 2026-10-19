import React, { useState, useEffect, useMemo, useRef } from "react";
import "./PriceShockImpact.css";
import { getApiEndpoints } from "./apiConfig";

// In-memory caches to avoid redundant python subprocess executions
const LSTM_PREDICT_CACHE = new Map();
const TIMELINE_PRICE_CACHE = new Map();
const SUB_RECOMMEND_CACHE = new Map();

// Supported LSTM commodities
const LSTM_COMMODITY_MAP = {
  tomato: "Tomato",
  onion: "Onion",
  potato: "Potato",
  rice: "Rice",
  wheat: "Wheat",
  maize: "Maize",
  "bengal gram": "Bengal Gram",
  mustard: "Mustard"
};

function getLstmMatch(foodName) {
  if (!foodName || typeof foodName !== "string") return null;
  const clean = foodName.trim().toLowerCase();

  // Direct exact match
  if (LSTM_COMMODITY_MAP[clean]) {
    return LSTM_COMMODITY_MAP[clean];
  }

  // Common crop name aliases
  if (clean.includes("tomato")) return "Tomato";
  if (clean.includes("onion")) return "Onion";
  if (clean.includes("potato") && !clean.includes("sweet")) return "Potato";
  if (clean.includes("rice")) return "Rice";
  if (clean.includes("wheat") || clean.includes("atta")) return "Wheat";
  if (clean.includes("maize") || clean.includes("corn")) return "Maize";
  if (clean.includes("bengal gram") || clean.includes("chana") || clean.includes("chickpea")) return "Bengal Gram";
  if (clean.includes("mustard")) return "Mustard";

  return null;
}

// In-flight promises to deduplicate concurrent requests across components & horizon toggles
const LSTM_IN_FLIGHT = new Map();
const TIMELINE_IN_FLIGHT = new Map();
const SUB_IN_FLIGHT = new Map();

// Cached working endpoint to eliminate trial-and-error latency
let preferredBaseUrl = "";

// Resilient multi-endpoint fetch helper with timeout and cancellation support
async function fetchShockApi(pathWithQuery, options = {}) {
  const cleanPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const rawEndpoints = getApiEndpoints(cleanPath);

  // Prioritize preferredBaseUrl if already determined
  let endpoints;
  if (preferredBaseUrl !== undefined && preferredBaseUrl !== null && preferredBaseUrl !== "") {
    const preferredFull = preferredBaseUrl.endsWith("/")
      ? preferredBaseUrl.slice(0, -1) + cleanPath
      : preferredBaseUrl + cleanPath;
    endpoints = [preferredFull, ...rawEndpoints.filter((u) => u !== preferredFull)];
  } else {
    endpoints = rawEndpoints;
  }

  // Set 8-second request timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 8000);

  // Link caller signal if provided
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
    for (const url of endpoints) {
      try {
        const res = await fetch(url, fetchOptions);
        if (res.ok) {
          if (!preferredBaseUrl) {
            preferredBaseUrl = url.startsWith("http") ? new URL(url).origin : "/";
          }
          return await res.json();
        }
        lastError = new Error(`Server returned HTTP ${res.status}`);
      } catch (err) {
        if (err.name === "AbortError" || fetchOptions.signal?.aborted) {
          throw err;
        }
        lastError = err;
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
  throw lastError || new Error("Failed to connect to AGRI-SWAP service.");
}

// Dual-horizon cache populator: stores both 7-day and 30-day views from any model prediction
function cacheDualHorizonPrediction(commodity, data) {
  if (!data || !data.success || !data.forecastAvailable) return;
  const cName = data.commodity || commodity;
  const normName = cName.trim();
  const curP = typeof data.currentPrice === "number" ? data.currentPrice : 0;

  // 1. 7-Day Horizon
  if (Array.isArray(data.predicted7d) && data.predicted7d.length > 0) {
    const p7 = Number(data.predicted7d[data.predicted7d.length - 1].price);
    const diff7 = round(p7 - curP, 1);
    const pct7 = curP > 0 ? round((diff7 / curP) * 100, 2) : 0;
    const data7 = {
      ...data,
      horizon: "7d",
      predictedPrice: p7,
      priceChange: diff7,
      priceChangePercent: pct7
    };
    LSTM_PREDICT_CACHE.set(`${normName}_7`, data7);
  } else if (data.horizon === "7d") {
    LSTM_PREDICT_CACHE.set(`${normName}_7`, data);
  }

  // 2. 30-Day Horizon
  if (Array.isArray(data.predicted30d) && data.predicted30d.length > 0) {
    const p30 = Number(data.predicted30d[data.predicted30d.length - 1].price);
    const diff30 = round(p30 - curP, 1);
    const pct30 = curP > 0 ? round((diff30 / curP) * 100, 2) : 0;
    const data30 = {
      ...data,
      horizon: "30d",
      predictedPrice: p30,
      priceChange: diff30,
      priceChangePercent: pct30
    };
    LSTM_PREDICT_CACHE.set(`${normName}_30`, data30);
  } else if (data.horizon === "30d") {
    LSTM_PREDICT_CACHE.set(`${normName}_30`, data);
  }
}

function fetchLSTMPrediction(commodity, h, signal) {
  const cacheKey = `${commodity}_${h}`;
  if (LSTM_PREDICT_CACHE.has(cacheKey)) {
    return Promise.resolve(LSTM_PREDICT_CACHE.get(cacheKey));
  }
  if (LSTM_IN_FLIGHT.has(cacheKey)) {
    return LSTM_IN_FLIGHT.get(cacheKey);
  }

  const promise = fetchShockApi(
    `/api/prices/predict?commodity=${encodeURIComponent(commodity)}&horizon=${h}`,
    { signal }
  )
    .then((data) => {
      if (data && data.success && data.forecastAvailable) {
        cacheDualHorizonPrediction(commodity, data);
        return LSTM_PREDICT_CACHE.get(cacheKey) || data;
      }
      return null;
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        console.warn(`LSTM prediction failed for ${commodity} (${h}d):`, err.message);
      }
      return null;
    })
    .finally(() => {
      LSTM_IN_FLIGHT.delete(cacheKey);
    });

  LSTM_IN_FLIGHT.set(cacheKey, promise);
  return promise;
}

// Distinct coordinated card theme mapping for foods
function getFoodCardTheme(name) {
  const clean = (name || "").toLowerCase();
  if (clean.includes("onion")) return "theme-onion";
  if (clean.includes("tomato")) return "theme-tomato";
  if (clean.includes("milk")) return "theme-milk";
  if (clean.includes("rice")) return "theme-rice";
  if (clean.includes("potato")) return "theme-potato";
  if (clean.includes("wheat") || clean.includes("atta")) return "theme-wheat";
  return "theme-default";
}

// Clean SVG Icons
function IconBudgetAnalytics() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <polyline points="7 15 12 9 16 13 21 6" />
      <polyline points="16 6 21 6 21 11" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconBasket() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h16l-2 10H6L4 10z" />
      <path d="M12 3v7" />
      <path d="M8 5l4-2 4 2" />
    </svg>
  );
}

function IconSwap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function round(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function PriceShockImpact({
  basket = [],
  monthlyBudget = 5000,
  isActive = true,
  onNavigate,
  onNavigateToSubstitution,
  onNavigateToPrices
}) {
  // Horizon selection: 7 or 30 days (supported by LSTM)
  const [horizon, setHorizon] = useState(7);

  // Substitution preference
  const [subPreference, setSubPreference] = useState("balanced");

  // View switch: "overview" (Impact Cards) vs "substitution" (Whole-Basket Savings Matrix)
  const [activeTab, setActiveTab] = useState("overview");

  // Filter type
  const [filterType, setFilterType] = useState("all");

  // API data states (keyed by item + horizon/preference to eliminate stale state leaking)
  const [lstmData, setLstmData] = useState({});
  const [timelineData, setTimelineData] = useState({});
  const [substitutionsData, setSubstitutionsData] = useState({});
  const [loadingItems, setLoadingItems] = useState({});
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Track component mounted status to prevent memory leak
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stabilize basket contents so reference recreation in parent does not trigger unwanted effects
  const basketIdentity = useMemo(() => {
    if (!basket || !Array.isArray(basket)) return "";
    return basket
      .map((i) => `${i.id || i.name}:${i.quantity}:${i.monthlyUsage}:${i.unit}:${i.estimatedPrice}`)
      .join("|");
  }, [basket]);

  // Helper to parse numeric monthly quantity from basket item
  const parseMonthlyUsage = (item) => {
    if (!item) return 1;
    if (typeof item.monthlyUsage === "number" && item.monthlyUsage > 0) {
      return item.monthlyUsage;
    }
    if (typeof item.monthlyUsage === "string") {
      const match = item.monthlyUsage.match(/[\d.]+/);
      if (match) {
        const val = parseFloat(match[0]);
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
    return Math.max(1, Number(item.quantity || 1) * 3);
  };

  // Helper for retail estimation when live market pricing is unavailable
  const getFallbackUnitRate = (name = "", unit = "kg") => {
    const cleanName = (name || "").toLowerCase();
    const cleanUnit = (unit || "kg").toLowerCase();

    if (cleanUnit === "pieces") {
      if (cleanName.includes("egg")) return 8;
      if (cleanName.includes("apple") || cleanName.includes("orange")) return 20;
      if (cleanName.includes("bread") || cleanName.includes("bun")) return 35;
      return 15;
    }
    if (cleanUnit === "litre") {
      if (cleanName.includes("milk")) return 60;
      if (cleanName.includes("oil")) return 145;
      return 50;
    }
    if (cleanUnit === "g") {
      return 0.1;
    }
    // Default kg
    if (cleanName.includes("rice")) return 65;
    if (cleanName.includes("wheat") || cleanName.includes("atta")) return 42;
    if (cleanName.includes("dal") || cleanName.includes("pulse")) return 110;
    if (cleanName.includes("potato")) return 28;
    if (cleanName.includes("tomato")) return 35;
    if (cleanName.includes("onion")) return 32;
    if (cleanName.includes("sugar")) return 45;
    if (cleanName.includes("paneer")) return 360;
    return 40;
  };

  const activeHorizonRef = useRef(horizon);
  activeHorizonRef.current = horizon;

  // 1. Fetch LSTM Forecasts for supported commodities with immediate cache resolution, batching & active tracking
  useEffect(() => {
    if (!basket || basket.length === 0) return;

    let isCurrent = true;
    const requestedHorizon = horizon;
    const immediateCached = {};
    const commoditiesToFetch = new Set();
    const itemsPending = [];

    basket.forEach((item) => {
      const lstmCommodity = getLstmMatch(item.name);
      if (!lstmCommodity) return;

      const cacheKey = `${lstmCommodity}_${requestedHorizon}`;
      const stateKey = `${item.id}_${requestedHorizon}`;

      if (LSTM_PREDICT_CACHE.has(cacheKey)) {
        immediateCached[stateKey] = LSTM_PREDICT_CACHE.get(cacheKey);
      } else {
        commoditiesToFetch.add(lstmCommodity);
        itemsPending.push({ item, lstmCommodity, stateKey });
      }
    });

    // Synchronously apply all cached predictions in one render tick
    if (Object.keys(immediateCached).length > 0) {
      setLstmData((prev) => ({ ...prev, ...immediateCached }));
    }

    if (itemsPending.length === 0) return;

    // Set loading only for uncached items
    setLoadingItems((prev) => {
      const next = { ...prev };
      itemsPending.forEach(({ item }) => {
        next[item.id] = true;
      });
      return next;
    });

    const commList = Array.from(commoditiesToFetch);

    // Fast path: use batch predict endpoint to fetch all missing commodities in 1 round-trip
    const fetchPromise = commList.length > 1
      ? fetchShockApi(`/api/prices/predict?commodity=${encodeURIComponent(commList.join(","))}&horizon=${requestedHorizon}`)
          .then((batchData) => {
            if (batchData && batchData.success && batchData.predictions) {
              const updates = {};
              Object.entries(batchData.predictions).forEach(([commName, pred]) => {
                cacheDualHorizonPrediction(commName, pred);
              });
              itemsPending.forEach(({ item, lstmCommodity, stateKey }) => {
                const cKey = `${lstmCommodity}_${requestedHorizon}`;
                if (LSTM_PREDICT_CACHE.has(cKey)) {
                  updates[stateKey] = LSTM_PREDICT_CACHE.get(cKey);
                }
              });
              return updates;
            }
            throw new Error("Batch prediction returned no predictions");
          })
          .catch(() => {
            // Fall back gracefully to individual fetches if batch fails
            return Promise.all(
              itemsPending.map(({ item, lstmCommodity, stateKey }) =>
                fetchLSTMPrediction(lstmCommodity, requestedHorizon).then((data) => ({
                  stateKey,
                  data
                }))
              )
            ).then((results) => {
              const updates = {};
              results.forEach((r) => {
                if (r && r.data) updates[r.stateKey] = r.data;
              });
              return updates;
            });
          })
      : fetchLSTMPrediction(commList[0], requestedHorizon).then((data) => {
          const updates = {};
          if (data) {
            itemsPending.forEach(({ stateKey }) => {
              updates[stateKey] = data;
            });
          }
          return updates;
        });

    fetchPromise.then((updates) => {
      if (!isCurrent || !isMountedRef.current || activeHorizonRef.current !== requestedHorizon) {
        return; // Discard outdated response: newer horizon already selected!
      }
      if (updates && Object.keys(updates).length > 0) {
        setLstmData((prev) => ({ ...prev, ...updates }));
      }
      setLoadingItems((prev) => {
        const next = { ...prev };
        itemsPending.forEach(({ item }) => {
          next[item.id] = false;
        });
        return next;
      });
    }).catch(() => {
      if (!isCurrent || !isMountedRef.current || activeHorizonRef.current !== requestedHorizon) return;
      setLoadingItems((prev) => {
        const next = { ...prev };
        itemsPending.forEach(({ item }) => {
          next[item.id] = false;
        });
        return next;
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [basketIdentity, horizon]);

  // Background verification prefetch for any missing alternate horizon predictions
  useEffect(() => {
    if (!basket || basket.length === 0 || !isActive) return;
    const alternateHorizon = horizon === 7 ? 30 : 7;
    const timer = setTimeout(() => {
      const missingAlternate = [];
      basket.forEach((item) => {
        const lstmCommodity = getLstmMatch(item.name);
        if (lstmCommodity && !LSTM_PREDICT_CACHE.has(`${lstmCommodity}_${alternateHorizon}`)) {
          missingAlternate.push(lstmCommodity);
        }
      });
      if (missingAlternate.length > 0) {
        if (missingAlternate.length > 1) {
          fetchShockApi(`/api/prices/predict?commodity=${encodeURIComponent(missingAlternate.join(","))}&horizon=${alternateHorizon}`)
            .then((bData) => {
              if (bData && bData.success && bData.predictions) {
                Object.entries(bData.predictions).forEach(([cName, pData]) => {
                  cacheDualHorizonPrediction(cName, pData);
                });
              }
            })
            .catch(() => {});
        } else {
          fetchLSTMPrediction(missingAlternate[0], alternateHorizon).catch(() => {});
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [basketIdentity, horizon, isActive]);

  // 2. Fetch Historical Mandi Timeline for non-LSTM items with cancellation
  useEffect(() => {
    if (!basket || basket.length === 0) return;

    const controller = new AbortController();
    let isCancelled = false;

    basket.forEach((item) => {
      const lstmCommodity = getLstmMatch(item.name);
      if (lstmCommodity) return; // Handled by LSTM

      const cacheKey = `timeline_${item.name}`;
      if (TIMELINE_PRICE_CACHE.has(cacheKey)) {
        setTimelineData((prev) => ({ ...prev, [item.id]: TIMELINE_PRICE_CACHE.get(cacheKey) }));
        return;
      }

      if (TIMELINE_IN_FLIGHT.has(cacheKey)) {
        TIMELINE_IN_FLIGHT.get(cacheKey).then((data) => {
          if (!isCancelled && isMountedRef.current && data) {
            setTimelineData((prev) => ({ ...prev, [item.id]: data }));
          }
        });
        return;
      }

      const p = fetchShockApi(
        `/api/prices/timeline?commodity=${encodeURIComponent(item.name)}&dateRange=30d`,
        { signal: controller.signal }
      )
        .then((data) => {
          if (!isCancelled && isMountedRef.current && data && data.success && data.currentPrice) {
            TIMELINE_PRICE_CACHE.set(cacheKey, data);
            setTimelineData((prev) => ({ ...prev, [item.id]: data }));
            return data;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          TIMELINE_IN_FLIGHT.delete(cacheKey);
        });

      TIMELINE_IN_FLIGHT.set(cacheKey, p);
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [basketIdentity]);

  // 3. Fetch Substitutions for all basket foods with cancellation & keying by preference
  useEffect(() => {
    if (!basket || basket.length === 0) return;

    const controller = new AbortController();
    let isCancelled = false;
    const immediateCachedSubs = {};
    const itemsToFetch = [];

    basket.forEach((item) => {
      const monthlyQty = parseMonthlyUsage(item);
      const cacheKey = `sub_${item.name}_${monthlyQty}_${item.unit || "kg"}_${subPreference}`;
      const stateKey = `${item.id}_${subPreference}`;
      if (SUB_RECOMMEND_CACHE.has(cacheKey)) {
        immediateCachedSubs[stateKey] = SUB_RECOMMEND_CACHE.get(cacheKey);
      } else {
        itemsToFetch.push({ item, monthlyQty, cacheKey, stateKey });
      }
    });

    if (Object.keys(immediateCachedSubs).length > 0) {
      setSubstitutionsData((prev) => ({ ...prev, ...immediateCachedSubs }));
    }

    if (itemsToFetch.length === 0) {
      setLoadingSubs(false);
      return;
    }

    setLoadingSubs(true);
    const fetchPromises = itemsToFetch.map(({ item, monthlyQty, cacheKey, stateKey }) => {
      if (SUB_IN_FLIGHT.has(cacheKey)) {
        return SUB_IN_FLIGHT.get(cacheKey).then((data) => ({ stateKey, data }));
      }

      const p = fetchShockApi(
        `/api/substitutions?food=${encodeURIComponent(item.name)}&quantity=${monthlyQty}&unit=${encodeURIComponent(item.unit || "kg")}&preference=${encodeURIComponent(subPreference)}`,
        { signal: controller.signal }
      )
        .then((data) => {
          if (data && data.success) {
            SUB_RECOMMEND_CACHE.set(cacheKey, data);
            return data;
          }
          return null;
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn(`Substitution failed for ${item.name}:`, err.message);
          }
          return null;
        })
        .finally(() => {
          SUB_IN_FLIGHT.delete(cacheKey);
        });

      SUB_IN_FLIGHT.set(cacheKey, p);
      return p.then((data) => ({ stateKey, data }));
    });

    Promise.all(fetchPromises)
      .then((results) => {
        if (isCancelled || !isMountedRef.current) return;
        const newSubs = {};
        results.forEach((r) => {
          if (r && r.data) {
            newSubs[r.stateKey] = r.data;
          }
        });
        if (Object.keys(newSubs).length > 0) {
          setSubstitutionsData((prev) => ({ ...prev, ...newSubs }));
        }
      })
      .finally(() => {
        if (!isCancelled && isMountedRef.current) setLoadingSubs(false);
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [basketIdentity, subPreference]);

  // Process and compute shock metrics for each item in the basket
  const analyzedItems = useMemo(() => {
    if (!basket || basket.length === 0) return [];

    return basket.map((item) => {
      const monthlyQty = parseMonthlyUsage(item);
      const unit = (item.unit || "kg").trim();
      const lstmRes = lstmData[`${item.id}_${horizon}`];
      const timelineRes = timelineData[item.id];

      let baselineUnitPrice = null;
      let scenarioUnitPrice = null;
      let priceSource = "Price data not available";
      let sourceType = "unavailable"; // 'lstm' | 'market' | 'unavailable'
      let priceChangePercent = 0;
      let riskLevel = "Normal";
      let riskScore = 0;
      let isPriced = false;

      // 1. Check PyTorch LSTM Forecast (checks instant cache for selected horizon first)
      const lstmCommodity = getLstmMatch(item.name);
      const cachedLstm = lstmCommodity ? LSTM_PREDICT_CACHE.get(`${lstmCommodity}_${horizon}`) : null;
      const effectiveLstm = cachedLstm || lstmRes;
      const isLoadingForecast = Boolean(lstmCommodity && loadingItems[item.id] && !effectiveLstm);

      if (effectiveLstm && effectiveLstm.success && effectiveLstm.forecastAvailable && effectiveLstm.currentPrice > 0) {
        // LSTM modal prices are quoted in ₹ / Quintal. Convert to ₹ / kg (1 Quintal = 100 kg)
        baselineUnitPrice = round(effectiveLstm.currentPrice / 100, 2);
        scenarioUnitPrice = round(effectiveLstm.predictedPrice / 100, 2);
        priceChangePercent = effectiveLstm.priceChangePercent || 0;
        riskLevel = effectiveLstm.riskLevel || "Medium";
        riskScore = effectiveLstm.riskScore || 35;
        priceSource = `Price Forecast (${horizon} days)`;
        sourceType = "lstm";
        isPriced = true;
      }
      // If it is an LSTM commodity currently waiting on model inference, do not display fake 0% change
      else if (isLoadingForecast) {
        const itemEstimatedRate = Number(item.estimatedPrice) > 0
          ? Number(item.estimatedPrice)
          : getFallbackUnitRate(item.name, unit);
        baselineUnitPrice = round(itemEstimatedRate, 2);
        scenarioUnitPrice = null;
        priceChangePercent = null;
        riskLevel = "Calculating";
        riskScore = 0;
        priceSource = `Calculating forecast (${horizon} days)...`;
        sourceType = "lstm";
        isPriced = true;
      }
      // 2. Check Historical Mandi Parquet Timeline (DuckDB)
      else if (timelineRes && timelineRes.success && timelineRes.currentPrice > 0) {
        baselineUnitPrice = round(timelineRes.currentPrice / 100, 2);
        scenarioUnitPrice = baselineUnitPrice;
        priceChangePercent = 0;
        priceSource = "Recent Market Price";
        sourceType = "market";
        riskLevel = "Normal";
        riskScore = 15;
        isPriced = true;
      }
      // 3. Check Verified Basket Baseline / Household Rate
      else {
        const itemEstimatedRate = Number(item.estimatedPrice) > 0
          ? Number(item.estimatedPrice)
          : getFallbackUnitRate(item.name, unit);

        if (Number.isFinite(itemEstimatedRate) && itemEstimatedRate > 0) {
          baselineUnitPrice = round(itemEstimatedRate, 2);
          scenarioUnitPrice = baselineUnitPrice;
          priceChangePercent = 0;
          priceSource = "Estimated Grocery Rate";
          sourceType = "market";
          riskLevel = "Normal";
          riskScore = 10;
          isPriced = true;
        }
      }

      // Cost calculations
      let baselineMonthlyCost = null;
      let scenarioMonthlyCost = null;
      let deltaSpending = null;
      let isIncrease = true;

      if (isPriced && baselineUnitPrice !== null) {
        baselineMonthlyCost = round(baselineUnitPrice * monthlyQty, 1);
        if (scenarioUnitPrice !== null) {
          scenarioMonthlyCost = round(scenarioUnitPrice * monthlyQty, 1);
          deltaSpending = round(scenarioMonthlyCost - baselineMonthlyCost, 1);
          isIncrease = deltaSpending >= 0;
        } else {
          scenarioMonthlyCost = null;
          deltaSpending = null;
          isIncrease = true;
        }
      }

      // Check substitution data for this item with current preference
      const subResult = substitutionsData[`${item.id}_${subPreference}`];
      const topAlt = subResult?.alternatives && subResult.alternatives.length > 0
        ? subResult.alternatives[0]
        : null;

      let subAlternativeName = null;
      let subMonthlyQty = null;
      let subMonthlyCost = null;
      let subMonthlySavings = null;
      let hasValidSub = false;

      if (topAlt && isPriced) {
        subAlternativeName = topAlt.alternative;
        const subRatio = Number(topAlt.substitutionRatio) || 1.0;
        subMonthlyQty = round(monthlyQty * subRatio, 2);

        // If the alternative has a valid price per kg in the substitution dataset
        if (Number(topAlt.alternativePricePerKg) > 0 && scenarioMonthlyCost !== null) {
          const altRate = Number(topAlt.alternativePricePerKg);
          subMonthlyCost = round(altRate * subMonthlyQty, 1);
          subMonthlySavings = round(scenarioMonthlyCost - subMonthlyCost, 1);
          hasValidSub = true;
        }
      }

      return {
        ...item,
        monthlyQty,
        unit,
        isPriced,
        sourceType,
        priceSource,
        baselineUnitPrice,
        scenarioUnitPrice,
        priceChangePercent,
        riskLevel,
        riskScore,
        baselineMonthlyCost,
        scenarioMonthlyCost,
        deltaSpending,
        isIncrease,
        topAlt,
        subAlternativeName,
        subMonthlyQty,
        subMonthlyCost,
        subMonthlySavings,
        hasValidSub
      };
    });
  }, [basketIdentity, lstmData, timelineData, substitutionsData, horizon, subPreference, loadingItems]);

  // Summary statistics for the whole basket
  const summaryStats = useMemo(() => {
    const totalItems = analyzedItems.length;
    const pricedItems = analyzedItems.filter((i) => i.isPriced);
    const unpricedItems = analyzedItems.filter((i) => !i.isPriced);
    const lstmItems = analyzedItems.filter((i) => i.sourceType === "lstm" && i.scenarioUnitPrice !== null);
    const calculatingItems = analyzedItems.filter((i) => i.sourceType === "lstm" && i.scenarioUnitPrice === null);

    const totalBaselineCost = round(
      pricedItems.reduce((acc, i) => acc + (i.baselineMonthlyCost || 0), 0),
      1
    );

    const totalScenarioCost = round(
      pricedItems.reduce((acc, i) => acc + (i.scenarioUnitPrice !== null ? (i.scenarioMonthlyCost || 0) : (i.baselineMonthlyCost || 0)), 0),
      1
    );

    const totalAdditionalSpending = round(totalScenarioCost - totalBaselineCost, 1);
    const isIncrease = totalAdditionalSpending >= 0;

    const remainingBudget = round(monthlyBudget - totalScenarioCost, 1);
    const isBudgetOverrun = remainingBudget < 0;

    // Substituted basket totals (applying top verified substitutions that yield net savings)
    let totalSubstitutedCost = 0;
    let substitutedCount = 0;

    pricedItems.forEach((item) => {
      if (item.hasValidSub && item.subMonthlyCost !== null && item.subMonthlySavings > 0) {
        totalSubstitutedCost += item.subMonthlyCost;
        substitutedCount += 1;
      } else {
        totalSubstitutedCost += (item.scenarioUnitPrice !== null ? item.scenarioMonthlyCost : item.baselineMonthlyCost) || 0;
      }
    });

    totalSubstitutedCost = round(totalSubstitutedCost, 1);
    const potentialWholeBasketSavings = round(Math.max(0, totalScenarioCost - totalSubstitutedCost), 1);

    return {
      totalItems,
      pricedCount: pricedItems.length,
      unpricedCount: unpricedItems.length,
      lstmCount: lstmItems.length,
      isCalculating: calculatingItems.length > 0,
      totalBaselineCost,
      totalScenarioCost,
      totalAdditionalSpending,
      isIncrease,
      remainingBudget,
      isBudgetOverrun,
      totalSubstitutedCost,
      substitutedCount,
      potentialWholeBasketSavings
    };
  }, [analyzedItems, monthlyBudget]);

  // Filtered items list based on active pill
  const filteredItems = useMemo(() => {
    return analyzedItems.filter((item) => {
      if (filterType === "lstm") return item.sourceType === "lstm";
      if (filterType === "high_risk") return item.riskLevel === "High";
      if (filterType === "unpriced") return !item.isPriced;
      return true;
    });
  }, [analyzedItems, filterType]);

  // If basket is empty, render clean empty state
  if (!basket || basket.length === 0) {
    return (
      <section className="shock-page-container">
        <div className="shock-header">
          <div className="shock-header-title">
            <span className="eyebrow-shock">
              <IconBudgetAnalytics /> Food Price Impact
            </span>
            <h2>Food Price Impact</h2>
            <p>See how food price changes affect your monthly budget.</p>
          </div>
        </div>

        <div className="shock-empty-state">
          <span className="shock-empty-icon">🧺</span>
          <h3>Your Food Basket is Empty</h3>
          <p>
            You currently have no food items tracked in <strong>My Food Basket</strong>.
            Add items such as Tomato, Potato, Onion, Rice, or Wheat to see price impacts and potential savings.
          </p>
          <button
            type="button"
            className="btn-primary-action"
            onClick={() => onNavigate && onNavigate("My Food Basket")}
          >
            <IconBasket /> Open My Food Basket
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="shock-page-container">
      {/* 1. Page Header */}
      <div className="shock-header">
        <div className="shock-header-title">
          <span className="eyebrow-shock">
            <IconBudgetAnalytics /> Food Price Impact
          </span>
          <h2>Food Price Impact</h2>
          <p>See how food price changes affect your monthly budget.</p>
        </div>

        <div className="shock-header-actions">
          <button
            type="button"
            className="btn-secondary-link btn-nav-dashboard"
            onClick={() => onNavigate && onNavigate("Dashboard")}
            title="Return to AGRI-SWAP Dashboard"
          >
            🏠 Dashboard
          </button>
          <button
            type="button"
            className="btn-secondary-link btn-nav-basket"
            onClick={() => onNavigate && onNavigate("My Food Basket")}
            title="Edit quantities and items in your food basket"
          >
            <IconBasket /> Manage Basket ({basket.length})
          </button>
          <button
            type="button"
            className="btn-secondary-link btn-nav-sub"
            onClick={() => onNavigate && onNavigate("Food Substitution")}
            title="Explore substitution science and nutrition profiles"
          >
            <IconSwap /> Food Substitution
          </button>
          <button
            type="button"
            className="btn-secondary-link btn-nav-prices"
            onClick={() => onNavigate && onNavigate("Price Analytics")}
            title="View market prices & time series"
          >
            📊 Price Analytics
          </button>
        </div>
      </div>

      {/* 2. Controls Panel */}
      <div className="shock-controls-card">
        <div className="controls-grid">
          {/* Horizon Selector */}
          <div className="control-item control-item-horizon">
            <label htmlFor="horizon-control">
              <IconSparkles /> Price Prediction Period
            </label>
            <div className="control-segmented" id="horizon-control">
              <button
                type="button"
                className={`control-segmented-btn ${horizon === 7 ? "active" : ""}`}
                onClick={() => setHorizon(7)}
              >
                Next 7 Days
              </button>
              <button
                type="button"
                className={`control-segmented-btn ${horizon === 30 ? "active" : ""}`}
                onClick={() => setHorizon(30)}
              >
                Next 30 Days
              </button>
            </div>
          </div>

          {/* Substitution Preference Selector */}
          <div className="control-item control-item-preference">
            <label htmlFor="sub-pref-select">
              What matters most?
            </label>
            <select
              id="sub-pref-select"
              className="control-select-styled"
              value={subPreference}
              onChange={(e) => setSubPreference(e.target.value)}
            >
              <option value="balanced">Balanced (Nutrition & Price)</option>
              <option value="price">Save Most Money (Price First)</option>
              <option value="nutrition">Best Nutrition (Health First)</option>
              <option value="cooking">Cooking & Taste Match</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Whole-Basket Summary Cards */}
      <div className="shock-kpi-grid">
        {/* Card 1: Basket Items & Coverage */}
        <div className="shock-kpi-card kpi-blue">
          <div className="shock-kpi-header">
            <span className="shock-kpi-label">Foods with Price Data</span>
            <span className="shock-kpi-icon">📊</span>
          </div>
          <strong className="shock-kpi-value">
            {summaryStats.pricedCount} / {summaryStats.totalItems}
          </strong>
          <span className="shock-kpi-subtext">
            {summaryStats.lstmCount} price forecasts
          </span>
        </div>

        {/* Card 2: Current Monthly Cost */}
        <div className="shock-kpi-card kpi-purple">
          <div className="shock-kpi-header">
            <span className="shock-kpi-label">Current Monthly Cost</span>
            <span className="shock-kpi-icon">🏷️</span>
          </div>
          <strong className="shock-kpi-value">
            ₹{summaryStats.totalBaselineCost.toLocaleString()}
          </strong>
          <span className="shock-kpi-subtext">
            What you currently spend on these foods
          </span>
        </div>

        {/* Card 3: New Monthly Cost */}
        <div className="shock-kpi-card kpi-amber">
          <div className="shock-kpi-header">
            <span className="shock-kpi-label">Estimated New Cost</span>
            <span className="shock-kpi-icon">⚡</span>
          </div>
          <strong className="shock-kpi-value">
            ₹{summaryStats.totalScenarioCost.toLocaleString()}
          </strong>
          <span className="shock-kpi-subtext">
            {summaryStats.isIncrease ? "+" : "-"}₹{Math.abs(summaryStats.totalAdditionalSpending).toLocaleString()} (
            {summaryStats.totalBaselineCost > 0
              ? `${Math.round((summaryStats.totalAdditionalSpending / summaryStats.totalBaselineCost) * 100)}%`
              : "0%"}
            )
          </span>
        </div>

        {/* Card 4: Budget Impact */}
        <div className={`shock-kpi-card ${summaryStats.isBudgetOverrun ? "kpi-crimson" : "kpi-emerald"}`}>
          <div className="shock-kpi-header">
            <span className="shock-kpi-label">
              {summaryStats.isBudgetOverrun ? "Over Budget" : "Budget Left"}
            </span>
            <span className="shock-kpi-icon">{summaryStats.isBudgetOverrun ? "⚠️" : "🛡️"}</span>
          </div>
          <strong className="shock-kpi-value">
            ₹{Math.abs(summaryStats.remainingBudget).toLocaleString()}
          </strong>
          <span className="shock-kpi-subtext">
            Monthly target: ₹{monthlyBudget.toLocaleString()} ({summaryStats.isBudgetOverrun ? "Over budget" : "Left"})
          </span>
        </div>
      </div>

      {/* 4. Partial Data Disclaimer */}
      {summaryStats.unpricedCount > 0 && (
        <div className="disclaimer-banner warning">
          <span className="disclaimer-icon">ℹ️</span>
          <div>
            <strong>Basket notice:</strong> Calculations include{" "}
            <strong>{summaryStats.pricedCount} of {summaryStats.totalItems} foods</strong> with price data.{" "}
            {summaryStats.unpricedCount} food item(s) are not included in the totals because market prices are not yet available.
          </div>
        </div>
      )}

      {/* 5. View Switcher & Filter Pills */}
      <div className="view-tabs-bar">
        <div className="tab-buttons-group">
          <button
            type="button"
            className={`view-tab-btn tab-food-impact ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            📋 Food-by-Food Impact
          </button>
          <button
            type="button"
            className={`view-tab-btn tab-compare-savings ${activeTab === "substitution" ? "active" : ""}`}
            onClick={() => setActiveTab("substitution")}
          >
            🔄 Compare Food Savings
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="filter-pills-group">
            <button
              type="button"
              className={`filter-pill pill-all ${filterType === "all" ? "active" : ""}`}
              onClick={() => setFilterType("all")}
            >
              All ({analyzedItems.length})
            </button>
            <button
              type="button"
              className={`filter-pill pill-ai ${filterType === "lstm" ? "active" : ""}`}
              onClick={() => setFilterType("lstm")}
            >
              Price Forecasts ({summaryStats.lstmCount})
            </button>
            <button
              type="button"
              className={`filter-pill pill-risk ${filterType === "high_risk" ? "active" : ""}`}
              onClick={() => setFilterType("high_risk")}
            >
              High Risk
            </button>
            {summaryStats.unpricedCount > 0 && (
              <button
                type="button"
                className={`filter-pill pill-unpriced ${filterType === "unpriced" ? "active" : ""}`}
                onClick={() => setFilterType("unpriced")}
              >
                No Price Data ({summaryStats.unpricedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* 6. TAB A: Item-by-Item Detailed Impact Cards */}
      {activeTab === "overview" && (
        <div className="shock-items-grid">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`shock-item-card ${getFoodCardTheme(item.name)} ${!item.isPriced ? "is-unpriced" : ""}`}
            >
              {/* Header */}
              <div className="item-card-header">
                <div className="item-title-col">
                  <div className="item-name-row">
                    <h4 className="item-food-name">{item.name}</h4>
                    <span className="item-unit-badge">{item.unit}</span>
                  </div>
                  <span className="item-qty-subtext">
                    Monthly usage: <strong>{item.monthlyQty} {item.unit}</strong>
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                  {item.sourceType === "lstm" && (
                    <span className="source-tag tag-lstm">
                      PRICE TREND
                    </span>
                  )}
                  {!item.isPriced && (
                    <span className="source-tag tag-unavailable">
                      ⚠️ No Price Data
                    </span>
                  )}
                  {item.isPriced && (
                    <span className={`risk-tag ${item.riskLevel === "Calculating" ? "risk-loading" : `risk-${item.riskLevel.toLowerCase()}`}`}>
                      {item.riskLevel === "Calculating" ? "Calculating..." : `${item.riskLevel} Risk`}
                    </span>
                  )}
                </div>
              </div>

              {/* Price Metrics */}
              {item.isPriced ? (
                <>
                  <div className="price-metric-box">
                    <div className="metric-col">
                      <span className="metric-label">Current Price</span>
                      <span className="metric-rate">₹{item.baselineUnitPrice} / {item.unit}</span>
                      <span className="metric-cost">₹{item.baselineMonthlyCost} / mo</span>
                    </div>
                    <div className="metric-col">
                      <span className="metric-label">
                        {item.scenarioUnitPrice !== null
                          ? (item.sourceType === "lstm"
                              ? `EXPECTED PRICE (${item.priceChangePercent >= 0 ? "+" : ""}${item.priceChangePercent}%)`
                              : "EXPECTED PRICE")
                          : `EXPECTED PRICE (${horizon}D)`}
                      </span>
                      {item.scenarioUnitPrice !== null ? (
                        <>
                          <span className="metric-rate">₹{item.scenarioUnitPrice} / {item.unit}</span>
                          <span className={`metric-cost ${item.deltaSpending > 0 ? "shocked" : ""}`}>
                            ₹{item.scenarioMonthlyCost} / mo
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="metric-rate forecast-pulse" style={{ color: "var(--accent-cyan, #38bdf8)" }}>
                            Forecasting...
                          </span>
                          <span className="metric-cost forecast-pulse" style={{ fontSize: "0.95rem", color: "var(--text-muted, #94a3b8)" }}>
                            Calculating impact...
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Spending Delta Strip */}
                  <div className={`delta-strip ${item.deltaSpending === null ? "neutral" : item.deltaSpending === 0 ? "neutral" : !item.isIncrease ? "reduction" : ""}`}>
                    <span className="delta-label">
                      {item.deltaSpending === null
                        ? `Forecasting ${horizon}-day impact...`
                        : item.deltaSpending === 0
                        ? "Monthly Cost Impact"
                        : item.isIncrease
                        ? "Extra Cost per Month"
                        : "Estimated Cost Reduction"}
                    </span>
                    <strong className="delta-val">
                      {item.deltaSpending === null
                        ? "Calculating..."
                        : item.deltaSpending === 0
                        ? "₹0"
                        : item.isIncrease
                        ? `+₹${item.deltaSpending}`
                        : `-₹${Math.abs(item.deltaSpending)}`}
                    </strong>
                  </div>
                </>
              ) : (
                <div style={{ padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-md)", fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Price data is not yet available for this food item.
                </div>
              )}

              {/* Action Buttons */}
              <div className="item-actions-row">
                {item.hasValidSub ? (
                  <button
                    type="button"
                    className="btn-mini-link btn-alt-link"
                    onClick={() => setActiveTab("substitution")}
                    title={`Alternative available: ${item.subAlternativeName}`}
                  >
                    <IconSwap />
                    <span className="alt-text-truncate">
                      Swap with {item.subAlternativeName} (Save ₹{item.subMonthlySavings})
                    </span>
                  </button>
                ) : (
                  <span className="source-caption-text">
                    Source: {item.priceSource}
                  </span>
                )}

                {item.sourceType === "lstm" && onNavigateToPrices && (
                  <button
                    type="button"
                    className="btn-mini-link btn-market-link"
                    onClick={() => onNavigateToPrices(item.name)}
                  >
                    View Market Prices →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 7. TAB B: Whole-Basket Substitution Savings Matrix */}
      {activeTab === "substitution" && (
        <div className="substitution-comparison-section">
          {/* Savings Highlight Banner */}
          <div className="savings-highlight-card">
            <div className="savings-highlight-info">
              <h3>
                <IconSparkles /> Compare Food Savings
              </h3>
              <p>
                By choosing similar, budget-friendly foods, you can protect your monthly budget without losing nutrition.
              </p>
            </div>

            <div className="savings-highlight-amount">
              <span className="amount-label">Potential Monthly Savings</span>
              <span className="amount-val">
                ₹{summaryStats.potentialWholeBasketSavings.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="substitution-matrix-wrapper">
            <table className="substitution-table">
              <thead>
                <tr>
                  <th>Current Food</th>
                  <th>Suggested Alternative</th>
                  <th>Match Score</th>
                  <th>New Price</th>
                  <th>With Alternative</th>
                  <th>Monthly Savings</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {analyzedItems.map((item) => (
                  <tr key={item.id} className={`shock-table-row ${getFoodCardTheme(item.name)}`}>
                    {/* Original */}
                    <td className="sub-original-cell">
                      <strong>{item.name}</strong>
                      <span>{item.monthlyQty} {item.unit} / month</span>
                    </td>

                    {/* Alternative */}
                    <td className="sub-alternative-cell">
                      {item.topAlt ? (
                        <>
                          <strong>{item.topAlt.alternative}</strong>
                          <span>
                            {item.subMonthlyQty} {item.topAlt.unit || item.unit} ({item.topAlt.substitutionRatio}x ratio)
                          </span>
                        </>
                      ) : loadingSubs ? (
                        <span className="sub-status-unchanged" style={{ opacity: 0.7 }}>Finding alternatives...</span>
                      ) : (
                        <span className="sub-status-unchanged">No alternative available</span>
                      )}
                    </td>

                    {/* Match Score */}
                    <td>
                      {item.topAlt ? (
                        <span className="badge-match-score">
                          {item.topAlt.matchScore}% Match
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Scenario Cost */}
                    <td>
                      {item.isPriced && item.scenarioMonthlyCost !== null ? (
                        <span className="cell-currency shocked">
                          ₹{item.scenarioMonthlyCost}
                        </span>
                      ) : item.isPriced ? (
                        <span className="forecast-pulse" style={{ fontSize: "0.82rem", color: "var(--accent-cyan, #38bdf8)" }}>Calculating...</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Substituted Cost */}
                    <td>
                      {item.hasValidSub ? (
                        <span className="cell-currency">
                          ₹{item.subMonthlyCost}
                        </span>
                      ) : item.isPriced ? (
                        <span className="sub-status-unchanged">Unchanged (₹{item.scenarioMonthlyCost ?? item.baselineMonthlyCost})</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Net Savings */}
                    <td>
                      {item.hasValidSub && item.subMonthlySavings !== null ? (
                        <span className="cell-currency saving">
                          {item.subMonthlySavings > 0
                            ? `Save ₹${item.subMonthlySavings}`
                            : `+₹${Math.abs(item.subMonthlySavings)}`}
                        </span>
                      ) : (
                        <span className="sub-status-unchanged">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td>
                      {onNavigateToSubstitution && (
                        <button
                          type="button"
                          className="btn-mini-link btn-explore-link"
                          onClick={() => onNavigateToSubstitution(item.name)}
                        >
                          Explore <IconArrowRight />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default React.memo(PriceShockImpact);
