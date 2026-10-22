import React, { useState, useEffect, useMemo, useRef } from "react";
import "./FoodSubstitution.css";
import { getApiEndpoints } from "./apiConfig";

// SVG Icons
function IconSwapMini() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCompare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="8" height="18" rx="2" />
      <rect x="14" y="3" width="8" height="18" rx="2" />
      <path d="M6 8h.01M18 8h.01M6 12h.01M18 12h.01" />
    </svg>
  );
}

function IconBasketMini() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h16l-2 10H6L4 10z" />
      <path d="M12 3v7" />
      <path d="M8 5l4-2 4 2" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
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

function getFoodIcon(name) {
  if (!name || typeof name !== "string") return "🥗";
  const trimmed = name.trim();
  const cap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (COMMODITY_ICONS[cap]) return COMMODITY_ICONS[cap];
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(COMMODITY_ICONS)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return "🥗";
}

function capitalizeFood(name) {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const POPULAR_STAPLES = [
  "Tomato", "Potato", "Onion", "Spinach", "Pumpkin",
  "Cabbage", "Carrot", "Green Beans", "Cauliflower", "Brinjal"
];

// Helper to simplify technical explainability text into short, everyday English
function simplifyReason(reason) {
  if (!reason || typeof reason !== "string") return reason;
  let str = reason;

  // Simplify nutrient similarity
  str = str.replace(/High nutrient similarity \((\d+)%\) with comparable macronutrient profile/gi, "Healthy nutrient match ($1%)");
  str = str.replace(/High nutrient similarity/gi, "Healthy nutrient match");
  str = str.replace(/with comparable macronutrient profile/gi, "with healthy nutrients");
  str = str.replace(/Moderate nutritional alignment \((\d+)%\)/gi, "Decent nutrient match ($1%)");
  str = str.replace(/Moderate nutritional alignment/gi, "Decent nutrient match");

  // Simplify cooking role
  str = str.replace(/Compatible cooking role \(([^)]+)\) in ([^)]+) recipes with ([\d.]+)x ratio/gi, "Cooks similarly in $2 dishes ($3x ratio)");
  str = str.replace(/Compatible cooking role/gi, "Cooks similarly in recipes");

  // Simplify estimated savings
  str = str.replace(/Estimated savings of Rs\.\s*([\d.]+)\s*\(([\d.]+)% lower cost for ([^)]+)\)/gi, "Saves ₹$1 ($2% less for $3)");
  str = str.replace(/Estimated savings/gi, "Money saved");

  // Simplify market price suitability
  str = str.replace(/Favorable market price suitability index \((\d+)%\)/gi, "Budget-friendly price ($1% match)");

  // Simplify market availability
  str = str.replace(/High availability across APMC mandis nationwide/gi, "Widely available in local mandis");
  str = str.replace(/Moderate seasonal market availability/gi, "Available in seasonal mandis");

  return str;
}

// Simple, easy-to-understand preference strategies in basic English
const PREFERENCE_OPTIONS = [
  {
    id: "balanced",
    title: "⚖️ Best Overall",
    desc: "Good balance of nutrition, low cost, and similar taste"
  },
  {
    id: "nutrition",
    title: "🥗 Better Nutrition",
    desc: "Matches healthy protein, vitamins, and minerals closely"
  },
  {
    id: "price",
    title: "💰 Save More",
    desc: "Finds the lowest priced foods to save you the most money"
  },
  {
    id: "cooking",
    title: "🍳 Similar Cooking Use",
    desc: "Finds foods that cook and taste similar in everyday dishes"
  }
];

// Cached working endpoint to eliminate serial connection attempts
let preferredSubBaseUrl = "";

// Helper to fetch across Vite proxy, IPv4, and localhost with cached endpoint & timeout
async function fetchApiData(urlPath, options = {}) {
  const cleanPath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  const rawEndpoints = getApiEndpoints(cleanPath);

  let endpoints;
  if (preferredSubBaseUrl !== undefined && preferredSubBaseUrl !== null && preferredSubBaseUrl !== "") {
    const preferredFull = preferredSubBaseUrl.endsWith("/")
      ? preferredSubBaseUrl.slice(0, -1) + cleanPath
      : preferredSubBaseUrl + cleanPath;
    endpoints = [preferredFull, ...rawEndpoints.filter((u) => u !== preferredFull)];
  } else {
    endpoints = rawEndpoints;
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000);

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
          if (!preferredSubBaseUrl && url.startsWith("http")) {
            const parsed = new URL(url);
            preferredSubBaseUrl = parsed.origin;
          }
          return await res.json();
        }
        try {
          const errJson = await res.json();
          if (errJson && (errJson.message || errJson.error)) {
            lastError = new Error(errJson.message || errJson.error);
            continue;
          }
        } catch (_) {}
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
  throw lastError || new Error("Failed to connect to AGRI-SWAP food substitution service.");
}

