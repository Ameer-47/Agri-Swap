# connect 3 datasets and no of rows,cols,files like substitution,nutrition.basket

from pathlib import Path
import pandas as pd
import sys
import os

_cached_df_risk = None

def get_food_risk(food_name):
    global _cached_df_risk
    try:
        if _cached_df_risk is None:
            current_file = Path(__file__).resolve()
            proj_root = current_file.parents[2]
            risk_path = proj_root / "ML" / "price_prediction" / "price_risk_predictions.csv"
            if not risk_path.is_file():
                risk_path = proj_root / "ML" / "price_prediction" / "test_predictions.csv"
            if not risk_path.is_file():
                return None
            df_loaded = pd.read_csv(risk_path)
            if "Arrival_Date" in df_loaded.columns:
                df_loaded["Arrival_Date"] = pd.to_datetime(df_loaded["Arrival_Date"])
            _cached_df_risk = df_loaded
        else:
            df_loaded = _cached_df_risk

        food_data = df_loaded[df_loaded["Commodity"].str.lower() == food_name.lower()].copy()
        if food_data.empty:
            return None
        latest = food_data.sort_values("Arrival_Date").iloc[-1]
        p_risk = latest.get("Price_Risk")
        if pd.isna(p_risk) or not p_risk:
            chg = float(latest.get("Price_Change_Percent", 0))
            p_risk = "Low" if chg < 10 else ("Medium" if chg < 25 else "High")
        return {
            "Commodity": latest["Commodity"],
            "Actual_Price": latest.get("Actual_Modal_Price"),
            "Predicted_Price": latest.get("Predicted_Modal_Price"),
            "Price_Change_Percent": latest.get("Price_Change_Percent"),
            "Price_Risk": p_risk
        }
    except Exception:
        return None

def find_project_root():
    current_file = Path(__file__).resolve()

    for folder in [current_file] + list(current_file.parents):
        if (
            (folder / "Datasets").is_dir()
            and (folder / "ML").is_dir()
        ):
            return folder

    raise FileNotFoundError(
        "Agri_Swap_Project root folder was not found."
    )


def find_file(base_folder, file_name):
    candidates = [
        base_folder / "food_substitution_dataset" / file_name,
        base_folder / "Food Nutrition Dataset" / file_name,
        base_folder / "user_food_basket_dataset" / file_name,
        base_folder / file_name
    ]
    for c in candidates:
        if c.is_file():
            return c

    checked_paths = [str(c) for c in candidates]
    raise FileNotFoundError(
        f"Required dataset file '{file_name}' not found. Searched locations: {', '.join(checked_paths)}"
    )


PROJECT_ROOT = find_project_root()
DATASETS_DIR = PROJECT_ROOT / "Datasets"


nutrition_path = find_file(
    DATASETS_DIR,
    "comprehensive_foods_usda.csv"
)

substitution_path = find_file(
    DATASETS_DIR,
    "food_substitution_dataset_150plus.csv"
)

basket_path = find_file(
    DATASETS_DIR,
    "user_food_basket_dataset_expanded.csv"
)


# nutrition_df is now managed via persistent SQLite storage (nutrition.db)
_legacy_nutrition_df = None
def get_legacy_nutrition_df():
    global _legacy_nutrition_df
    if _legacy_nutrition_df is None:
        _legacy_nutrition_df = pd.read_csv(nutrition_path)
        _legacy_nutrition_df["name_clean"] = _legacy_nutrition_df["food_name"].astype(str).apply(normalize_name)
        _legacy_nutrition_df["category_clean"] = _legacy_nutrition_df["food_category"].astype(str).str.strip().str.lower()
    return _legacy_nutrition_df

substitution_df = pd.read_csv(substitution_path)
basket_df = pd.read_csv(basket_path)

import re

def normalize_name(name):
    name = str(name).strip().lower()
    name = name.replace(",", " ")
    name = name.replace("-", " ")
    name = re.sub(r"\s+", " ", name)
    return name


