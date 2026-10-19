import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import "./App.css";
import PriceAnalytics from "./PriceAnalytics";
import FoodSubstitution from "./FoodSubstitution";
import PriceShockImpact from "./PriceShockImpact";
import { buildApiUrl } from "./apiConfig";

// Clean, Modern SVG Icons
function IconShock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconBasket() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h16l-2 10H6L4 10z" />
      <path d="M12 3v7" />
      <path d="M8 5l4-2 4 2" />
    </svg>
  );
}

function IconSwap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M9 15c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z" />
      <path d="M8 16l3.5-3.5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-5 4 3 6-8" />
      <circle cx="7" cy="16" r="1.5" fill="currentColor" />
      <circle cx="11" cy="11" r="1.5" fill="currentColor" />
      <circle cx="15" cy="14" r="1.5" fill="currentColor" />
      <circle cx="21" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

// Module-level in-memory caches for fast dashboard switching
const DASHBOARD_SUBS_CACHE = { data: null };
const DASHBOARD_PRICES_CACHE = new Map();

function App() {
  // Navigation
  const [activePage, setActivePage] = useState("Dashboard");

  // Visited pages tracking for lazy mounting and fast keep-alive navigation
  const [visitedPages, setVisitedPages] = useState(() => new Set(["Dashboard"]));

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(activePage)) return prev;
      const next = new Set(prev);
      next.add(activePage);
      return next;
    });
  }, [activePage]);

  const sidebarRef = useRef(null);

  // Track and restore scroll positions separately for all pages
  const pageScrollPositionsRef = useRef({});
  const isRestoringScrollRef = useRef(false);
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;

  // Isolate left sidebar wheel scrolling from right-side main page content
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const handleSidebarWheel = (e) => {
      // In mobile view (<= 768px), sidebar is in standard document flow
      if (window.innerWidth <= 768) return;

      const { scrollTop, scrollHeight, clientHeight } = sidebar;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll > 0) {
        let deltaY = e.deltaY;
        if (e.deltaMode === 1) {
          deltaY *= 20; // convert lines to pixels
        } else if (e.deltaMode === 2) {
          deltaY *= clientHeight; // convert pages to pixels
        }
        sidebar.scrollTop += deltaY;
      }

      // Prevent wheel event from chaining to window/document,
      // completely isolating sidebar scrolling from the right-side content
      e.preventDefault();
      e.stopPropagation();
    };

    sidebar.addEventListener("wheel", handleSidebarWheel, { passive: false });
    return () => {
      sidebar.removeEventListener("wheel", handleSidebarWheel);
    };
  }, []);

  // Single global scroll listener attached once on mount to eliminate listener thrashing
  useEffect(() => {
    const handleScroll = () => {
      if (isRestoringScrollRef.current) return;
      const currentScrollY =
        window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      pageScrollPositionsRef.current[activePageRef.current] = currentScrollY;
    };

    const handleUserScrollIntent = () => {
      isRestoringScrollRef.current = false;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleUserScrollIntent, { passive: true });
    window.addEventListener("touchmove", handleUserScrollIntent, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleUserScrollIntent);
      window.removeEventListener("touchmove", handleUserScrollIntent);
    };
  }, []);

  // Restore scroll position when activePage changes:
  // First time opening any page -> starts at top (0).
  // Returning to a previously visited page -> restores its saved scroll position.
  useLayoutEffect(() => {
    const targetScroll = pageScrollPositionsRef.current[activePage] ?? 0;
    isRestoringScrollRef.current = true;

    const applyScroll = () => {
      window.scrollTo(0, targetScroll);
      if (document.documentElement) {
        document.documentElement.scrollTop = targetScroll;
      }
      if (document.body) {
        document.body.scrollTop = targetScroll;
      }
    };

    applyScroll();

    let timerId;
    const animId = requestAnimationFrame(() => {
      applyScroll();
      timerId = setTimeout(() => {
        applyScroll();
        isRestoringScrollRef.current = false;
      }, 50);
    });

    return () => {
      cancelAnimationFrame(animId);
      if (timerId) clearTimeout(timerId);
    };
  }, [activePage]);

  // API Data
  const [recommendations, setRecommendations] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  // Option A: Image Upload & Prediction
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [prediction, setPrediction] = useState(null);

  // Option B: Manual Food Name Input
  const [typedFood, setTypedFood] = useState("");
  const [activeFood, setActiveFood] = useState(null);
  const [inputError, setInputError] = useState("");

  // Price Filters
  const [selectedCommodity, setSelectedCommodity] = useState("Tomato");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");


  // Memoized navigation callbacks for Price Shock Impact to prevent re-renders
  const handleNavigateToSubstitutionFromShock = useCallback((foodName) => {
    if (foodName) setTypedFood(foodName);
    setActivePage("Food Substitution");
  }, []);

  const handleNavigateToPricesFromShock = useCallback((commodityName) => {
    if (commodityName) setSelectedCommodity(commodityName);
    setActivePage("Price Analytics");
  }, []);

  // My Food Basket State
  const [basket, setBasket] = useState(() => {
    try {
      const saved = localStorage.getItem("agriswap_basket");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [
      { id: "item-1", name: "Tomato", quantity: 5, unit: "kg", monthlyUsage: "12 kg / month", estimatedPrice: 35 },
      { id: "item-2", name: "Potato", quantity: 8, unit: "kg", monthlyUsage: "16 kg / month", estimatedPrice: 28 },
      { id: "item-3", name: "Onion", quantity: 4, unit: "kg", monthlyUsage: "10 kg / month", estimatedPrice: 32 },
      { id: "item-4", name: "Basmati Rice", quantity: 10, unit: "kg", monthlyUsage: "20 kg / month", estimatedPrice: 65 },
      { id: "item-5", name: "Fresh Milk", quantity: 2, unit: "litre", monthlyUsage: "60 litres / month", estimatedPrice: 60 },
      { id: "item-6", name: "Farm Eggs", quantity: 12, unit: "pieces", monthlyUsage: "36 pieces / month", estimatedPrice: 8 }
    ];
  });

  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    try {
      const saved = localStorage.getItem("agriswap_budget");
      return saved ? Number(saved) : 5000;
    } catch {
      return 5000;
    }
  });

  const [foodForm, setFoodForm] = useState({
    name: "",
    quantity: 1,
    unit: "kg",
    monthlyUsage: ""
  });

  const [editingItemId, setEditingItemId] = useState(null);
  const [basketSearch, setBasketSearch] = useState("");
  const [basketError, setBasketError] = useState("");

  // Sync basket and budget to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("agriswap_basket", JSON.stringify(basket));
      localStorage.setItem("agriswap_budget", monthlyBudget.toString());
    } catch {
      // Ignore storage errors
    }
  }, [basket, monthlyBudget]);

  const navigationItems = [
    { name: "Dashboard", icon: <IconDashboard />, slug: "dashboard" },
    { name: "My Food Basket", icon: <IconBasket />, badge: basket.length > 0 ? basket.length : null, slug: "basket" },
    { name: "Price Shock Impact", icon: <IconShock />, slug: "shock" },
    { name: "Food Substitution", icon: <IconSwap />, slug: "substitution" },
    { name: "Price Analytics", icon: <IconChart />, slug: "analytics" }
  ];

  // Option A: Image Selection & Uncropped Preview
  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setPrediction(null);
    setError("");
    setInputError("");
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    setPrediction(null);
  };

  // Option A: Image Prediction via API (ResNet50)
  const identifyFood = async () => {
    if (!selectedImage) {
      setError("Please select a food image first.");
      return;
    }
    if (loading === "image") {
      return; // Prevent duplicate concurrent submissions
    }

    setLoading("image");
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", selectedImage);

      const response = await fetch(buildApiUrl("/api/images"), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || "Food identification failed. Please ensure the backend service is reachable.");
      }

      const data = await response.json();
      setPrediction(data);

      // Only automatically lock into active state if prediction is valid produce and confident (>= 70%)
      if (data && data.isValidProduce && data.food && data.isConfident !== false) {
        setActiveFood(data.food);
        setSelectedCommodity(data.food);
      }
    } catch (err) {
      setError(err.message || "Unable to connect to the backend image recognition service.");
    } finally {
      setLoading("");
    }
  };

  // Option B: Manual Food Name Search (Does NOT call ResNet50)
  const handleTypedFoodSearch = (foodOverride) => {
    const query = (typeof foodOverride === "string" ? foodOverride : typedFood).trim();

    if (!query) {
      setInputError("Please enter a food name, e.g., Tomato, Onion, Potato");
      return;
    }

    setInputError("");
    setActiveFood(query);
    setSelectedCommodity(query);
  };

  const clearFoodSearch = () => {
    setTypedFood("");
    setInputError("");
    setActiveFood("");
  };

  // Fetch Substitutions (non-blocking navigation)
  const getSubstitutions = async () => {
    setActivePage("Food Substitution");
    if (DASHBOARD_SUBS_CACHE.data) {
      setRecommendations(DASHBOARD_SUBS_CACHE.data);
      return;
    }

    setLoading("substitutions");
    setError("");

    try {
      const response = await fetch(buildApiUrl("/api/substitutions?userId=U001"));

      if (!response.ok) {
        throw new Error("Unable to load food substitutions. Please ensure the backend service is reachable.");
      }

      const data = await response.json();
      const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
      DASHBOARD_SUBS_CACHE.data = recs;
      setRecommendations(recs);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend substitution service.");
    } finally {
      setLoading("");
    }
  };

  // Fetch Mandi Prices (non-blocking navigation)
  const getPrices = async (commodityOverride) => {
    const targetCommodity = commodityOverride || selectedCommodity || "Tomato";
    setActivePage("Price Analytics");
    const cacheKey = `${targetCommodity}_${selectedState}_${selectedDistrict}`;

    if (DASHBOARD_PRICES_CACHE.has(cacheKey)) {
      setPrices(DASHBOARD_PRICES_CACHE.get(cacheKey));
      return;
    }

    setLoading("prices");
    setError("");

    try {
      let apiPath = `/api/prices?commodity=${encodeURIComponent(targetCommodity)}`;
      if (selectedState.trim()) {
        apiPath += `&state=${encodeURIComponent(selectedState.trim())}`;
      }
      if (selectedDistrict.trim()) {
        apiPath += `&district=${encodeURIComponent(selectedDistrict.trim())}`;
      }

      const response = await fetch(buildApiUrl(apiPath));

      if (!response.ok) {
        throw new Error(`Unable to load market prices for ${targetCommodity}. Check that the backend service is reachable.`);
      }

      const data = await response.json();
      const priceList = Array.isArray(data) ? data : [];
      DASHBOARD_PRICES_CACHE.set(cacheKey, priceList);
      setPrices(priceList);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend price service.");
    } finally {
      setLoading("");
    }
  };

  const inspectCommodityPrices = (commodityName) => {
    setSelectedCommodity(commodityName);
    getPrices(commodityName);
  };

  // Baseline estimate helper for items without live market pricing
  const getEstimatedUnitRate = (name = "", unit = "kg") => {
    const cleanName = (name || "").toLowerCase();
    const cleanUnit = (unit || "kg").toLowerCase();

    if (cleanUnit === "pieces") {
      if (cleanName.includes("egg")) return 8;
      if (cleanName.includes("apple") || cleanName.includes("orange")) return 20;
      if (cleanName.includes("bread") || cleanName.includes("bun")) return 35;
      return 15;
    }
    if (cleanUnit === "g") {
      if (cleanName.includes("spice") || cleanName.includes("tea")) return 0.45;
      return 0.08;
    }
    if (cleanUnit === "ml") {
      return 0.07;
    }
    if (cleanUnit === "litre") {
      if (cleanName.includes("milk")) return 60;
      if (cleanName.includes("oil")) return 145;
      return 50;
    }
    // Default kg
    if (cleanName.includes("rice")) return 65;
    if (cleanName.includes("wheat") || cleanName.includes("atta") || cleanName.includes("flour")) return 42;
    if (cleanName.includes("dal") || cleanName.includes("pulse") || cleanName.includes("lentil")) return 110;
    if (cleanName.includes("potato")) return 28;
    if (cleanName.includes("tomato")) return 35;
    if (cleanName.includes("onion")) return 32;
    if (cleanName.includes("sugar")) return 45;
    if (cleanName.includes("paneer")) return 360;
    return 40;
  };

  const parseMonthlyUsageQty = (item) => {
    if (!item) return 0;
    if (typeof item.monthlyUsage === "number") return item.monthlyUsage;
    if (typeof item.monthlyUsage === "string") {
      const match = item.monthlyUsage.match(/[\d.]+/);
      if (match) {
        const val = parseFloat(match[0]);
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
    return Number(item.quantity || 1) * 3;
  };

  const calculateItemMonthlyCost = (item) => {
    const usage = parseMonthlyUsageQty(item);
    const rate = (item.estimatedPrice && Number.isFinite(Number(item.estimatedPrice)))
      ? Number(item.estimatedPrice)
      : getEstimatedUnitRate(item.name, item.unit);
    return Math.round(usage * rate);
  };

  // Estimated Monthly Cost Sum
  const estimatedMonthlyCost = useMemo(() => {
    return basket.reduce((acc, item) => acc + calculateItemMonthlyCost(item), 0);
  }, [basket]);

  // Remaining Budget Calculation
  const remainingBudget = useMemo(() => {
    return Number(monthlyBudget || 0) - estimatedMonthlyCost;
  }, [monthlyBudget, estimatedMonthlyCost]);

  // Filtered Basket by Search Query
  const filteredBasket = useMemo(() => {
    if (!basketSearch.trim()) return basket;
    const q = basketSearch.toLowerCase();
    return basket.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.monthlyUsage && item.monthlyUsage.toLowerCase().includes(q)) ||
      (item.unit && item.unit.toLowerCase().includes(q))
    );
  }, [basket, basketSearch]);

  // Add or Update Food Item Form Submission
  const handleSaveFoodItem = (e) => {
    if (e) e.preventDefault();

    const name = foodForm.name.trim();
    const quantity = parseFloat(foodForm.quantity);
    const unit = foodForm.unit || "kg";
    const rawUsage = foodForm.monthlyUsage !== undefined && foodForm.monthlyUsage !== null
      ? String(foodForm.monthlyUsage).trim()
      : "";
    const parsedUsage = parseFloat(rawUsage);

    if (!name) {
      setBasketError("Please enter a food name for your basket.");
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      setBasketError("Please enter a valid quantity greater than 0.");
      return;
    }
    if (!rawUsage) {
      setBasketError("Please enter a monthly usage value.");
      return;
    }
    if (isNaN(parsedUsage) || parsedUsage <= 0) {
      setBasketError("Monthly usage must be a positive number greater than 0.");
      return;
    }

    setBasketError("");

    const formattedUsage = `${parsedUsage} ${unit}/month`;

    if (editingItemId) {
      setBasket(prev => prev.map(item => {
        if (item.id === editingItemId) {
          const nameChanged = item.name.toLowerCase() !== name.toLowerCase();
          const unitChanged = item.unit !== unit;
          const newPrice = (nameChanged || unitChanged)
            ? getEstimatedUnitRate(name, unit)
            : (item.estimatedPrice || getEstimatedUnitRate(name, unit));

          return {
            ...item,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            quantity,
            unit,
            monthlyUsage: formattedUsage,
            estimatedPrice: newPrice
          };
        }
        return item;
      }));
      setEditingItemId(null);
    } else {
      const newItem = {
        id: "food-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        name: name.charAt(0).toUpperCase() + name.slice(1),
        quantity,
        unit,
        monthlyUsage: formattedUsage,
        estimatedPrice: getEstimatedUnitRate(name, unit)
      };
      setBasket(prev => [newItem, ...prev]);
    }

    setFoodForm({
      name: "",
      quantity: 1,
      unit: "kg",
      monthlyUsage: ""
    });
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    let numUsage = "";
    if (typeof item.monthlyUsage === "number") {
      numUsage = String(item.monthlyUsage);
    } else if (typeof item.monthlyUsage === "string") {
      const match = item.monthlyUsage.match(/[\d.]+/);
      if (match) numUsage = match[0];
    }
    setFoodForm({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || "kg",
      monthlyUsage: numUsage
    });
    setBasketError("");
    const formCard = document.getElementById("add-food-form-card");
    if (formCard) formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setFoodForm({
      name: "",
      quantity: 1,
      unit: "kg",
      monthlyUsage: ""
    });
    setBasketError("");
  };

  const deleteBasketItem = (id) => {
    setBasket(prev => prev.filter(item => item.id !== id));
    if (editingItemId === id) {
      cancelEdit();
    }
  };

  const clearBasket = () => {
    setBasket([]);
    cancelEdit();
  };

  const addQuickStaple = (name, quantity = 2, unit = "kg", usageText = "") => {
    const existingIndex = basket.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      setBasket(prev => prev.map((item, idx) => {
        if (idx === existingIndex) {
          const nextQty = Number((item.quantity + quantity).toFixed(1));
          return {
            ...item,
            quantity: nextQty,
            monthlyUsage: usageText || `${(nextQty * 3).toFixed(1)} ${item.unit || unit} / month`
          };
        }
        return item;
      }));
    } else {
      const newItem = {
        id: "food-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        name,
        quantity,
        unit,
        monthlyUsage: usageText || `${(quantity * 3).toFixed(1)} ${unit} / month`,
        estimatedPrice: getEstimatedUnitRate(name, unit)
      };
      setBasket(prev => [newItem, ...prev]);
    }
  };


  // Price Analytics Summary Stats
  const priceStats = useMemo(() => {
    if (!prices || prices.length === 0) return null;

    const validPrices = prices
      .map(p => Number(p.modalPrice))
      .filter(val => Number.isFinite(val) && val > 0);

    if (validPrices.length === 0) return null;

    const min = Math.min(...validPrices);
    const max = Math.max(...validPrices);
    const avg = validPrices.reduce((acc, curr) => acc + curr, 0) / validPrices.length;
    const latest = validPrices[0];

    return {
      latest,
      min,
      max,
      avg: Math.round(avg),
      count: prices.length
    };
  }, [prices]);

  // Basket Summary Stats
  const basketStats = useMemo(() => {
    if (basket.length === 0) return null;

    const totalItems = basket.length;
    const totalQty = basket.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
    const categories = Array.from(new Set(basket.map(i => i.category))).length;

    return {
      totalItems,
      totalQty: totalQty.toFixed(1),
      categories
    };
  }, [basket]);

  // Interactive SVG Line Chart
  const renderPriceChart = () => {
    if (!prices || prices.length < 2) return null;

    const validData = prices
      .filter(p => Number.isFinite(Number(p.modalPrice)))
      .slice(0, 10)
      .reverse();

    if (validData.length < 2) return null;

    const values = validData.map(p => Number(p.modalPrice));
    const minVal = Math.min(...values) * 0.9;
    const maxVal = Math.max(...values) * 1.1 || 100;
    const range = maxVal - minVal || 1;

    const chartWidth = 720;
    const chartHeight = 220;
    const paddingX = 45;
    const paddingY = 30;

    const points = validData.map((d, index) => {
      const x = paddingX + (index / (validData.length - 1)) * (chartWidth - paddingX * 2);
      const y = chartHeight - paddingY - ((Number(d.modalPrice) - minVal) / range) * (chartHeight - paddingY * 2);
      return { x, y, price: d.modalPrice, market: d.market || "Market", date: d.date };
    });

    const pathD = points.reduce((acc, pt, idx) => (
      idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`
    ), "");

    const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`;

    return (
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <span className="eyebrow">Price Movement</span>
            <h3 className="chart-title">Market Price Trend ({selectedCommodity})</h3>
            <p className="chart-desc">Historical modal price records across agricultural mandis</p>
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Modal Price (₹/Quintal)
          </div>
        </div>

        <div className="svg-chart-container">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="price-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3 3" />
            <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3 3" />
            <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="rgba(148, 163, 184, 0.2)" />

            <path d={areaD} fill="url(#priceGradient)" />
            <path d={pathD} fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((pt, i) => (
              <g key={i} className="chart-node">
                <circle cx={pt.x} cy={pt.y} r="5" fill="#111b30" stroke="#4ade80" strokeWidth="2.5" />
                <text x={pt.x} y={pt.y - 10} fill="#f1f5f9" fontSize="11" fontWeight="700" textAnchor="middle">
                  ₹{pt.price}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  };

  // Section 1: Dashboard Page
  const renderDashboard = () => (
    <>
      {/* Hero Section with New Green Farm Background & "Grow With Insights" */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-badge-tag">
            <span className="badge-pulse" />
            Smart Food & Agriculture
          </div>

          <h1 className="hero-main-heading hero-tri-heading">
            <span className="hero-food-highlight">Your Food.</span>{" "}
            <span className="hero-budget-highlight">Your Budget.</span>{" "}
            <span className="hero-choice-highlight">Your Choice.</span>
          </h1>

          <p className="hero-description">
            Make confident food choices with real-time agricultural market prices,
            smart food substitution, and your personal produce basket.
          </p>

          <div className="hero-actions">
            <button
              className="primary-button hero-cta"
              onClick={() => setActivePage("My Food Basket")}
            >
              Explore Your Food Basket <IconArrowRight />
            </button>
            <button
              className="secondary-button"
              style={{ borderColor: "rgba(245, 158, 11, 0.35)", color: "#fde047" }}
              onClick={() => setActivePage("Price Shock Impact")}
            >
              ⚡ Price Shock Impact
            </button>
            <button
              className="secondary-button"
              onClick={() => getPrices("Tomato")}
            >
              View Market Prices
            </button>
          </div>
        </div>

        {/* High-Quality Agricultural Hero Image Showcase */}
        <div className="hero-art-showcase">
          <div className="hero-image-frame">
            <img
              src="/hero_farm.jpg"
              alt="Lush green agricultural farm and healthy crops"
              className="hero-image"
              onError={(e) => {
                e.currentTarget.src = "/grow_with_agriculture.jpg";
              }}
            />
            <div className="hero-image-gradient" />
            <div className="hero-image-tag">
              <span className="tag-dot" />
              <span>GROW WITH INSIGHTS</span>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights Strip — Colored Feature Cards */}
      <div className="metrics-strip">
        <div
          className="metric-item metric-item--mandis"
          onClick={() => getPrices("Tomato")}
          title="View Real-Time Mandi Prices"
        >
          <div className="metric-card-top">
            <span className="metric-label">Market Crops</span>
            <div className="metric-card-icon">
              <IconChart />
            </div>
          </div>
          <strong className="metric-value">Real-Time Mandis</strong>
          <span className="metric-sub">Daily mandi updates for Tomato, Potato, Onion & more →</span>
        </div>

        <div
          className="metric-item metric-item--ai"
          onClick={() => {
            const el = document.getElementById("food-lookup-section");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          title="Jump to Photo Detection"
        >
          <div className="metric-card-top">
            <span className="metric-label">Photo Detection</span>
            <div className="metric-card-icon">
              <IconCamera />
            </div>
          </div>
          <strong className="metric-value">Fresh Produce AI</strong>
          <span className="metric-sub">Fast identification from uploaded photos →</span>
        </div>

        <div
          className="metric-item metric-item--nutrition"
          onClick={getSubstitutions}
          title="Explore Nutritional Substitutions"
        >
          <div className="metric-card-top">
            <span className="metric-label">Smart Substitutes</span>
            <div className="metric-card-icon">
              <IconSwap />
            </div>
          </div>
          <strong className="metric-value">Nutritional Match</strong>
          <span className="metric-sub">Healthy and budget-friendly alternatives →</span>
        </div>

        <div
          className="metric-item metric-item--shock"
          onClick={() => setActivePage("Price Shock Impact")}
          title="Simulate price shock impact on your basket"
        >
          <div className="metric-card-top">
            <span className="metric-label">Price Shock Impact</span>
            <div className="metric-card-icon">
              <IconShock />
            </div>
          </div>
          <strong className="metric-value">⚡ Shock Simulator</strong>
          <span className="metric-sub">Simulate inflation on your {basket.length} basket items →</span>
        </div>
      </div>

      {/* Dual Food Input Section: Option A & Option B */}
      <section className="input-section" id="food-lookup-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Food Lookup</span>
            <h2>Identify or Search Food</h2>
            <p>Upload a photo of any vegetable or fruit, or simply type its name to check prices and substitutes.</p>
          </div>
          {activeFood && (
            <div className="active-food-pill">
              <span>Selected:</span>
              <strong>{activeFood}</strong>
            </div>
          )}
        </div>

        <div className="dual-input-grid">
          {/* Option A: Upload Food Image with Complete, Uncropped Preview */}
          <article className="input-card card-option-a">
            <div className="card-topline">
              <span className="option-badge">Option A</span>
              <span className="method-label">Photo Upload</span>
            </div>

            <div className="card-header-block">
              <div className="feature-icon blue-icon">
                <IconCamera />
              </div>
              <div>
                <h3>Upload Food Photo</h3>
                <p>Select a fruit or vegetable photo to identify it automatically.</p>
              </div>
            </div>

            <label className={`image-upload-dropzone ${loading === "image" ? "is-loading" : ""}`}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={loading === "image"}
                className="file-hidden-input"
              />
              {imagePreviewUrl ? (
                <div className="image-preview-wrapper">
                  <img
                    src={imagePreviewUrl}
                    alt="Uploaded food preview"
                    className="image-preview-img"
                  />
                  {loading === "image" ? (
                    <div className="photo-scanning-overlay">
                      <div className="photo-scanning-beam" />
                      <div className="scanning-spinner" />
                      <span className="scanning-label">Scanning Produce...</span>
                      <span className="scanning-subtext">ResNet50 Vision Model In Memory</span>
                    </div>
                  ) : (
                    <span className="preview-change-overlay">Click to change photo</span>
                  )}
                </div>
              ) : (
                <div className="dropzone-placeholder">
                  <span className="dropzone-icon">📷</span>
                  <strong className="dropzone-text">Click to choose a food photo</strong>
                  <span className="dropzone-hint">Upload any vegetable, fruit, or crop image</span>
                </div>
              )}
            </label>

            {selectedImage && (
              <div className="selected-meta-bar">
                <span className="file-name-text">Selected: {selectedImage.name}</span>
                <button type="button" className="text-link-button" onClick={clearImage} disabled={loading === "image"}>Remove</button>
              </div>
            )}

            <button
              className="primary-button full-width"
              onClick={identifyFood}
              disabled={loading === "image" || !selectedImage}
            >
              {loading === "image" ? "Identifying Produce with ResNet50..." : "Identify Food"}
              <IconArrowRight />
            </button>

            {prediction && (
              prediction.isValidProduce === false ? (
                prediction.rejectionReason === "not_food" ? (
                  <div className="prediction-result-panel" style={{ borderColor: "rgba(239, 68, 68, 0.45)", background: "rgba(45, 15, 15, 0.72)" }}>
                    <div className="prediction-header" style={{ alignItems: "flex-start" }}>
                      <span className="result-check" style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.5)", color: "#fca5a5", fontSize: "16px", flexShrink: 0 }}>✕</span>
                      <div style={{ flex: 1 }}>
                        <span className="result-label" style={{ color: "#fca5a5" }}>Non-Food Image Detected</span>
                        <strong className="result-food-name" style={{ color: "#fecaca", fontSize: "15px", lineHeight: 1.45, display: "block", marginTop: "4px" }}>
                          Not a valid fruit or vegetable image. Please upload a clear fruit or vegetable photo.
                        </strong>
                      </div>
                      {prediction.inferenceTimeMs && (
                        <span className="detection-speed-badge" title="Image validation speed">
                          ⚡ {Math.round(prediction.inferenceTimeMs)}ms
                        </span>
                      )}
                    </div>
                  </div>
                ) : prediction.rejectionReason === "unknown_produce" ? (
                  <div className="prediction-result-panel" style={{ borderColor: "rgba(16, 185, 129, 0.45)", background: "rgba(10, 30, 22, 0.75)" }}>
                    <div className="prediction-header" style={{ alignItems: "flex-start" }}>
                      <span className="result-check" style={{ background: "rgba(16, 185, 129, 0.2)", borderColor: "rgba(52, 211, 153, 0.5)", color: "#34d399", fontSize: "16px", flexShrink: 0 }}>🍃</span>
                      <div style={{ flex: 1 }}>
                        <span className="result-label" style={{ color: "#6ee7b7" }}>Produce Detected (Unsupported or Ambiguous)</span>
                        <strong className="result-food-name" style={{ color: "#a7f3d0", fontSize: "16px", lineHeight: 1.45, display: "block", marginTop: "4px" }}>
                          Unable to identify this produce
                        </strong>
                        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#cbd5e1" }}>
                          This image appears to contain produce, but it is not in our 36 supported fruit & vegetable catalog or cannot be identified reliably. Please select a supported item below or search in Option B:
                        </p>
                      </div>
                      {prediction.inferenceTimeMs && (
                        <span className="detection-speed-badge" title="Vision validation speed">
                          ⚡ {Math.round(prediction.inferenceTimeMs)}ms
                        </span>
                      )}
                    </div>

                    {prediction.topCandidates && prediction.topCandidates.length > 0 && (
                      <div className="prediction-actions" style={{ marginTop: "12px" }}>
                        {prediction.topCandidates.map((cand) => (
                          <button
                            key={cand.food}
                            type="button"
                            className="action-chip"
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              borderColor: "rgba(52, 211, 153, 0.45)",
                              color: "#a7f3d0",
                              fontWeight: 700
                            }}
                            onClick={() => {
                              setActiveFood(cand.food);
                              setSelectedCommodity(cand.food);
                              setPrediction({
                                ...prediction,
                                food: cand.food,
                                confidence: cand.confidence,
                                isValidProduce: true,
                                isSupportedProduce: true,
                                isConfident: true
                              });
                            }}
                          >
                            Select Supported: {cand.food}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="prediction-result-panel" style={{ borderColor: "rgba(245, 158, 11, 0.45)", background: "rgba(35, 25, 10, 0.72)" }}>
                    <div className="prediction-header" style={{ alignItems: "flex-start" }}>
                      <span className="result-check" style={{ background: "rgba(245, 158, 11, 0.2)", borderColor: "rgba(245, 158, 11, 0.5)", color: "#fde047", fontSize: "16px", flexShrink: 0 }}>⚠</span>
                      <div style={{ flex: 1 }}>
                        <span className="result-label" style={{ color: "#fde047" }}>Unidentified Image</span>
                        <strong className="result-food-name" style={{ color: "#fef08a", fontSize: "15px", lineHeight: 1.45, display: "block", marginTop: "4px" }}>
                          Unable to identify — please upload a clear fruit or vegetable image
                        </strong>
                      </div>
                      {prediction.inferenceTimeMs && (
                        <span className="detection-speed-badge" title="Image validation speed">
                          ⚡ {Math.round(prediction.inferenceTimeMs)}ms
                        </span>
                      )}
                    </div>
                  </div>
                )
              ) : prediction.isConfident === false ? (
                <div className="prediction-result-panel" style={{ borderColor: "rgba(245, 158, 11, 0.45)", background: "rgba(30, 26, 15, 0.7)" }}>
                  <div className="prediction-header">
                    <span className="result-check" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#fde047" }}>⚠</span>
                    <div>
                      <span className="result-label" style={{ color: "#fde047" }}>Uncertain Identification</span>
                      <strong className="result-food-name" style={{ color: "#fef08a" }}>
                        Please Confirm Food
                      </strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="confidence-pill" style={{ background: "rgba(245, 158, 11, 0.16)", borderColor: "rgba(245, 158, 11, 0.4)", color: "#fde047" }}>
                        {Number.isFinite(Number(prediction.confidence))
                          ? `${(Number(prediction.confidence) * 100).toFixed(1)}% Match`
                          : "Uncertain"}
                      </span>
                      {prediction.inferenceTimeMs && (
                        <span className="detection-speed-badge" title="ResNet50 in-memory inference speed">
                          ⚡ {Math.round(prediction.inferenceTimeMs)}ms
                        </span>
                      )}
                    </div>
                  </div>

                  <p style={{ margin: "4px 0 12px", fontSize: "13px", color: "#cbd5e1" }}>
                    Produce detection confidence is below 70%. Please select the matching food from the likely candidates, or type the name in Option B:
                  </p>

                  <div className="prediction-actions">
                    {prediction.topCandidates && prediction.topCandidates.map((cand) => (
                      <button
                        key={cand.food}
                        type="button"
                        className="action-chip"
                        style={{
                          background: "rgba(245, 158, 11, 0.15)",
                          borderColor: "rgba(245, 158, 11, 0.45)",
                          color: "#fef08a",
                          fontWeight: 700
                        }}
                        onClick={() => {
                          setActiveFood(cand.food);
                          setSelectedCommodity(cand.food);
                          setPrediction({
                            ...prediction,
                            food: cand.food,
                            confidence: cand.confidence,
                            isConfident: true
                          });
                        }}
                      >
                        ✓ Select {cand.food} ({Math.round(cand.confidence * 100)}%)
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="prediction-result-panel">
                  <div className="prediction-header">
                    <span className="result-check"><IconSparkles /></span>
                    <div>
                      <span className="result-label">Identified Produce</span>
                      <strong className="result-food-name">{prediction.food || "Unknown Produce"}</strong>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="confidence-pill">
                        {Number.isFinite(Number(prediction.confidence))
                          ? `${(Number(prediction.confidence) * 100).toFixed(1)}% Match`
                          : "Identified"}
                      </span>
                      {prediction.inferenceTimeMs && (
                        <span className="detection-speed-badge" title="ResNet50 in-memory inference speed">
                          ⚡ {Math.round(prediction.inferenceTimeMs)}ms
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="prediction-actions">
                    <button
                      className="action-chip"
                      onClick={() => inspectCommodityPrices(prediction.food)}
                    >
                      Check {prediction.food} Market Prices →
                    </button>
                    <button
                      className="action-chip"
                      onClick={() => {
                        setActiveFood(prediction.food);
                        setSelectedCommodity(prediction.food);
                        setActivePage("Food Substitution");
                      }}
                    >
                      Find Substitutes for {prediction.food} →
                    </button>
                    <button
                      className="action-chip"
                      onClick={() => {
                        addQuickStaple(prediction.food, 1, "kg", "Produce");
                        setActivePage("My Food Basket");
                      }}
                    >
                      + Add to Basket
                    </button>
                    <button
                      className="action-chip"
                      style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fde047", borderColor: "rgba(245, 158, 11, 0.35)", fontWeight: 600 }}
                      onClick={() => {
                        addQuickStaple(prediction.food, 1, "kg", "Produce");
                        setActivePage("Price Shock Impact");
                      }}
                    >
                      ⚡ Price Shock Impact →
                    </button>
                  </div>
                </div>
              )
            )}
          </article>

          {/* Option B: Type Food Name Manually */}
          <article className="input-card card-option-b">
            <div className="card-topline">
              <span className="option-badge">Option B</span>
              <span className="method-label">Type Name</span>
            </div>

            <div className="card-header-block">
              <div className="feature-icon green-icon">
                <IconSearch />
              </div>
              <div>
                <h3>Search by Food Name</h3>
                <p>Type any produce name to check market prices and substitutes directly.</p>
              </div>
            </div>

            <form
              className="manual-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleTypedFoodSearch();
              }}
            >
              <div className="search-input-field">
                <input
                  type="text"
                  placeholder="Enter food name, e.g., Tomato, Onion, Potato"
                  value={typedFood}
                  onChange={(e) => {
                    setTypedFood(e.target.value);
                    if (inputError) setInputError("");
                  }}
                  className="commodity-search-input"
                />
                {typedFood && (
                  <button
                    type="button"
                    className="inline-clear-btn"
                    onClick={() => {
                      setTypedFood("");
                      if (inputError) setInputError("");
                    }}
                    title="Clear search input"
                  >
                    ✕
                  </button>
                )}
                <button type="submit" className="primary-button search-action-btn">
                  <IconSearch /> Search
                </button>
              </div>

              {inputError && (
                <div className="input-validation-message" role="alert">
                  ⚠ {inputError}
                </div>
              )}
            </form>

            <div className="quick-suggestions-block">
              <span className="suggestions-label">Popular Commodities:</span>
              <div className="suggestion-chips">
                {["Tomato", "Potato", "Onion", "Apple", "Rice", "Wheat"].map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`suggestion-chip ${activeFood?.toLowerCase() === item.toLowerCase() ? "active" : ""}`}
                    onClick={() => {
                      setTypedFood(item);
                      handleTypedFoodSearch(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {activeFood && (
              <div className="active-selection-box">
                <div className="active-selection-header">
                  <div>
                    <span className="muted-label">Selected Item</span>
                    <strong className="active-selection-title">{activeFood}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="status-pill green-pill">Ready</span>
                    <button
                      type="button"
                      className="clear-selection-btn"
                      onClick={clearFoodSearch}
                      title="Clear selection and search another food"
                    >
                      ✕ Search another food
                    </button>
                  </div>
                </div>

                <div className="active-selection-actions">
                  <button
                    className="action-chip"
                    onClick={() => inspectCommodityPrices(activeFood)}
                  >
                    View Market Prices for {activeFood} →
                  </button>
                  <button
                    className="action-chip"
                    onClick={() => {
                      setActivePage("Food Substitution");
                    }}
                  >
                    Find Alternatives for {activeFood} →
                  </button>
                  <button
                    className="action-chip"
                    onClick={() => {
                      addQuickStaple(activeFood, 1, "kg", "Produce");
                      setActivePage("My Food Basket");
                    }}
                  >
                    + Add to Basket
                  </button>
                  <button
                    className="action-chip"
                    style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fde047", borderColor: "rgba(245, 158, 11, 0.35)", fontWeight: 600 }}
                    onClick={() => {
                      addQuickStaple(activeFood, 1, "kg", "Produce");
                      setActivePage("Price Shock Impact");
                    }}
                  >
                    ⚡ Price Shock Impact →
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>

      {/* User-Friendly Services Cards */}
      <section className="features-showcase">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Explore Features</span>
            <h2>Make Smarter Food Choices</h2>
            <p>Track your food, check market prices, and find cheaper alternatives.</p>
          </div>
        </div>

        <div className="feature-grid">
          <article className="feature-card feature-teal">
            <div className="feature-top">
              <div className="feature-icon teal-icon"><IconBasket /></div>
              <span className="feature-number">01</span>
            </div>
            <span className="feature-category">Food Basket</span>
            <h3>My Food Basket</h3>
            <p>Add food items and manage quantities.</p>
            <div className="feature-note">
              <span>▦</span> {basket.length} items in your basket
            </div>
            <button
              className="feature-button feature-btn-teal"
              onClick={() => setActivePage("My Food Basket")}
            >
              Open Basket <span>→</span>
            </button>
          </article>

          <article className="feature-card feature-cyan">
            <div className="feature-top">
              <div className="feature-icon cyan-icon"><IconChart /></div>
              <span className="feature-number">02</span>
            </div>
            <span className="feature-category">Market Prices</span>
            <h3>Price Analytics</h3>
            <p>Check food prices across markets.</p>
            <div className="feature-note">
              <span>₹</span> View market price records
            </div>
            <button
              className="feature-button feature-btn-cyan"
              onClick={() => getPrices(activeFood || "Tomato")}
            >
              View Prices <span>→</span>
            </button>
          </article>

          <article className="feature-card feature-purple">
            <div className="feature-top">
              <div className="feature-icon purple-icon"><IconSwap /></div>
              <span className="feature-number">03</span>
            </div>
            <span className="feature-category">Food Alternatives</span>
            <h3>Food Substitution</h3>
            <p>Find affordable foods with similar nutrition.</p>
            <div className="feature-note">
              <span>⇄</span> Compare nutrition and cost
            </div>
            <button
              className="feature-button feature-btn-purple"
              onClick={getSubstitutions}
            >
              Find Alternatives <span>→</span>
            </button>
          </article>
        </div>
      </section>

      {/* Quick Preview of loaded data if present */}
      {prices.length > 0 && (
        <section className="dashboard-data-preview">
          <div className="preview-topline">
            <h3>Recent Mandi Records ({selectedCommodity})</h3>
            <button className="text-link-button" onClick={() => setActivePage("Price Analytics")}>
              View All in Price Analytics →
            </button>
          </div>
          {renderPrices(true)}
        </section>
      )}


    </>
  );

  // Section 2: My Food Basket Page
  const renderFoodBasket = () => (
    <section className="content-section">
      {/* 1. Page Heading & 2. Subtitle */}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Household Food Management</span>
          <h2>My Food Basket</h2>
          <p>Manage your food items and monthly consumption.</p>
        </div>
        {basket.length > 0 && (
          <div className="basket-header-actions">
            <button
              type="button"
              className="action-chip"
              style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fde047", borderColor: "rgba(245, 158, 11, 0.35)", fontWeight: 700 }}
              onClick={() => setActivePage("Price Shock Impact")}
              title="Simulate price shock impact on your basket"
            >
              ⚡ Simulate Price Shock
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={clearBasket}
              title="Remove all items from your basket"
            >
              Clear Basket
            </button>
          </div>
        )}
      </div>

      {/* 5. Summary Cards: Total items, Estimated monthly cost, Monthly budget, Remaining budget */}
      <div className="basket-kpi-grid">
        {/* Card 1: Total Food Items */}
        <div className="summary-pill-card kpi-blue">
          <div className="kpi-header">
            <span className="kpi-label">Total Food Items</span>
            <span className="kpi-icon-badge"><IconBasket /></span>
          </div>
          <strong className="kpi-value">{basket.length} {basket.length === 1 ? "Item" : "Items"}</strong>
          <span className="kpi-subtext">Currently tracked in your basket</span>
        </div>

        {/* Card 2: Estimated Monthly Cost */}
        <div className="summary-pill-card kpi-teal">
          <div className="kpi-header">
            <span className="kpi-label">Estimated Monthly Cost</span>
            <span className="estimate-badge" title="Estimated based on average household baseline prices">Est.</span>
          </div>
          <strong className="kpi-value">₹{estimatedMonthlyCost.toLocaleString()}</strong>
          <span className="kpi-subtext">Estimated based on monthly usage</span>
        </div>

        {/* Card 3: Monthly Budget (Editable) */}
        <div className="summary-pill-card kpi-emerald">
          <div className="kpi-header">
            <span className="kpi-label">Monthly Budget</span>
            <span className="kpi-hint-tag">Editable</span>
          </div>
          <div className="budget-input-wrapper">
            <span className="currency-symbol">₹</span>
            <input
              type="number"
              className="budget-number-input"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Math.max(0, Number(e.target.value) || 0))}
              placeholder="5000"
              min="0"
              step="100"
              title="Enter your target monthly budget"
            />
          </div>
          <span className="kpi-subtext">Your target household food budget</span>
        </div>

        {/* Card 4: Remaining Budget */}
        <div className={`summary-pill-card ${remainingBudget >= 0 ? "kpi-green" : "kpi-amber"}`}>
          <div className="kpi-header">
            <span className="kpi-label">Remaining Budget</span>
            <span className={`status-pill ${remainingBudget >= 0 ? "pill-good" : "pill-warn"}`}>
              {remainingBudget >= 0 ? "Under Budget" : "Over Budget"}
            </span>
          </div>
          <strong className={`kpi-value ${remainingBudget >= 0 ? "text-emerald" : "text-amber"}`}>
            ₹{Math.abs(remainingBudget).toLocaleString()}
          </strong>
          <span className="kpi-subtext">
            {remainingBudget >= 0 ? "Remaining from your monthly budget" : "Estimated cost exceeds your budget"}
          </span>
        </div>
      </div>

      {/* Plan Smart Info & Price Impact Banner */}
      <div
        className="basket-plan-banner"
        id="basket-plan-smart-banner"
        role="region"
        aria-label="Plan Smart Info Banner"
      >
        <div className="basket-plan-content">
          <div className="basket-plan-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
              <path d="M16 3H4a2 2 0 0 0-2 2v2" />
              <polyline points="8 14 11 17 16 11" />
            </svg>
          </div>
          <div className="basket-plan-text">
            <strong className="basket-plan-title">Plan Smart. Spend Better.</strong>
            <p className="basket-plan-desc">
              Know your food costs, explore alternatives, and plan your monthly budget with confidence.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="basket-plan-btn"
          id="see-price-impact-btn"
          onClick={() => setActivePage("Price Shock Impact")}
        >
          See Price Impact →
        </button>
      </div>

      {/* 3. Add Food Form (also serves as Edit form when editing) */}
      <div className="basket-builder-card" id="add-food-form-card">
        <div className="builder-card-header">
          <div>
            <h3 className="builder-title">
              {editingItemId ? "Edit Food Item" : "Add Food to Basket"}
            </h3>
            <p className="builder-subtitle">
              {editingItemId
                ? "Update food name, quantity, unit, and monthly usage details for this food item."
                : "Add your everyday groceries and track how much your household uses each month."}
            </p>
          </div>
          {editingItemId && (
            <button
              type="button"
              className="cancel-edit-btn"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          )}
        </div>

        {basketError && (
          <div className="basket-form-error-banner" role="alert" id="basket-form-error-alert">
            <span className="error-icon">⚠️</span>
            <span>{basketError}</span>
          </div>
        )}

        <form className="basket-add-form" onSubmit={handleSaveFoodItem} noValidate>
          <div className="form-fields-grid">
            {/* Field 1: Food name */}
            <div className="form-group flex-2">
              <label htmlFor="food-name-input">
                Food Name <span className="required-star">*</span>
              </label>
              <input
                id="food-name-input"
                type="text"
                placeholder="e.g. Tomato, Rice, Milk, Potato"
                value={foodForm.name}
                onChange={(e) => {
                  setFoodForm(prev => ({ ...prev, name: e.target.value }));
                  if (basketError) setBasketError("");
                }}
                required
              />
            </div>

            {/* Field 2: Quantity */}
            <div className="form-group flex-1">
              <label htmlFor="food-qty-input">
                Quantity <span className="required-star">*</span>
              </label>
              <input
                id="food-qty-input"
                type="number"
                min="0.01"
                step="any"
                placeholder="e.g. 5"
                value={foodForm.quantity}
                onChange={(e) => {
                  setFoodForm(prev => ({ ...prev, quantity: e.target.value }));
                  if (basketError) setBasketError("");
                }}
                required
              />
            </div>

            {/* Field 3: Unit (kg, g, litre, ml, or pieces) */}
            <div className="form-group flex-1">
              <label htmlFor="food-unit-select">
                Unit <span className="required-star">*</span>
              </label>
              <select
                id="food-unit-select"
                value={foodForm.unit}
                onChange={(e) => {
                  setFoodForm(prev => ({ ...prev, unit: e.target.value }));
                  if (basketError) setBasketError("");
                }}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="litre">litre</option>
                <option value="ml">ml</option>
                <option value="pieces">pieces</option>
              </select>
            </div>

            {/* Field 4: Monthly usage */}
            <div className="form-group flex-2">
              <label htmlFor="food-usage-input">
                Monthly Usage <span className="required-star">*</span>
              </label>
              <div className="monthly-usage-input-group">
                <input
                  id="food-usage-input"
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="e.g. 15"
                  value={foodForm.monthlyUsage}
                  onChange={(e) => {
                    setFoodForm(prev => ({ ...prev, monthlyUsage: e.target.value }));
                    if (basketError) setBasketError("");
                  }}
                  required
                />
                <span className="monthly-unit-badge" id="monthly-unit-display-badge">
                  {foodForm.unit}/month
                </span>
              </div>
              <span className="monthly-usage-preview-text" id="monthly-usage-preview-text">
                Displayed as: <strong className="preview-highlight">{foodForm.monthlyUsage ? `${foodForm.monthlyUsage} ${foodForm.unit}/month` : `— ${foodForm.unit}/month`}</strong>
              </span>
            </div>
          </div>

          {/* Field 5: Action buttons */}
          <div className="form-actions-bar">
            <button
              type="submit"
              className="primary-button add-food-submit-btn"
              id="save-food-btn"
            >
              {editingItemId ? "Save Changes" : "+ Add Food"}
            </button>
            {editingItemId && (
              <button
                type="button"
                className="secondary-button cancel-food-btn"
                id="cancel-food-btn"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 4. Food Items Table with Search, Edit & Delete */}
      <div className="basket-table-card">
        <div className="table-top-bar">
          <div className="table-title-group">
            <h3 className="table-heading">Food Items Table</h3>
            <span className="table-count-badge">
              {filteredBasket.length} {filteredBasket.length === 1 ? "Item" : "Items"}
              {basketSearch.trim() && ` matching "${basketSearch}"`}
            </span>
          </div>

          {/* Search Box */}
          <div className="basket-search-box">
            <span className="search-box-icon">🔍</span>
            <input
              type="text"
              className="basket-search-input"
              placeholder="Search food items..."
              value={basketSearch}
              onChange={(e) => setBasketSearch(e.target.value)}
            />
            {basketSearch && (
              <button
                type="button"
                className="clear-search-button"
                onClick={() => setBasketSearch("")}
                title="Clear search filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Clean Empty State when basket has no items */}
        {basket.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconBasket /></div>
            <h3>Your food basket is currently empty</h3>
            <p>
              Use the form above to add everyday groceries, vegetables, and staples to plan your household consumption and budget.
            </p>
            <div className="starter-staples">
              <span className="starter-label">Quick add starter items:</span>
              <div className="starter-buttons">
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => addQuickStaple("Tomato", 3, "kg", "12 kg / month")}
                >
                  + 3 kg Tomato
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => addQuickStaple("Potato", 5, "kg", "15 kg / month")}
                >
                  + 5 kg Potato
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => addQuickStaple("Onion", 3, "kg", "10 kg / month")}
                >
                  + 3 kg Onion
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => addQuickStaple("Fresh Milk", 2, "litre", "60 litres / month")}
                >
                  + 2 litre Milk
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => addQuickStaple("Basmati Rice", 10, "kg", "25 kg / month")}
                >
                  + 10 kg Rice
                </button>
              </div>
            </div>
          </div>
        ) : filteredBasket.length === 0 ? (
          <div className="no-search-results">
            <p>No food items found matching <strong>"{basketSearch}"</strong>.</p>
            <button
              type="button"
              className="text-link-button"
              onClick={() => setBasketSearch("")}
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="table-responsive-container">
            <table className="basket-items-table">
              <thead>
                <tr>
                  <th>Food Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Monthly Usage</th>
                  <th>Estimated Cost <span className="est-tag">(Est.)</span></th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBasket.map((item) => {
                  const itemCost = calculateItemMonthlyCost(item);
                  const isEditingThis = editingItemId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={isEditingThis ? "row-is-editing" : ""}
                    >
                      {/* Column 1: Food name */}
                      <td className="food-name-cell">
                        <span className="food-circle-badge">
                          {item.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="food-name-details">
                          <strong className="food-item-title">{item.name}</strong>
                          {isEditingThis && (
                            <span className="editing-pill">Currently Editing</span>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Quantity */}
                      <td className="quantity-cell">
                        <span className="quantity-chip">{item.quantity}</span>
                      </td>

                      {/* Column 3: Unit */}
                      <td className="unit-cell">
                        <span className="unit-pill">{item.unit}</span>
                      </td>

                      {/* Column 4: Monthly usage */}
                      <td className="usage-cell">
                        <span className="usage-display">
                          {typeof item.monthlyUsage === "number"
                            ? `${item.monthlyUsage} ${item.unit || "kg"}/month`
                            : (item.monthlyUsage || `${parseMonthlyUsageQty(item)} ${item.unit || "kg"}/month`)}
                        </span>
                      </td>

                      {/* Estimated Cost (clearly labeled as estimate) */}
                      <td className="cost-cell">
                        <span className="cost-amount">₹{itemCost.toLocaleString()}</span>
                        <span className="cost-disclaimer-label">Est.</span>
                      </td>

                      {/* Column 5: Edit and Delete buttons */}
                      <td className="actions-cell text-right">
                        <button
                          type="button"
                          className="table-btn edit-action-btn"
                          onClick={() => startEditItem(item)}
                          title={`Edit ${item.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="table-btn delete-action-btn"
                          onClick={() => deleteBasketItem(item.id)}
                          title={`Delete ${item.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Plan Smart Estimate Notice */}
        {basket.length > 0 && (
          <div className="basket-estimate-disclaimer">
            <span className="disclaimer-icon">💡</span>
            <div className="disclaimer-body">
              <strong className="disclaimer-title">Small Changes, Smarter Spending</strong>
              <p className="disclaimer-text">
                Compare your monthly food costs with your budget to see where you can save.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );



  // Section 4: Price Analytics Page
  const renderPrices = (isPreview = false) => (
    <section className={isPreview ? "content-preview-block" : "content-section"}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Market Mandi Prices</span>
          <h2>Agricultural Price Analytics</h2>
          <p>Explore modal prices and historical records across agricultural mandis.</p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary-button"
            onClick={() => getPrices(selectedCommodity)}
            disabled={loading === "prices"}
          >
            {loading === "prices" ? "Loading..." : "↻ Refresh Prices"}
          </button>
        </div>
      </div>

      {/* Commodity Search & Filter Bar */}
      {!isPreview && (
        <div className="price-search-bar">
          <div className="price-search-field">
            <label>Commodity</label>
            <input
              type="text"
              placeholder="e.g. Tomato, Onion, Potato"
              value={selectedCommodity}
              onChange={(e) => setSelectedCommodity(e.target.value)}
            />
          </div>

          <div className="price-search-field">
            <label>State (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Maharashtra, Punjab"
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
            />
          </div>

          <div className="price-search-field">
            <label>District (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Pune, Nashik"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
            />
          </div>

          <div className="price-search-btn-wrapper">
            <button
              className="primary-button"
              onClick={() => getPrices(selectedCommodity)}
              disabled={loading === "prices"}
            >
              <IconSearch /> Fetch Prices
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Strip */}
      {priceStats && !isPreview && (
        <div className="price-kpi-grid">
          <div className="kpi-card">
            <span className="kpi-label">Latest Modal Price</span>
            <strong className="kpi-value text-green">₹{priceStats.latest}</strong>
            <span className="kpi-sub">Per Quintal (Recent Mandi Record)</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Average Price</span>
            <strong className="kpi-value">₹{priceStats.avg}</strong>
            <span className="kpi-sub">Across reporting centers</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Price Range</span>
            <strong className="kpi-value">₹{priceStats.min} – ₹{priceStats.max}</strong>
            <span className="kpi-sub">Min to Max observed</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Reporting Centers</span>
            <strong className="kpi-value">{priceStats.count}</strong>
            <span className="kpi-sub">Mandi price observations</span>
          </div>
        </div>
      )}

      {/* SVG Interactive Line Chart */}
      {!isPreview && renderPriceChart()}

      {/* Mandi Price Records Grid */}
      {prices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><IconChart /></div>
          <h3>No price records available</h3>
          <p>
            Enter a commodity name or click below to request market price records
            from the agricultural database.
          </p>
          <div className="quick-commodity-chips">
            {["Tomato", "Onion", "Potato", "Rice", "Wheat"].map(name => (
              <button
                key={name}
                className="starter-btn"
                onClick={() => {
                  setSelectedCommodity(name);
                  getPrices(name);
                }}
              >
                Fetch {name} Prices
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="data-grid">
          {prices.slice(0, isPreview ? 3 : undefined).map((price, index) => (
            <article className="data-card price-card" key={price._id || index}>
              <div className="card-topline">
                <span className="mini-icon blue-icon">₹</span>
                <span className="status-pill blue-pill">Mandi Record</span>
              </div>

              <div className="price-card-header">
                <h3>{price.commodity || selectedCommodity || "Commodity"}</h3>
                <span className="market-badge">{price.market || "General Market"}</span>
              </div>

              <div className="price-value">
                ₹{price.modalPrice ?? "N/A"}
              </div>
              <p className="muted">Modal price per quintal</p>

              <div className="detail-list">
                <p>
                  <span>State</span>
                  <strong>{price.state || "N/A"}</strong>
                </p>
                <p>
                  <span>District</span>
                  <strong>{price.district || "N/A"}</strong>
                </p>
                <p>
                  <span>Market</span>
                  <strong>{price.market || "N/A"}</strong>
                </p>
                <p>
                  <span>Date Recorded</span>
                  <strong>
                    {price.date && !Number.isNaN(new Date(price.date).getTime())
                      ? new Date(price.date).toLocaleDateString()
                      : "N/A"}
                  </strong>
                </p>
              </div>

              <div className="price-card-footer">
                <button
                  className="action-button-mini full-width"
                  onClick={() => {
                    addQuickStaple(price.commodity || selectedCommodity, 1, "kg", "Produce");
                    setActivePage("My Food Basket");
                  }}
                >
                  + Add to Food Basket
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* User-Friendly Notice */}
      {!isPreview && (
        <div className="model-transparency-card">
          <div className="transparency-icon">ℹ</div>
          <div>
            <h4>Market Price Information</h4>
            <p>
              Historical market prices are fetched directly from agricultural mandi records.
              AI predictive price forecasting will activate when connected to the prediction service.
            </p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside ref={sidebarRef} className="sidebar">
        {/* Brand Area: Displays ONLY Original Logo and Agri$wap (No Taglines) */}
        <div className="brand">
          <div className="brand-mark">
            <img
              src="/logo.png"
              alt="Agri$wap logo"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
            <span className="brand-fallback">A</span>
          </div>
          <div className="brand-text">
            <h1 className="brand-title">Agri<span>$wap</span></h1>
          </div>
        </div>

        <div className="sidebar-label">Menu</div>
        <nav className="navigation">
          {navigationItems.map((page) => (
            <button
              key={page.name}
              className={`nav-item nav-item-${page.slug || "item"} ${activePage === page.name ? "active" : ""}`}
              onClick={() => setActivePage(page.name)}
            >
              <span className="nav-icon">{page.icon}</span>
              <span className="nav-label">{page.name}</span>
              {page.badge && (
                <span className="nav-count-badge">{page.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        {/* Sidebar Info Card */}
        <div className="sidebar-bottom">
          <div className="sidebar-leaf-icon"><IconSparkles /></div>
          <div className="sidebar-mission-titles">
            <span className="sidebar-mission-line1">Better Food.</span>
            <span className="sidebar-mission-line2">Brighter Future.</span>
          </div>
          <p>Smart food swaps to save money and eat better with live farm prices.</p>
          <div className="sidebar-decoration" />
        </div>

        <div className="sidebar-footer">
          <span className="connection-dot" />
          <span>Agri$wap</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-brand">Agri$wap</span> <span>/</span> <strong>{activePage}</strong>
          </div>

          <div className="topbar-right">
            <h2 className="topbar-brand-heading">
              Agricultural <span className="topbar-brand-accent">Intelligence</span>
            </h2>
            <div className="topbar-avatar-frame" title="Agri$wap Produce">
              <img
                src="/agri_avatar.jpg"
                alt="Fresh agricultural produce"
                className="topbar-avatar-img"
                onError={(e) => {
                  e.currentTarget.src = "/grow_with_agriculture.jpg";
                }}
              />
            </div>
          </div>
        </header>

        {/* Global Error Alert */}
        <div className="page-content">
          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">!</span>
              <span className="error-text">{error}</span>
              <button
                type="button"
                className="error-dismiss"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Page Routing - Lazy Mount & Keep-Alive for Instant Navigation */}
          <div
            className="page-view-container"
            style={{ display: activePage === "Dashboard" ? "block" : "none" }}
          >
            {renderDashboard()}
          </div>

          <div
            className="page-view-container"
            style={{ display: activePage === "My Food Basket" ? "block" : "none" }}
          >
            {renderFoodBasket()}
          </div>

          {visitedPages.has("Price Shock Impact") && (
            <div
              className="page-view-container"
              style={{ display: activePage === "Price Shock Impact" ? "block" : "none" }}
            >
              <PriceShockImpact
                basket={basket}
                monthlyBudget={monthlyBudget}
                isActive={activePage === "Price Shock Impact"}
                onNavigate={setActivePage}
                onNavigateToSubstitution={handleNavigateToSubstitutionFromShock}
                onNavigateToPrices={handleNavigateToPricesFromShock}
              />
            </div>
          )}

          {visitedPages.has("Food Substitution") && (
            <div
              className="page-view-container"
              style={{ display: activePage === "Food Substitution" ? "block" : "none" }}
            >
              <FoodSubstitution
                initialFood={activeFood || selectedCommodity || "Tomato"}
                onAddToBasket={(item) => {
                  addQuickStaple(item.name, item.quantity, item.unit, item.monthlyUsage);
                }}
                onNavigateToPrices={(commodityName) => {
                  setSelectedCommodity(commodityName);
                  getPrices(commodityName);
                  setActivePage("Price Analytics");
                }}
                onNavigateToShock={(commodityName) => {
                  if (commodityName) setSelectedCommodity(commodityName);
                  setActivePage("Price Shock Impact");
                }}
              />
            </div>
          )}

          {visitedPages.has("Price Analytics") && (
            <div
              className="page-view-container"
              style={{ display: activePage === "Price Analytics" ? "block" : "none" }}
            >
              <PriceAnalytics
                initialCommodity={selectedCommodity || "Tomato"}
                onNavigateToShock={(commodityName) => {
                  if (commodityName) setSelectedCommodity(commodityName);
                  setActivePage("Price Shock Impact");
                }}
              />
            </div>
          )}

          {/* Page Footer */}
          <footer className="page-footer">
            <div className="footer-left">
              <span className="footer-dot" />
              <strong className="footer-brand">Agri<span>$wap</span></strong>
              <span className="footer-divider">|</span>
              <span className="footer-note footer-tagline">Smart Food Choices & Agricultural Insights</span>
            </div>
            <span className="footer-note footer-platform">Agri$wap Platform</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;