// Module-level caches to make chip clicks & tab switching instantaneous
let CACHED_AVAILABLE_FOODS = null;
const SUB_DATA_CACHE = new Map();
const SUB_IN_FLIGHT = new Map();

// Bounded, internally scrollable dropdown component displaying ~12 options at a time
function CustomDropdown({
  id,
  value,
  onChange,
  options = [],
  disabled = false,
  className = "",
  placeholder = "Select...",
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
      className={`sub-custom-dropdown-container ${className} ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
    >
      <button
        id={id}
        type="button"
        className="sub-custom-dropdown-trigger"
        onClick={handleToggle}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel || id}
      >
        <span className="sub-custom-dropdown-label">{displayLabel}</span>
        <span className="sub-custom-dropdown-chevron" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div ref={listRef} className="sub-custom-dropdown-menu" role="listbox">
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={opt.value}
                className={`sub-custom-dropdown-item ${isSelected ? "active" : ""}`}
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

export default function FoodSubstitution({
  onAddToBasket,
  onNavigateToPrices,
  onNavigateToShock,
  initialFood = "Tomato"
}) {
  // Query Form State
  const [selectedFood, setSelectedFood] = useState(initialFood || "Tomato");
  const [customFoodInput, setCustomFoodInput] = useState("");
  const [quantity, setQuantity] = useState(3);
  const [unit, setUnit] = useState("kg");
  const [preference, setPreference] = useState("balanced");

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

  // Data & Loading State
  const [availableFoods, setAvailableFoods] = useState(() => CACHED_AVAILABLE_FOODS || []);

  // Memoized options for food selection dropdown
  const foodOptions = useMemo(() => {
    if (availableFoods && availableFoods.length > 0) {
      return availableFoods.map((f) => ({
        value: f.name,
        label: `${f.name} (${f.foodRole} • ${f.alternativeCount} swaps)`
      }));
    }
    return POPULAR_STAPLES.map((name) => ({
      value: name,
      label: name
    }));
  }, [availableFoods]);
  const [resultData, setResultData] = useState(() => {
    const defaultKey = `${(initialFood || "Tomato").toLowerCase()}_3_kg_balanced`;
    return SUB_DATA_CACHE.get(defaultKey) || null;
  });
  const [loading, setLoading] = useState(false);
  const [foodsLoading, setFoodsLoading] = useState(false);
  const [error, setError] = useState("");

  // Toolbar Filters
  const [sortBy, setSortBy] = useState("score");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  // Comparison Modal State
  const [comparingAlt, setComparingAlt] = useState(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 3500);
  };

  // Fetch Available Foods from Backend (only once per app lifecycle)
  useEffect(() => {
    let isMounted = true;
    if (CACHED_AVAILABLE_FOODS && CACHED_AVAILABLE_FOODS.length > 0) {
      setAvailableFoods(CACHED_AVAILABLE_FOODS);
      return;
    }
    setFoodsLoading(true);

    fetchApiData("/api/substitutions/foods")
      .then((data) => {
        if (data && Array.isArray(data.foods)) {
          CACHED_AVAILABLE_FOODS = data.foods;
          if (isMounted) setAvailableFoods(data.foods);
        }
      })
      .catch((err) => {
        console.warn("Could not load available foods list:", err);
      })
      .finally(() => {
        if (isMounted) setFoodsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Substitutions with instant cache resolution and in-flight deduplication
  const fetchSubstitutions = async (targetFood = selectedFood, targetQty = quantity, targetUnit = unit, targetPref = preference) => {
    const foodName = (targetFood || "").trim();
    if (!foodName) {
      setError("Please select or enter a valid food item to replace.");
      return;
    }

    const cacheKey = `${foodName.toLowerCase()}_${targetQty}_${targetUnit.toLowerCase()}_${targetPref.toLowerCase()}`;

    // Fast-path: display cached substitution result immediately
    if (SUB_DATA_CACHE.has(cacheKey)) {
      setResultData(SUB_DATA_CACHE.get(cacheKey));
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const queryPath = `/api/substitutions?food=${encodeURIComponent(foodName)}&quantity=${encodeURIComponent(targetQty)}&unit=${encodeURIComponent(targetUnit)}&preference=${encodeURIComponent(targetPref)}`;

      let fetchPromise;
      if (SUB_IN_FLIGHT.has(cacheKey)) {
        fetchPromise = SUB_IN_FLIGHT.get(cacheKey);
      } else {
        fetchPromise = fetchApiData(queryPath)
          .then((data) => {
            if (data && data.success) {
              SUB_DATA_CACHE.set(cacheKey, data);
            }
            return data;
          })
          .finally(() => {
            SUB_IN_FLIGHT.delete(cacheKey);
          });
        SUB_IN_FLIGHT.set(cacheKey, fetchPromise);
      }

      const data = await fetchPromise;

      if (!data.success && data.message) {
        setError(data.message);
        setResultData(null);
      } else {
        setResultData(data);
      }
    } catch (err) {
      console.error("Substitution fetch error:", err);
      const isOffline = err.message && (
        err.message.includes("Failed to fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("HTTP 502") ||
        err.message.includes("HTTP 504") ||
        err.message.includes("Failed to connect")
      );
      if (isOffline) {
        setError("Unable to connect to AGRI-SWAP backend service on port 5000. Please start the backend server via 'npm run server' or the start script.");
      } else {
        setError(err.message || "Unable to load substitutions from AGRI-SWAP service.");
      }
      setResultData(null);
    } finally {
      setLoading(false);
    }
  };

  // Automatically fetch on first mount
  useEffect(() => {
    fetchSubstitutions(selectedFood, quantity, unit, preference);
  }, []);

  // Sync external initialFood navigation updates when kept alive
  useEffect(() => {
    if (initialFood && initialFood !== selectedFood) {
      setSelectedFood(initialFood);
      fetchSubstitutions(initialFood, quantity, unit, preference);
    }
  }, [initialFood]);

  // Handle Quick Select Chip Click
  const handleQuickChipClick = (foodName) => {
    setSelectedFood(foodName);
    fetchSubstitutions(foodName, quantity, unit, preference);
  };

  // Processed and Filtered Alternatives List
  const processedAlternatives = useMemo(() => {
    if (!resultData || !Array.isArray(resultData.alternatives)) return [];

    let list = [...resultData.alternatives];

    // Search filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter((item) =>
        (item.alternative || "").toLowerCase().includes(q) ||
        (item.foodRole || "").toLowerCase().includes(q)
      );
    }

    // Availability filter
    if (availabilityFilter !== "all") {
      list = list.filter((item) =>
        (item.availability || "").toLowerCase() === availabilityFilter.toLowerCase()
      );
    }

    // Sort order
    if (sortBy === "score") {
      list.sort((a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0));
    } else if (sortBy === "savings") {
      list.sort((a, b) => (Number(b.estimatedSavings) || 0) - (Number(a.estimatedSavings) || 0));
    } else if (sortBy === "nutrition") {
      list.sort((a, b) => (Number(b.nutritionSimilarity) || 0) - (Number(a.nutritionSimilarity) || 0));
    } else if (sortBy === "price") {
      list.sort((a, b) => (Number(b.priceSuitability) || 0) - (Number(a.priceSuitability) || 0));
    }

    return list;
  }, [resultData, sortBy, availabilityFilter, searchFilter]);

  // Handle adding an alternative to user's basket
  const handleAddAlternativeToBasket = (alt) => {
    const qty = alt.recommendedQuantity ?? 1;
    const itemUnit = alt.unit || "kg";
    const estPrice = alt.alternativePricePerKg ?? null;

    if (onAddToBasket) {
      onAddToBasket({
        name: alt.alternative,
        quantity: qty,
        unit: itemUnit,
        estimatedPrice: estPrice,
        monthlyUsage: `${(qty * 3).toFixed(1)} ${itemUnit} / month`
      });
      showToast(`Added ${qty} ${itemUnit} ${alt.alternative} to your Food Basket!`);
    } else {
      showToast(`Selected ${qty} ${itemUnit} ${alt.alternative}`);
    }
  };

  return (
    <div className="substitution-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="sub-toast-notification">
          <IconCheck /> {toastMessage}
        </div>
      )}

      {/* Main Page Heading */}
      <div className="section-heading sub-section-heading">
        <div>
          <span className="eyebrow sub-eyebrow">Smart Food Swaps</span>
          <h2 className="sub-main-title">Food Substitution</h2>
          <p className="sub-main-desc">
            Find healthy, cheaper food swaps that cook and taste like your favorite ingredients.
          </p>
        </div>
        {onNavigateToShock && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              className="action-chip sub-action-chip"
              onClick={() => onNavigateToShock(selectedFood)}
              title="Test food basket price impact"
            >
              ⚡ Price Impact Calculator →
            </button>
          </div>
        )}
      </div>

      {/* Control Panel: Food Selector & Consumption Quantity Form */}
      <div className="substitution-control-card">
        <div className="control-card-header">
          <h3>
            <IconSwapMini /> Choose a Food
          </h3>
          <p>
            Pick a food, enter how much you need, and choose your priority.
          </p>
        </div>

        {/* Quick Select Staple Chips */}
        <div className="quick-food-chips-wrapper">
          <span className="quick-chips-label">Popular Foods:</span>
          <div className="quick-food-chips">
            {POPULAR_STAPLES.map((foodName) => (
              <button
                key={foodName}
                type="button"
                className={`food-chip-btn ${selectedFood.toLowerCase() === foodName.toLowerCase() ? "active" : ""}`}
                onClick={() => handleQuickChipClick(foodName)}
              >
                {foodName}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="substitution-inputs-grid">
          {/* Food Selection */}
          <div className="input-field-group">
            <label htmlFor="food-select">Choose a Food</label>
            <CustomDropdown
              id="food-select"
              value={selectedFood}
              onChange={(val) => setSelectedFood(val)}
              options={foodOptions}
              placeholder="Choose a food..."
            />
          </div>

          {/* Consumption Quantity */}
          <div className="input-field-group">
            <label htmlFor="consumption-qty">How Much?</label>
            <input
              id="consumption-qty"
              type="number"
              step="0.5"
              min="0.1"
              max="500"
              className="input-text-styled"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0.1, parseFloat(e.target.value) || 1))}
            />
          </div>

          {/* Unit */}
          <div className="input-field-group">
            <label htmlFor="consumption-unit">Unit</label>
            <select
              id="consumption-unit"
              className="input-select-styled"
              value={unit}
              onMouseDown={handleDropdownFocus}
              onFocus={handleDropdownFocus}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="kg">kg (Kilograms)</option>
              <option value="g">g (Grams)</option>
              <option value="litre">litre (Litres)</option>
              <option value="pieces">pieces</option>
            </select>
          </div>
        </div>

        {/* User Preference Strategy */}
        <div className="preference-strategy-section">
          <span className="preference-strategy-label">Choose Your Priority</span>
          <div className="preference-buttons-grid">
            {PREFERENCE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`pref-strategy-btn pref-${opt.id} ${preference === opt.id ? "active" : ""}`}
                onClick={() => {
                  setPreference(opt.id);
                  fetchSubstitutions(selectedFood, quantity, unit, opt.id);
                }}
              >
                <span className="pref-title">{opt.title}</span>
                <span className="pref-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions Row */}
        <div className="substitution-actions-row">
          <button
            type="button"
            className="sub-primary-btn"
            onClick={() => fetchSubstitutions(selectedFood, quantity, unit, preference)}
            disabled={loading}
          >
            {loading ? "Finding Food Swaps..." : "Find Food Swaps"} <IconArrowRight />
          </button>
          <span className="sub-helper-footnote">
            Live mandi market prices & trusted nutrition data
          </span>
        </div>
      </div>

      {/* Error Message Alert with Retry */}
      {error && (
        <div className="error-message sub-error-card" role="alert">
          <span className="error-icon">!</span>
          <div className="error-text-wrap">
            <strong className="error-title">Could not load food substitutions</strong>
            <span className="error-text">{error}</span>
          </div>
          <button
            type="button"
            className="sub-retry-action-btn"
            onClick={() => fetchSubstitutions(selectedFood, quantity, unit, preference)}
          >
            🔄 Try Again
          </button>
          <button
            type="button"
            className="error-dismiss"
            onClick={() => setError("")}
            title="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* Original Food Intelligence Snapshot Card */}
      {resultData && resultData.originalFood && (
        <div className="original-food-snapshot-card">
          <div className="snapshot-header">
            <div className="snapshot-title-group">
              <div className="snapshot-avatar" title={capitalizeFood(resultData.originalFood.name)}>
                {getFoodIcon(resultData.originalFood.name)}
              </div>
              <div className="snapshot-name-wrap">
                <h4>{capitalizeFood(resultData.originalFood.name)} (Current Food)</h4>
                <span>The food you want to replace</span>
              </div>
            </div>

            <div className="snapshot-pills">
              {resultData.originalFood.priceRisk && (
                <span className={`status-pill ${
                  resultData.originalFood.priceRisk.toLowerCase().includes("low")
                    ? "green-pill"
                    : resultData.originalFood.priceRisk.toLowerCase().includes("high")
                    ? "red-pill"
                    : "amber-pill"
                }`}>
                  {resultData.originalFood.priceRisk} Price Risk
                </span>
              )}
              <span className="status-pill blue-pill">
                Quantity: {resultData.originalFood.quantity} {resultData.originalFood.unit}
              </span>
            </div>
          </div>

          {/* Pricing & Cost KPIs */}
          <div className="snapshot-kpi-row">
            <div className="snapshot-kpi kpi-cyan">
              <span className="snapshot-kpi-label">Market Price</span>
              <strong className="snapshot-kpi-value">
                {resultData.originalFood.pricePerKg !== null
                  ? `₹${resultData.originalFood.pricePerKg} / kg`
                  : "Price unavailable"}
              </strong>
            </div>

            <div className="snapshot-kpi kpi-emerald">
              <span className="snapshot-kpi-label">Current Cost</span>
              <strong className="snapshot-kpi-value text-emerald">
                {resultData.originalFood.totalCost !== null
                  ? `₹${resultData.originalFood.totalCost}`
                  : "N/A"}
              </strong>
            </div>

            <div className="snapshot-kpi kpi-blue">
              <span className="snapshot-kpi-label">Calories</span>
              <strong className="snapshot-kpi-value">
                {resultData.originalFood.nutrition?.calories !== null && resultData.originalFood.nutrition?.calories !== undefined
                  ? `${resultData.originalFood.nutrition.calories} kcal / 100g`
                  : "N/A"}
              </strong>
            </div>

            <div className="snapshot-kpi kpi-violet">
              <span className="snapshot-kpi-label">Swap Options</span>
              <strong className="snapshot-kpi-value text-violet">
                {resultData.count || 0} Found
              </strong>
            </div>
          </div>

          {/* Key Nutrients Strip */}
          {resultData.originalFood.nutrition ? (
            <div className="snapshot-nutrition-strip">
              <span className="nut-strip-label">
                Nutrition per 100g:
              </span>
              <div className="nut-chip chip-calories">Calories: <strong>{resultData.originalFood.nutrition.calories !== null && resultData.originalFood.nutrition.calories !== undefined ? `${resultData.originalFood.nutrition.calories} kcal` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-protein">Protein: <strong>{resultData.originalFood.nutrition.protein_g !== null && resultData.originalFood.nutrition.protein_g !== undefined ? `${resultData.originalFood.nutrition.protein_g}g` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-carbs">Carbs: <strong>{resultData.originalFood.nutrition.carbs_g !== null && resultData.originalFood.nutrition.carbs_g !== undefined ? `${resultData.originalFood.nutrition.carbs_g}g` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-fat">Fat: <strong>{resultData.originalFood.nutrition.fat_g !== null && resultData.originalFood.nutrition.fat_g !== undefined ? `${resultData.originalFood.nutrition.fat_g}g` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-fiber">Fiber: <strong>{resultData.originalFood.nutrition.fiber_g !== null && resultData.originalFood.nutrition.fiber_g !== undefined ? `${resultData.originalFood.nutrition.fiber_g}g` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-calcium">Calcium: <strong>{resultData.originalFood.nutrition.calcium_mg !== null && resultData.originalFood.nutrition.calcium_mg !== undefined ? `${resultData.originalFood.nutrition.calcium_mg}mg` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-iron">Iron: <strong>{resultData.originalFood.nutrition.iron_mg !== null && resultData.originalFood.nutrition.iron_mg !== undefined ? `${resultData.originalFood.nutrition.iron_mg}mg` : "Not recorded"}</strong></div>
              <div className="nut-chip chip-vitc">Vitamin C: <strong>{resultData.originalFood.nutrition.vitamin_c_mg !== null && resultData.originalFood.nutrition.vitamin_c_mg !== undefined ? `${resultData.originalFood.nutrition.vitamin_c_mg}mg` : "Not recorded"}</strong></div>
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: "0.82rem" }}>
              ℹ️ Standard nutrient values will be shown when recorded. Price savings and swap ratios remain active.
            </div>
          )}
        </div>
      )}

      {/* Loading Skeleton State */}
      {loading && (
        <div className="alternatives-grid">
          {[1, 2, 3].map((idx) => (
            <div className="sub-skeleton-card" key={idx}>
              <div className="skeleton-shimmer" />
            </div>
          ))}
        </div>
      )}

      {/* Results Toolbar & Grid */}
      {!loading && resultData && (
        <>
          {/* Results Toolbar */}
          <div className="substitutions-toolbar">
            <div className="toolbar-controls">
              <div className="toolbar-item">
                <span>Sort by:</span>
                <select
                  className="toolbar-select"
                  value={sortBy}
                  onMouseDown={handleDropdownFocus}
                  onFocus={handleDropdownFocus}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="score">Best Overall Match</option>
                  <option value="savings">Save Most Money (₹)</option>
                  <option value="nutrition">Best Nutrition Match</option>
                  <option value="price">Lowest Price</option>
                </select>
              </div>

              <div className="toolbar-item">
                <span>Availability:</span>
                <select
                  className="toolbar-select"
                  value={availabilityFilter}
                  onMouseDown={handleDropdownFocus}
                  onFocus={handleDropdownFocus}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                >
                  <option value="all">All Foods</option>
                  <option value="high">Easy to Find Only</option>
                  <option value="medium">Somewhat Easy to Find</option>
                </select>
              </div>
            </div>

            <div className="filter-count">
              Showing <strong>{processedAlternatives.length}</strong> of {resultData.count || 0} food swaps
            </div>
          </div>

          {/* Empty Filter State */}
          {processedAlternatives.length === 0 ? (
            <div className="empty-state sub-empty-state">
              <div className="empty-icon"><IconSwapMini /></div>
              <h3>No matching food swaps found</h3>
              <p>
                No swaps matched your filter for {selectedFood}. Try picking another food or clearing filters.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearchFilter("");
                  setAvailabilityFilter("all");
                  setSortBy("score");
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            /* Ranked Alternatives Grid */
            <div className="alternatives-grid">
              {processedAlternatives.map((alt, index) => {
                const isTopMatch = index === 0 && sortBy === "score";
                const matchScoreNum = Number(alt.matchScore) || 0;
                const savingsNum = Number(alt.estimatedSavings);
                const hasSavings = Number.isFinite(savingsNum) && savingsNum > 0;

                return (
                  <article
                    key={alt.alternative || index}
                    className={`alternative-sub-card ${isTopMatch ? "top-ranked" : ""}`}
                  >
                    {isTopMatch && (
                      <div className="top-badge-banner">
                        <IconSparkle /> ⭐ #1 BEST RECOMMENDED SWAP
                      </div>
                    )}

                    {/* Card Header */}
                    <div className="alt-card-header">
                      <div className="alt-food-names">
                        <div className="alt-card-rank-wrap">
                          <span className="alt-rank-tag">#{index + 1}</span>
                          <span className={`status-pill ${
                            (alt.availability || "").toLowerCase() === "high"
                              ? "green-pill"
                              : "blue-pill"
                          }`}>
                            {(alt.availability || "").toLowerCase() === "high" ? "Easy to Find" : "In Markets"}
                          </span>
                        </div>
                        <h3>{capitalizeFood(alt.alternative)}</h3>
                        <span className="alt-role-pill">
                          {alt.foodRole || "Produce"} • {alt.cuisine || "Indian"} Cooking
                        </span>
                      </div>

                      <div className="overall-score-pill" title="Overall Match Score out of 100">
                        {matchScoreNum.toFixed(1)}% Match
                      </div>
                    </div>

                    {/* Hero Substitution Pair */}
                    <div className="sub-pair-strip">
                      <div className="pair-block">
                        <span className="pair-meta-label">Current</span>
                        <strong className="pair-item-name">{capitalizeFood(resultData.originalFood?.name)}</strong>
                        <span className="pair-qty-text">{resultData.originalFood?.quantity} {resultData.originalFood?.unit}</span>
                      </div>

                      <div className="pair-swap-arrow">
                        <IconArrowRight />
                        <span className="ratio-badge">Use {alt.substitutionRatio}x ratio</span>
                      </div>

                      <div className="pair-block text-right">
                        <span className="pair-meta-label">Swap with</span>
                        <strong className="pair-item-name highlight-alt">{capitalizeFood(alt.alternative)}</strong>
                        <span className="pair-qty-text">{alt.recommendedQuantity} {alt.unit}</span>
                      </div>
                    </div>

                    {/* Savings / Price Comparison Callout */}
                    <div className={`savings-callout-banner ${hasSavings ? "is-savings" : "is-neutral"}`}>
                      <div className="savings-label-col">
                        <span className="savings-label">
                          {hasSavings ? "Estimated Savings" : "Estimated Cost"}
                        </span>
                        <span className="savings-cost-sub">
                          {alt.alternativeTotalCost !== null
                            ? `Est. Cost: ₹${alt.alternativeTotalCost} (Rate: ₹${alt.alternativePricePerKg}/kg)`
                            : "Local market price not recorded"}
                        </span>
                      </div>
                      {hasSavings ? (
                        <div className="savings-amount-badge">
                          Save ₹{savingsNum.toFixed(1)}
                          {alt.savingsPercent && (
                            <span style={{ fontSize: "0.78rem", opacity: 0.9 }}>({alt.savingsPercent}% less)</span>
                          )}
                        </div>
                      ) : (
                        <span className="status-pill blue-pill">Similar Cost</span>
                      )}
                    </div>

                    {/* Multi-Dimensional Fit Meter Bars */}
                    <div className="fit-meters-section">
                      {/* Nutrition Match */}
                      <div className="fit-meter-bar">
                        <div className="meter-header">
                          <span>Nutrition Match</span>
                          <span className="meter-score">{alt.nutritionSimilarity ?? 0}%</span>
                        </div>
                        <div className="meter-track">
                          <div
                            className="meter-fill blue-meter"
                            style={{ width: `${Math.min(100, Math.max(5, alt.nutritionSimilarity ?? 0))}%` }}
                          />
                        </div>
                      </div>

                      {/* Price Savings */}
                      <div className="fit-meter-bar">
                        <div className="meter-header">
                          <span>Money Saved</span>
                          <span className="meter-score">{alt.priceSuitability ?? 0}%</span>
                        </div>
                        <div className="meter-track">
                          <div
                            className="meter-fill green-meter"
                            style={{ width: `${Math.min(100, Math.max(5, alt.priceSuitability ?? 0))}%` }}
                          />
                        </div>
                      </div>

                      {/* Cooking Match */}
                      <div className="fit-meter-bar">
                        <div className="meter-header">
                          <span>Cooking Match</span>
                          <span className="meter-score">{alt.cookingSimilarity ?? 0}%</span>
                        </div>
                        <div className="meter-track">
                          <div
                            className="meter-fill teal-meter"
                            style={{ width: `${Math.min(100, Math.max(5, alt.cookingSimilarity ?? 0))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Explainability Section ("Why This Is a Good Choice") */}
                    {Array.isArray(alt.whyRecommended) && alt.whyRecommended.length > 0 && (
                      <div className="why-recommended-box">
                        <div className="why-header">
                          <IconCheck /> Why Recommended:
                        </div>
                        <ul className="why-list">
                          {alt.whyRecommended.map((reason, rIdx) => (
                            <li key={rIdx}>{simplifyReason(reason)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Card Actions Footer */}
                    <div className="alt-card-footer">
                      <div className="card-action-buttons">
                        <button
                          type="button"
                          className="btn-compare-outline"
                          onClick={() => setComparingAlt(alt)}
                        >
                          <IconCompare /> Compare Side by Side
                        </button>

                        <button
                          type="button"
                          className="btn-add-basket"
                          onClick={() => handleAddAlternativeToBasket(alt)}
                        >
                          <IconBasketMini /> + Add to Food Basket
                        </button>
                      </div>

                      <div className="card-action-links">
                        {onNavigateToPrices && (
                          <button
                            type="button"
                            className="text-link-button sub-link-btn"
                            onClick={() => onNavigateToPrices(alt.alternative)}
                          >
                            See {alt.alternative} Market Prices →
                          </button>
                        )}

                        {onNavigateToShock && (
                          <button
                            type="button"
                            className="text-link-button sub-link-shock-btn"
                            onClick={() => onNavigateToShock(alt.alternative)}
                          >
                            ⚡ See Price Impact for {alt.alternative} →
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Side-by-Side Comparison Modal */}
      {comparingAlt && resultData && (
        <div className="comparison-modal-backdrop" onClick={() => setComparingAlt(null)}>
          <div
            className="comparison-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="modal-header-bar">
              <h3>
                <IconCompare /> Side-by-Side Food Comparison
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setComparingAlt(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="modal-body-content">
              {/* Header Foods Summary */}
              <div className="modal-summary-grid">
                <div className="modal-food-box modal-box-orig">
                  <span className="modal-box-tag">Current Food</span>
                  <h4 className="modal-box-title">{capitalizeFood(resultData.originalFood?.name)}</h4>
                  <div className="modal-box-rate">
                    Quantity: <strong>{resultData.originalFood?.quantity} {resultData.originalFood?.unit}</strong>
                  </div>
                  <div className="modal-box-rate">
                    Market Price: <strong>₹{resultData.originalFood?.pricePerKg ?? "N/A"} / kg</strong>
                  </div>
                  <div className="modal-box-rate">
                    Total Cost: <strong>₹{resultData.originalFood?.totalCost ?? "N/A"}</strong>
                  </div>
                </div>

                <div className="modal-food-box modal-box-alt alt-highlight">
                  <span className="modal-box-tag">Recommended Swap</span>
                  <h4 className="modal-box-title">{capitalizeFood(comparingAlt.alternative)}</h4>
                  <div className="modal-box-rate">
                    Quantity: <strong>{comparingAlt.recommendedQuantity} {comparingAlt.unit}</strong> (use {comparingAlt.substitutionRatio}x amount)
                  </div>
                  <div className="modal-box-rate">
                    Market Price: <strong>₹{comparingAlt.alternativePricePerKg ?? "N/A"} / kg</strong>
                  </div>
                  <div className="modal-box-rate">
                    Total Cost: <strong>₹{comparingAlt.alternativeTotalCost ?? "N/A"}</strong>
                  </div>
                </div>
              </div>

              {/* Financial Savings Highlight */}
              {comparingAlt.estimatedSavings !== null && (
                <div className="savings-callout-banner modal-savings-banner">
                  <div className="savings-label-col">
                    <span className="savings-label">Estimated Money Saved</span>
                    <span className="savings-cost-sub">
                      Swapping {resultData.originalFood?.quantity} {resultData.originalFood?.unit} of {capitalizeFood(resultData.originalFood?.name)} with {comparingAlt.recommendedQuantity} {comparingAlt.unit} of {capitalizeFood(comparingAlt.alternative)}
                    </span>
                  </div>
                  <div className="savings-amount-badge">
                    Save ₹{comparingAlt.estimatedSavings} ({comparingAlt.savingsPercent}% lower cost)
                  </div>
                </div>
              )}

              {/* Side-by-Side Nutrition Comparison Table */}
              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Nutrient (per 100g)</th>
                      <th>{capitalizeFood(resultData.originalFood?.name)} (Current)</th>
                      <th>{capitalizeFood(comparingAlt.alternative)} (Swap)</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "calories", label: "Calories", unit: "kcal" },
                      { key: "protein_g", label: "Protein", unit: "g" },
                      { key: "carbs_g", label: "Carbohydrates", unit: "g" },
                      { key: "fat_g", label: "Total Fat", unit: "g" },
                      { key: "fiber_g", label: "Fiber", unit: "g" },
                      { key: "calcium_mg", label: "Calcium", unit: "mg" },
                      { key: "iron_mg", label: "Iron", unit: "mg" },
                      { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg" }
                    ].map((nutrient) => {
                      const origVal = resultData.originalFood?.nutrition?.[nutrient.key];
                      const altVal = comparingAlt.nutrition?.[nutrient.key];

                      let diffTag = null;
                      if (origVal !== null && origVal !== undefined && altVal !== null && altVal !== undefined) {
                        const diffNum = Number((altVal - origVal).toFixed(1));
                        const isSame = Math.abs(diffNum) === 0;
                        const isHigher = diffNum > 0;
                        diffTag = (
                          <span className={`comp-diff-tag ${isSame ? "neutral" : isHigher ? "positive" : "negative"}`}>
                            {isSame ? "Same" : `${isHigher ? "+" : ""}${diffNum.toFixed(1)} ${nutrient.unit}`}
                          </span>
                        );
                      } else {
                        diffTag = <span className="comp-diff-tag neutral">Not available</span>;
                      }

                      return (
                        <tr key={nutrient.key}>
                          <td className="comp-nutrient-name">{nutrient.label}</td>
                          <td>
                            {origVal !== null && origVal !== undefined ? `${origVal} ${nutrient.unit}` : "Not recorded"}
                          </td>
                          <td>
                            {altVal !== null && altVal !== undefined ? `${altVal} ${nutrient.unit}` : "Not recorded"}
                          </td>
                          <td>{diffTag}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Explainability Bullets in Modal */}
              {Array.isArray(comparingAlt.whyRecommended) && comparingAlt.whyRecommended.length > 0 && (
                <div className="why-recommended-box modal-why-box">
                  <div className="why-header">
                    <IconCheck /> Why this swap works well:
                  </div>
                  <ul className="why-list">
                    {comparingAlt.whyRecommended.map((r, idx) => (
                      <li key={idx}>{simplifyReason(r)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons inside modal */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "14px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setComparingAlt(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="primary-button modal-add-btn"
                  onClick={() => {
                    handleAddAlternativeToBasket(comparingAlt);
                    setComparingAlt(null);
                  }}
                >
                  <IconBasketMini /> Add {comparingAlt.alternative} to Basket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