# Real wholesale APMC price dictionary (Rs/kg) from cleaned agricultural parquet
MARKET_PRICES = {
    "almond milk": 120.0,
    "almonds": 925.0,
    "amaranth leaves": 20.0,
    "amla": 70.0,
    "apple": 90.0,
    "apricot": 85.0,
    "artichoke": 80.0,
    "arugula": 40.0,
    "ash gourd": 13.0,
    "asparagus": 285.0,
    "baby corn": 45.0,
    "bamboo shoots": 32.5,
    "banana": 38.0,
    "barley": 22.5,
    "basil": 45.0,
    "basmati rice": 65.0,
    "beet greens": 18.0,
    "beetroot": 27.9,
    "bitter gourd": 28.7,
    "black chickpeas": 55.25,
    "black eyed beans": 75.0,
    "black gram": 101.7,
    "black pepper": 646.9,
    "black salt": 25.0,
    "blackberries": 200.0,
    "blueberries": 220.0,
    "bok choy": 35.0,
    "bottle gourd": 12.5,
    "brinjal": 17.0,
    "broad beans": 43.3,
    "broccoli": 45.0,
    "brown rice": 45.0,
    "brussels sprouts": 60.0,
    "buckwheat": 80.0,
    "butter": 450.0,
    "buttermilk": 25.0,
    "button mushroom": 120.0,
    "cabbage": 14.0,
    "capsicum": 32.7,
    "cardamom": 1800.0,
    "carrot": 23.6,
    "cashews": 850.0,
    "cauliflower": 17.3,
    "celery": 40.0,
    "chana dal": 77.3,
    "cherries": 180.0,
    "chia seeds": 250.0,
    "chickpeas": 64.5,
    "cinnamon": 350.0,
    "cloves": 850.0,
    "cluster beans": 34.2,
    "coconut": 35.0,
    "coconut oil": 220.0,
    "coconut water": 40.0,
    "collard greens": 24.0,
    "coriander leaves": 30.0,
    "coriander seeds": 110.0,
    "corn flour": 30.0,
    "cornstarch": 45.0,
    "cottage cheese": 280.0,
    "cowpeas": 75.0,
    "cucumber": 25.0,
    "cumin seeds": 280.0,
    "curd": 40.0,
    "curry leaves": 45.0,
    "custard apple": 50.0,
    "dalia": 40.0,
    "dates": 120.0,
    "dill leaves": 35.0,
    "drumstick leaves": 40.0,
    "egg": 6.0,
    "egg white": 5.0,
    "fennel": 40.0,
    "fennel seeds": 160.0,
    "fenugreek leaves": 25.0,
    "fenugreek seeds": 85.0,
    "fig": 90.0,
    "flax seeds": 120.0,
    "french beans": 43.3,
    "fresh turmeric": 70.0,
    "garlic": 120.0,
    "ghee": 550.0,
    "ginger": 60.0,
    "grapefruit": 70.0,
    "grapes": 70.0,
    "greek yogurt": 75.0,
    "green beans": 43.3,
    "green chilli": 45.0,
    "green gram": 55.1,
    "green pigeon peas": 65.0,
    "groundnut oil": 165.0,
    "guava": 40.0,
    "iceberg lettuce": 30.0,
    "jackfruit": 40.0,
    "jalapeno": 60.0,
    "kale": 50.0,
    "kidney beans": 115.0,
    "kiwi": 110.0,
    "kohlrabi": 22.0,
    "leek": 40.0,
    "lemon": 65.0,
    "lemongrass": 40.0,
    "lentils": 85.0,
    "lima beans": 85.0,
    "lime": 60.0,
    "lotus root": 70.0,
    "low fat milk": 50.0,
    "lychee": 80.0,
    "mango": 60.0,
    "milk": 55.0,
    "millet": 23.5,
    "mint leaves": 40.0,
    "moong dal": 95.0,
    "murmura": 50.0,
    "muskmelon": 25.0,
    "mustard greens": 22.0,
    "mustard oil": 145.0,
    "mustard seeds": 75.0,
    "navy beans": 90.0,
    "nutmeg": 650.0,
    "oat flour": 85.0,
    "oats": 75.0,
    "okra": 24.5,
    "olive oil": 650.0,
    "onion": 20.5,
    "orange": 50.0,
    "oyster mushroom": 140.0,
    "paneer": 320.0,
    "papaya": 30.0,
    "parsley": 50.0,
    "parsnip": 35.0,
    "peach": 80.0,
    "peanut butter": 180.0,
    "peanuts": 95.0,
    "pear": 60.0,
    "peas": 38.0,
    "pineapple": 45.0,
    "pinto beans": 90.0,
    "pistachios": 1250.0,
    "plum": 75.0,
    "poha": 68.0,
    "pomegranate": 120.0,
    "potato": 16.7,
    "pumpkin": 14.2,
    "pumpkin seeds": 220.0,
    "quinoa": 140.0,
    "radish": 20.0,
    "raw banana": 18.0,
    "raw mango": 28.0,
    "red bell pepper": 55.0,
    "red cabbage": 30.0,
    "red chilli": 65.0,
    "rice": 36.0,
    "ridge gourd": 22.0,
    "rock salt": 25.0,
    "romaine lettuce": 35.0,
    "rutabaga": 28.0,
    "sago": 60.0,
    "sapota": 35.0,
    "semolina": 38.0,
    "sesame oil": 210.0,
    "sesame seeds": 160.0,
    "shallot": 35.0,
    "shiitake mushroom": 200.0,
    "skim milk": 45.0,
    "snake gourd": 18.0,
    "snow peas": 50.0,
    "sorghum": 28.0,
    "soy chunks": 95.0,
    "soy milk": 80.0,
    "soybean oil": 125.0,
    "soybeans": 60.0,
    "spinach": 18.5,
    "spring onion": 25.0,
    "strawberry": 150.0,
    "sugar snap peas": 50.0,
    "sunflower oil": 135.0,
    "sunflower seeds": 180.0,
    "sweet corn": 30.0,
    "sweet lime": 45.0,
    "sweet potato": 22.0,
    "swiss chard": 28.0,
    "tahini": 240.0,
    "tamarind": 85.0,
    "taro": 25.0,
    "tofu": 160.0,
    "tofu silken": 170.0,
    "tomato": 21.9,
    "toor dal": 109.0,
    "turmeric": 140.0,
    "turnip": 18.0,
    "turnip greens": 18.0,
    "walnuts": 1100.0,
    "water chestnut": 50.0,
    "watercress": 35.0,
    "watermelon": 18.0,
    "watermelon seeds": 190.0,
    "wheat": 26.0,
    "white peas": 55.0,
    "whole moong": 90.0,
    "whole wheat flour": 32.0,
    "yam": 26.0,
    "yellow bell pepper": 55.0,
    "zucchini": 35.0,
}

NUTRITION_CACHE = {}


# find_substitutes("Tomato")

def find_substitutes(food_name):
    food_name = food_name.strip().lower()

    matches = substitution_df[
        substitution_df["Food"].astype(str).str.strip().str.lower()
        == food_name
    ].copy()

    if matches.empty:
        return pd.DataFrame()

    return matches[
        [
            "Food",
            "Alternative",
            "Food_Role",
            "Cuisine",
            "Nutrition_Similarity",
            "Cooking_Similarity",
            "Price_Suitability",
            "Availability",
            "Substitution_Ratio",
            "Overall_Suitability"
        ]
    ].reset_index(drop=True)


# Overall_Suitability,Availability - numeric score

def rank_substitutes(food_name):
    candidates = find_substitutes(food_name)

    if candidates.empty:
        return pd.DataFrame()

    availability_score = {
        "High": 1.0,
        "Medium": 0.5,
        "Low": 0.2
    }

    candidates["Availability_Score"] = (
        candidates["Availability"]
        .astype(str)
        .str.strip()
        .map(availability_score)
        .fillna(0)
    )

    candidates["Final_Score"] = (
        candidates["Overall_Suitability"] * 0.70
        + candidates["Availability_Score"] * 0.30
    )

    candidates = candidates.sort_values(
        by="Final_Score",
        ascending=False
    )

    return candidates.reset_index(drop=True)


# add user basket connect like User_ID | Food | Quantity | Unit | Period

def get_user_food(user_id, food_name):
    user_id = user_id.strip().lower()
    food_name = food_name.strip().lower()

    matches = basket_df[
        (basket_df["User_ID"].astype(str).str.strip().str.lower() == user_id)
        & (basket_df["Food"].astype(str).str.strip().str.lower() == food_name)
    ].copy()

    return matches.reset_index(drop=True)



# calculate_substitution_quantity

def calculate_substitution_quantity(user_id, food_name):
    user_food = get_user_food(user_id, food_name)

    if user_food.empty:
        return pd.DataFrame()

    candidates = find_substitutes(food_name)

    if candidates.empty:
        return pd.DataFrame()

    quantity = float(user_food.iloc[0]["Quantity"])
    unit = str(user_food.iloc[0]["Unit"])
    period = str(user_food.iloc[0]["Period"])

    candidates["Recommended_Quantity"] = (
        quantity * candidates["Substitution_Ratio"]
    )

    candidates["Original_Quantity"] = quantity
    candidates["Unit"] = unit
    candidates["Period"] = period

    return candidates[
    [
        "Food",
        "Alternative",
        "Original_Quantity",
        "Recommended_Quantity",
        "Unit",
        "Period",
        "Substitution_Ratio",
        "Nutrition_Similarity",
        "Price_Suitability",
        "Overall_Suitability",
        "Availability"
    ]
].reset_index(drop=True)


# Clean ranking

def get_top_substitutes(user_id, food_name, top_n=3):
    recommendations = calculate_substitution_quantity(
        user_id,
        food_name
    )

    if recommendations.empty:
        return pd.DataFrame()

    recommendations = recommendations.sort_values(
        by="Final_Score",
        ascending=False
    )

    grouped = (
        recommendations
        .groupby(
            ["Food", "Alternative"],
            as_index=False
        )
        .first()
    )

    grouped = grouped.sort_values(
        by="Final_Score",
        ascending=False
    )

    return grouped.head(top_n).reset_index(drop=True)

'''
top_substitutes = get_top_substitutes(
    "U001",
    "Tomato",
    top_n=3
)

print("\nTop 3 Tomato substitutes:")

print(
    top_substitutes[
        [
            "Food",
            "Alternative",
            "Original_Quantity",
            "Recommended_Quantity",
            "Unit",
            "Period",
            "Substitution_Ratio",
            "Final_Score"
        ]
    ].to_string(index=False)
)
'''

# for all foods in basket

def generate_all_recommendations(user_id, top_n=3):
    user_basket = basket_df[
        basket_df["User_ID"].astype(str).str.strip().str.lower()
        == user_id.strip().lower()
    ].copy()

    if user_basket.empty:
        return pd.DataFrame()

    all_recommendations = []

    for food_name in user_basket["Food"].dropna().unique():

        recommendations = get_top_substitutes(
            user_id,
            food_name,
            top_n=top_n
        )

        if recommendations.empty:
            continue

        all_recommendations.append(recommendations)

    if not all_recommendations:
        return pd.DataFrame()

    return pd.concat(
        all_recommendations,
        ignore_index=True
    )

# Find matching nutrition records

def find_nutrition(food_name):
    food_name = food_name.strip().lower()

    data = get_legacy_nutrition_df().copy()

    data["food_name_clean"] = (
        data["food_name"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    data["category_clean"] = (
        data["food_category"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    exact_matches = data[
        data["food_name_clean"] == food_name
    ].copy()

    if not exact_matches.empty:
        return exact_matches[
            [
                "food_name",
                "food_category",
                "calories",
                "protein_g",
                "carbs_g",
                "fat_g",
                "fiber_g",
                "calcium_mg",
                "iron_mg",
                "vitamin_c_mg"
            ]
        ].reset_index(drop=True)

    fruit_vegetable_matches = data[
        data["category_clean"].str.contains(
            "fruit|vegetable",
            na=False
        )
        &
        data["food_name_clean"].str.contains(
            rf"\b{re.escape(food_name)}\b",
            regex=True,
            na=False
        )
    ].copy()

    if fruit_vegetable_matches.empty:
        return pd.DataFrame()

    fruit_vegetable_matches["name_length"] = (
        fruit_vegetable_matches["food_name_clean"].str.len()
    )

    fruit_vegetable_matches = (
        fruit_vegetable_matches
        .sort_values("name_length")
        .drop_duplicates("food_name")
    )

    return fruit_vegetable_matches[
        [
            "food_name",
            "food_category",
            "calories",
            "protein_g",
            "carbs_g",
            "fat_g",
            "fiber_g",
            "calcium_mg",
            "iron_mg",
            "vitamin_c_mg"
        ]
    ].head(5).reset_index(drop=True)


# Select suitable nutrition record

import re


def normalize_name(name):
    name = str(name).strip().lower()
    name = name.replace(",", " ")
    name = name.replace("-", " ")
    name = re.sub(r"\s+", " ", name)
    return name


def find_best_nutrition(food_name):
    from ML.food_substitution.nutrition_store import get_food_nutrition
    profile = get_food_nutrition(food_name)
    if profile is None:
        return None
    # Ensure profile has 'food_name' key for backward compatibility
    if "food_name" not in profile:
        profile["food_name"] = profile.get("usda_food_name") or profile.get("display_name")
    return profile


def show_nutrition(food_name):
    result = find_best_nutrition(food_name)

    print(f"\nNutrition for: {food_name}")

    if result is None:
        print("No suitable nutrition record found.")
        return

    print("Food:", result["food_name"])
    print("Category:", result["food_category"])
    print("Calories:", result["calories"])
    print("Protein:", result["protein_g"])
    print("Carbs:", result["carbs_g"])
    print("Fat:", result["fat_g"])
    print("Fiber:", result["fiber_g"])
    print("Calcium:", result["calcium_mg"])
    print("Iron:", result["iron_mg"])
    print("Vitamin C:", result["vitamin_c_mg"])


def check_mango_records():
    data = get_legacy_nutrition_df().copy()

    data["name_clean"] = (
        data["food_name"]
        .astype(str)
        .apply(normalize_name)
    )

    matches = data[
        data["name_clean"].str.contains(
            r"\bmango\b",
            regex=True,
            na=False
        )
        &
        data["name_clean"].str.contains(
            r"\braw\b",
            regex=True,
            na=False
        )
    ]

    print("\nRaw Mango related nutrition records:")

    print(
        matches[
            [
                "food_name",
                "food_category",
                "calories",
                "protein_g",
                "carbs_g",
                "fat_g",
                "fiber_g",
                "calcium_mg",
                "iron_mg",
                "vitamin_c_mg"
            ]
        ].to_string(index=False)
    )


def calculate_nutrition_similarity(
    food_name,
    alternative_name
):
    original = find_best_nutrition(food_name)
    alternative = find_best_nutrition(alternative_name)

    if original is None or alternative is None:
        return None

    nutrition_columns = [
        "calories",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "calcium_mg",
        "iron_mg",
        "vitamin_c_mg"
    ]

    similarities = []

    for column in nutrition_columns:
        original_value = original.get(column) if isinstance(original, dict) else original[column]
        alternative_value = alternative.get(column) if isinstance(alternative, dict) else alternative[column]

        if pd.isna(original_value) or pd.isna(alternative_value) or original_value is None or alternative_value is None:
            continue

        original_value = float(original_value)
        alternative_value = float(alternative_value)

        maximum = max(
            abs(original_value),
            abs(alternative_value)
        )

        if maximum == 0:
            similarity = 1.0
        else:
            similarity = 1 - (
                abs(original_value - alternative_value)
                / maximum
            )

        similarity = max(
            0.0,
            min(1.0, similarity)
        )

        similarities.append(similarity)

    if not similarities:
        return None

    return sum(similarities) / len(similarities)

def add_actual_nutrition_similarity(recommendations):
    if recommendations.empty:
        return recommendations

    recommendations = recommendations.copy()

    actual_scores = []
    nutrition_scores_used = []

    for _, row in recommendations.iterrows():

        actual_score = calculate_nutrition_similarity(
            row["Food"],
            row["Alternative"]
        )

        if actual_score is None:
            nutrition_scores_used.append(
                row["Nutrition_Similarity"]
            )
        else:
            nutrition_scores_used.append(
                actual_score
            )

        actual_scores.append(actual_score)

    recommendations["Actual_Nutrition_Similarity"] = (
        actual_scores
    )

    recommendations["Nutrition_Similarity_Used"] = (
        nutrition_scores_used
    )

    return recommendations

'''
all_recommendations = generate_all_recommendations(
    "U001",
    top_n=3
)'''

'''
print(
    all_recommendations.to_string(index=False)
)

nutrition_checked = add_actual_nutrition_similarity(
    all_recommendations
)'''


'''
print(
    nutrition_checked[
        [
            "Food",
            "Alternative",
            "Recommended_Quantity",
            "Substitution_Ratio",
            "Nutrition_Similarity",
            "Actual_Nutrition_Similarity",
            "Nutrition_Similarity_Used",
            "Availability",
            "Final_Score"
        ]
    ].to_string(index=False)
)
'''
def generate_final_recommendations(user_id, top_n=3):
   
    user_basket = basket_df[
        basket_df["User_ID"].astype(str).str.strip().str.lower()
        == user_id.strip().lower()
    ].copy()

    if user_basket.empty:
        return pd.DataFrame()

    all_final_recommendations = []

    for food_name in user_basket["Food"].dropna().unique():

        recommendations = calculate_substitution_quantity(
            user_id,
            food_name
        )

        if recommendations.empty:
            continue

        recommendations = add_actual_nutrition_similarity(
            recommendations
        )

        risk = get_food_risk(food_name)

        if risk is not None:
              recommendations["Price_Risk"] = risk["Price_Risk"]
        else:
               recommendations["Price_Risk"] = "Unknown"
        if risk is not None and risk["Price_Risk"] == "Low":
               continue
        if risk is not None and risk["Price_Risk"] == "High":
            recommendations["Risk_Priority"] = 1.20
        else:
              recommendations["Risk_Priority"] = 1.00

        availability_score = {
            "High": 1.0,
            "Medium": 0.5,
            "Low": 0.2
        }

        recommendations["Availability_Score"] = (
            recommendations["Availability"]
            .astype(str)
            .str.strip()
            .map(availability_score)
            .fillna(0)
        )

        recommendations["Final_Score"] = (
            0.45 * recommendations["Nutrition_Similarity_Used"]
            + 0.35 * recommendations["Price_Suitability"]
            + 0.20 * recommendations["Availability_Score"]
        )
        if risk is not None and risk["Price_Risk"] == "High":
             recommendations["Final_Score"] = (
                  recommendations["Final_Score"]
                    * recommendations["Risk_Priority"]
    )

        recommendations = recommendations.sort_values(
            by="Final_Score",
            ascending=False
        )

        grouped = (
            recommendations
            .groupby(
                ["Food", "Alternative"],
                as_index=False
            )
            .first()
        )

        grouped = grouped.sort_values(
            by="Final_Score",
            ascending=False
        )

        all_final_recommendations.append(
            grouped.head(top_n)
        )

    if not all_final_recommendations:
        return pd.DataFrame()

    return pd.concat(
        all_final_recommendations,
        ignore_index=True
    )
def extract_nutrition_profile(nut_rec):
    if nut_rec is None:
        return None
    try:
        def safe_float(v):
            if v is None:
                return None
            if isinstance(v, str):
                v = v.strip()
                if v == "" or v.lower() in ("none", "nan", "null"):
                    return None
            try:
                if pd.notna(v):
                    return round(float(v), 1)
                return None
            except (ValueError, TypeError):
                return None

        return {
            "calories": safe_float(nut_rec.get("calories")),
            "protein_g": safe_float(nut_rec.get("protein_g")),
            "carbs_g": safe_float(nut_rec.get("carbs_g")),
            "fat_g": safe_float(nut_rec.get("fat_g")),
            "fiber_g": safe_float(nut_rec.get("fiber_g")),
            "calcium_mg": safe_float(nut_rec.get("calcium_mg")),
            "iron_mg": safe_float(nut_rec.get("iron_mg")),
            "vitamin_c_mg": safe_float(nut_rec.get("vitamin_c_mg")),
        }
    except Exception:
        return None

def get_available_substitution_foods():
    unique_foods = sorted(substitution_df["Food"].dropna().unique().tolist())
    food_list = []
    for f in unique_foods:
        subset = substitution_df[substitution_df["Food"].str.strip().str.lower() == f.lower()]
        alt_count = len(subset["Alternative"].unique())
        first_row = subset.iloc[0]
        role = str(first_row.get("Food_Role", "Vegetable"))
        cuisine = str(first_row.get("Cuisine", "Indian"))
        food_list.append({
            "name": f,
            "foodRole": role,
            "cuisine": cuisine,
            "alternativeCount": alt_count
        })
    return {
        "success": True,
        "count": len(food_list),
        "foods": food_list
    }

def get_single_food_substitutions(food_name, quantity=1.0, unit="kg", preference="balanced", top_n=10):
    food_clean = food_name.strip()
    norm = food_clean.lower()

    matches = substitution_df[
        substitution_df["Food"].str.strip().str.lower() == norm
    ].copy()

    if matches.empty:
        return {
            "success": False,
            "message": f"No agricultural substitutions recorded for '{food_name}'.",
            "originalFood": {"name": food_clean, "quantity": quantity, "unit": unit},
            "alternatives": [],
            "count": 0
        }

    orig_nut_raw = find_best_nutrition(food_clean)
    orig_nut = extract_nutrition_profile(orig_nut_raw)
    orig_price_per_kg = MARKET_PRICES.get(norm)
    orig_total_cost = round(orig_price_per_kg * quantity, 1) if orig_price_per_kg is not None else None

    # Retrieve price risk
    price_risk_val = "Unknown"
    try:
        risk = get_food_risk(food_clean)
        if risk and "Price_Risk" in risk:
            price_risk_val = risk["Price_Risk"]
    except Exception:
        pass

    pref_weights = {
        "balanced":   {"nut": 0.40, "price": 0.35, "cook": 0.15, "avail": 0.10},
        "nutrition":  {"nut": 0.60, "price": 0.20, "cook": 0.10, "avail": 0.10},
        "price":      {"nut": 0.20, "price": 0.55, "cook": 0.15, "avail": 0.10},
        "cooking":    {"nut": 0.20, "price": 0.20, "cook": 0.50, "avail": 0.10}
    }
    w = pref_weights.get(preference.lower(), pref_weights["balanced"])
    avail_map = {"High": 1.0, "Medium": 0.6, "Low": 0.3}

    grouped = matches.groupby("Alternative", as_index=False).first()
    results = []

    for _, r in grouped.iterrows():
        alt_name = str(r["Alternative"]).strip()
        alt_norm = alt_name.lower()
        sub_ratio = float(r.get("Substitution_Ratio", 0.5))
        rec_qty = round(quantity * sub_ratio, 2)

        alt_nut_raw = find_best_nutrition(alt_name)
        alt_nut = extract_nutrition_profile(alt_nut_raw)

        actual_nut_sim = None
        if orig_nut and alt_nut:
            cols = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "calcium_mg", "iron_mg", "vitamin_c_mg"]
            sims = []
            for col in cols:
                v1 = orig_nut.get(col)
                v2 = alt_nut.get(col)
                if v1 is not None and v2 is not None:
                    mx = max(abs(v1), abs(v2))
                    if mx == 0:
                        sims.append(1.0)
                    else:
                        sims.append(max(0.0, min(1.0, 1.0 - (abs(v1 - v2) / mx))))
            if sims:
                actual_nut_sim = round(sum(sims) / len(sims), 3)

        nut_sim_used = actual_nut_sim if actual_nut_sim is not None else float(r.get("Nutrition_Similarity", 0.7))
        cook_sim = float(r.get("Cooking_Similarity", 0.7))
        price_suit = float(r.get("Price_Suitability", 0.7))
        avail_str = str(r.get("Availability", "High")).strip()
        avail_score = avail_map.get(avail_str, 0.7)

        score_val = (
            w["nut"] * nut_sim_used +
            w["price"] * price_suit +
            w["cook"] * cook_sim +
            w["avail"] * avail_score
        )
        match_score = round(score_val * 100, 1)

        # Price & Savings calculation
        alt_price_per_kg = MARKET_PRICES.get(alt_norm)
        if orig_total_cost is not None and alt_price_per_kg is not None:
            alt_total_cost = round(alt_price_per_kg * rec_qty, 1)
            savings = round(orig_total_cost - alt_total_cost, 1)
            savings_pct = round((savings / orig_total_cost) * 100, 1) if orig_total_cost > 0 else 0.0
        else:
            alt_total_cost = None
            savings = None
            savings_pct = None

        # Explainability
        reasons = []
        if nut_sim_used >= 0.70:
            reasons.append(f"High nutrient similarity ({int(nut_sim_used*100)}%) with comparable macronutrient profile")
        elif nut_sim_used >= 0.50:
            reasons.append(f"Moderate nutritional alignment ({int(nut_sim_used*100)}%)")

        food_role = str(r.get("Food_Role", "Vegetable"))
        cuisine = str(r.get("Cuisine", "Indian"))
        reasons.append(f"Compatible cooking role ({food_role}) in {cuisine} recipes with {sub_ratio}x ratio")

        if savings is not None and savings > 0:
            reasons.append(f"Estimated savings of Rs. {savings:.1f} ({savings_pct}% lower cost for {rec_qty} {unit})")
        elif price_suit >= 0.70:
            reasons.append(f"Favorable market price suitability index ({int(price_suit*100)}%)")

        if avail_str == "High":
            reasons.append("High availability across APMC mandis nationwide")
        elif avail_str == "Medium":
            reasons.append("Moderate seasonal market availability")

        results.append({
            "alternative": alt_name,
            "foodRole": food_role,
            "cuisine": cuisine,
            "substitutionRatio": sub_ratio,
            "recommendedQuantity": rec_qty,
            "unit": unit,
            "nutritionSimilarity": round(nut_sim_used * 100, 1),
            "cookingSimilarity": round(cook_sim * 100, 1),
            "priceSuitability": round(price_suit * 100, 1),
            "availability": avail_str,
            "matchScore": match_score,
            "alternativePricePerKg": alt_price_per_kg,
            "alternativeTotalCost": alt_total_cost,
            "estimatedSavings": savings,
            "savingsPercent": savings_pct,
            "nutrition": alt_nut,
            "whyRecommended": reasons
        })

    results.sort(key=lambda x: x["matchScore"], reverse=True)

    return {
        "success": True,
        "originalFood": {
            "name": food_clean,
            "quantity": quantity,
            "unit": unit,
            "pricePerKg": orig_price_per_kg,
            "totalCost": orig_total_cost,
            "priceRisk": price_risk_val,
            "nutrition": orig_nut
        },
        "preference": preference,
        "count": len(results),
        "alternatives": results[:top_n]
    }

if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="AGRI-SWAP Agricultural Food Substitution Service")
    parser.add_argument("userIdPositional", nargs="?", default=None, help="User ID for basket recommendations")
    parser.add_argument("--userId", type=str, default=None, help="User ID for basket recommendations")
    parser.add_argument("--food", type=str, default=None, help="Target food to substitute")
    parser.add_argument("--quantity", type=float, default=1.0, help="Consumption quantity")
    parser.add_argument("--unit", type=str, default="kg", help="Measurement unit (e.g. kg)")
    parser.add_argument("--preference", type=str, default="balanced", help="User priority: balanced, nutrition, price, cooking")
    parser.add_argument("--list-foods", action="store_true", help="List all distinct foods available for substitution")
    parser.add_argument("--top_n", type=int, default=10, help="Top N alternatives")
    parser.add_argument("--rebuild-nutrition", action="store_true", help="Rebuild persistent SQLite nutrition store from raw USDA CSV")

    args = parser.parse_args()

    if args.rebuild_nutrition:
        from ML.food_substitution.nutrition_store import init_nutrition_database
        init_nutrition_database(force_rebuild=True)
        print(json.dumps({"success": True, "message": "Nutrition database rebuilt successfully"}))
        sys.exit(0)

    if args.list_foods:
        print(json.dumps(get_available_substitution_foods()))
        sys.exit(0)

    if args.food:
        res = get_single_food_substitutions(
            args.food,
            quantity=args.quantity,
            unit=args.unit,
            preference=args.preference,
            top_n=args.top_n
        )
        print(json.dumps(res))
        sys.exit(0)

    user_id = args.userId or args.userIdPositional or "U001"
    final_recommendations = generate_final_recommendations(user_id, top_n=3)

    output_columns = [
        "Food",
        "Alternative",
        "Original_Quantity",
        "Recommended_Quantity",
        "Unit",
        "Substitution_Ratio",
        "Nutrition_Similarity_Used",
        "Price_Suitability",
        "Availability",
        "Price_Risk",
        "Final_Score"
    ]

    if not final_recommendations.empty:
        output_data = final_recommendations[output_columns].copy()
        output_data = output_data.astype(object).where(output_data.notna(), None)
        rec_list = output_data.to_dict(orient="records")
    else:
        rec_list = []

    print(json.dumps({
        "success": True,
        "userId": user_id,
        "recommendations": rec_list
    }))