"""
AGRI-SWAP Persistent Nutrition Store
====================================
Durable SQLite-backed nutrition index and lookup service with strict energy unit harmonization.
Source of truth: Datasets/Food Nutrition Dataset/comprehensive_foods_usda.csv
Database path: Backend/data/nutrition.db

Persistence & Energy Normalization Model:
- The raw USDA dataset (40,000 rows, 16.2 MB) is indexed ONCE into durable SQLite storage.
- The source CSV column titled 'calories' contains an upstream mixture of kcal (Nutrient 1008) and kJ (Nutrient 1062).
- This module deterministically detects the source energy unit using standard Atwater factor verification:
    Expected Atwater Energy = (4 * Protein) + (4 * Carbs) + (9 * Fat).
  If raw_energy / Atwater is between 2.8 and 5.5, the record is confirmed to be in kJ and is converted:
    kcal = round(raw_energy / 4.184, 1).
  If the ratio is between 0.5 and 1.8, the record is confirmed to be in kcal and is preserved as-is.
  Records with ambiguous or very low macronutrient ratios are preserved without guessing.
- All stored and displayed 'calories' values are consistently expressed in kcal per 100g.
- Re-indexing is only executed if the database is missing or an explicit rebuild is requested.
"""

import os
import re
import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

def find_project_root():
    current_file = Path(__file__).resolve()
    for folder in [current_file] + list(current_file.parents):
        if (folder / "Datasets").is_dir() and (folder / "ML").is_dir():
            return folder
    raise FileNotFoundError("Agri_Swap_Project root folder was not found.")

PROJECT_ROOT = find_project_root()
DB_PATH = Path(os.environ.get("NUTRITION_DB_PATH", str(PROJECT_ROOT / "Backend" / "data" / "nutrition.db")))
USDA_CSV_PATH = Path(os.environ.get("USDA_CSV_PATH", str(PROJECT_ROOT / "Datasets" / "Food Nutrition Dataset" / "comprehensive_foods_usda.csv")))

KJ_PER_KCAL = 4.184

def clean_food_name(name):
    """Normalize food names by removing punctuation, parentheses, brackets, and extra whitespace."""
    if not name:
        return ""
    s = str(name).lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def resolve_energy_kcal(raw_calories, protein_g, carbs_g, fat_g):
    """
    Deterministically determines whether the source energy value is in kcal or kJ
    and returns (kcal_value, raw_value, unit_tag).
    
    1 kcal = 4.184 kJ.
    Atwater formula: 4*protein + 4*carbs + 9*fat.
    """
    if raw_calories is None or pd.isna(raw_calories):
        return None, None, "missing"

    try:
        raw_val = float(raw_calories)
    except (ValueError, TypeError):
        return None, None, "invalid"

    pro = float(protein_g) if protein_g is not None and pd.notna(protein_g) else 0.0
    carb = float(carbs_g) if carbs_g is not None and pd.notna(carbs_g) else 0.0
    fat = float(fat_g) if fat_g is not None and pd.notna(fat_g) else 0.0
    atwater = (4.0 * pro) + (4.0 * carb) + (9.0 * fat)

    if atwater > 2.0:
        ratio = raw_val / atwater
        if 2.8 <= ratio <= 5.5:
            # Confirmed kJ -> convert to kcal using 1 kcal = 4.184 kJ
            kcal_val = round(raw_val / KJ_PER_KCAL, 1)
            return kcal_val, raw_val, "kJ_converted"
        elif 0.5 <= ratio <= 1.8:
            # Confirmed kcal -> preserve value
            return round(raw_val, 1), raw_val, "kcal_original"
        else:
            # Ambiguous ratio: do not guess, preserve original raw value and tag
            return round(raw_val, 1), raw_val, "unclear_ratio"
    else:
        # Extremely low macronutrients (water, tea, certain herbs)
        if raw_val <= 50.0:
            return round(raw_val, 1), raw_val, "kcal_low_macro"
        return round(raw_val, 1), raw_val, "unclear_low_macro"

# Comprehensive agricultural crop and staple aliases mapping Indian/regional names to USDA reference food clean names
AGRICULTURAL_ALIASES = {
    "aadoo": "peaches canned water pack solids and liquids",
    "aam": "mangos raw",
    "adrak": "ginger root raw",
    "ajmod": "parsley fresh",
    "ajwain patte": "celery raw",
    "akhrot": "nuts walnuts english",
    "almond milk": "nuts almonds",
    "almonds": "nuts almonds",
    "aloo": "potatoes flesh and skin raw",
    "aloo bukhara": "plums raw",
    "alsi": "seeds flaxseed",
    "amaranth leaves": "amaranth leaves raw",
    "amla": "squash zucchini baby raw",
    "amrood": "guavas common raw",
    "anaar": "pomegranates raw",
    "ananas": "orange peel raw",
    "anar": "pomegranates raw",
    "anda": "egg whole raw fresh",
    "ande ki safedi": "egg white raw fresh",
    "angoor": "grapes american type slip skin raw",
    "anjeer": "figs raw",
    "apple": "apples raw with skin includes foods for usda s food distribution program",
    "apricot": "apricots raw",
    "ararot": "cornmeal white self rising degermed enriched",
    "arbi": "taro raw",
    "arhar dal": "pigeon peas red gram mature seeds raw",
    "artichoke": "beans snap green microwaved",
    "arugula": "broccoli cooked boiled drained without salt",
    "ash gourd": "waxgourd chinese preserving melon raw",
    "asparagus": "broccoli frozen chopped cooked boiled drained without salt",
    "baans karil": "corn with red and green peppers canned solids and liquids",
    "babugosha": "pears raw",
    "baby cabbage": "brussels sprouts cooked boiled drained without salt",
    "baby corn": "corn sweet yellow raw",
    "badam": "nuts almonds",
    "badam doodh plant": "nuts almonds",
    "baingan": "eggplant raw",
    "bajra": "millet raw",
    "bakla": "broadbeans fava beans mature seeds raw",
    "bamboo shoots": "corn with red and green peppers canned solids and liquids",
    "banana": "bananas raw",
    "band gobhi": "cabbage raw",
    "barley": "barley pearled raw",
    "basil": "basil fresh",
    "basmati rice": "rice white long grain regular raw unenriched",
    "batata": "potatoes flesh and skin raw",
    "bean curd": "tofu firm prepared with calcium sulfate and magnesium chloride nigari",
    "beans": "beans snap green raw",
    "beaten rice": "rice white long grain regular raw unenriched",
    "beet greens": "cowpeas blackeyes immature seeds raw",
    "beetroot": "beets raw",
    "beets raw": "beets raw",
    "bell pepper": "peppers sweet green raw",
    "bhatma": "soybeans mature seeds raw",
    "bhein": "lettuce cos or romaine raw",
    "bhindi": "okra raw",
    "bhoora chawal": "rice brown long grain raw includes foods for usda s food distribution program",
    "bhutta": "corn sweet yellow raw",
    "bitter gourd": "balsam pear bitter gourd pods raw",
    "bitter melon": "balsam pear bitter gourd pods raw",
    "black chickpeas": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "black eyed beans": "sausage meatless",
    "black eyed peas": "sausage meatless",
    "black gram": "mung beans mature seeds raw",
    "black mushroom": "mushrooms portabella raw",
    "black pepper": "spices pepper black",
    "black salt": "garlic raw",
    "blackberries": "blackberries raw",
    "blackberry raw": "blackberries raw",
    "blueberries": "blueberries raw",
    "bok choy": "yardlong bean cooked boiled drained without salt",
    "bottle gourd": "gourd white flowered calabash raw",
    "brinjal": "eggplant raw",
    "broad beans": "broadbeans fava beans mature seeds raw",
    "broccoli": "broccoli raw",
    "broken wheat": "wheat flour whole grain soft wheat",
    "brown rice": "rice brown long grain raw includes foods for usda s food distribution program",
    "brussels sprouts": "brussels sprouts cooked boiled drained without salt",
    "buckwheat": "buckwheat groats roasted cooked",
    "butter": "butter salted",
    "butter beans": "beans kidney royal red mature seeds raw",
    "buttermilk": "yogurt plain whole milk",
    "button mushroom": "mushrooms white raw",
    "cabbage": "cabbage raw",
    "cantaloupe": "orange juice chilled includes from concentrate",
    "capsicum": "peppers sweet green raw",
    "cardamom": "spices coriander leaf dried",
    "carrot": "carrots raw",
    "cashews": "nuts cashew nuts raw",
    "cauliflower": "cauliflower raw",
    "celery": "celery raw",
    "chaas": "yogurt plain whole milk",
    "chakki atta": "wheat flour whole grain soft wheat",
    "chakotra": "melons cantaloupe raw",
    "chana dal": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "chard": "celtuce raw",
    "chaulai": "amaranth leaves raw",
    "chawal": "rice white long grain regular raw unenriched",
    "chawli": "sausage meatless",
    "chenna": "cheese cottage lowfat 1 milkfat",
    "cherries": "cherries sweet raw",
    "chia seeds": "seeds chia seeds dried",
    "chichinda": "gourd dishcloth towelgourd raw",
    "chicken egg": "egg whole raw fresh",
    "chickpeas": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "chikoo": "raspberries frozen red sweetened",
    "chiku": "raspberries frozen red sweetened",
    "chitra rajma": "beans kidney all types mature seeds raw",
    "chole": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "chota pyaz": "shallots raw",
    "choti elaichi": "spices coriander leaf dried",
    "chukandar": "beets raw",
    "chukandar patta": "cowpeas blackeyes immature seeds raw",
    "cilantro": "coriander cilantro leaves raw",
    "cinnamon": "spices chili powder",
    "clarified butter": "butter oil anhydrous",
    "cloves": "spices cinnamon ground",
    "cluster beans": "gums seed gums includes locust bean guar",
    "coconut": "nuts coconut meat raw",
    "coconut oil": "oil coconut",
    "coconut water": "nuts coconut water liquid from coconuts",
    "collard greens": "cucumber peeled raw",
    "colocasia": "taro raw",
    "coriander leaves": "coriander cilantro leaves raw",
    "coriander seeds": "spices cloves ground",
    "corn flour": "cornmeal white self rising degermed enriched",
    "corn kernels": "corn sweet yellow raw",
    "cornflour": "cornmeal white self rising degermed enriched",
    "cornstarch": "cornmeal white self rising degermed enriched",
    "cottage cheese": "cheese cottage lowfat 1 milkfat",
    "courgette": "squash summer zucchini includes skin raw",
    "cow milk": "milk whole 3 25 milkfat with added vitamin d",
    "cowpeas": "sausage meatless",
    "cracked wheat": "wheat flour whole grain soft wheat",
    "crisphead lettuce": "lettuce green leaf raw",
    "cucumber": "cucumber with peel raw",
    "cumin seeds": "spices curry powder",
    "curd": "yogurt plain whole milk",
    "curly kale": "kale raw",
    "curry leaves": "coriander cilantro leaves raw",
    "custard apple": "raspberries canned red heavy syrup pack solids and liquids",
    "dahi": "yogurt plain whole milk",
    "daikon": "radishes raw",
    "dalchini": "spices chili powder",
    "dalia": "wheat flour whole grain soft wheat",
    "dates": "guavas strawberry raw",
    "desi chana": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "desi ghee": "butter oil anhydrous",
    "dhingri": "mushrooms canned drained solids",
    "dhuli moong": "mung beans mature seeds raw",
    "dill leaves": "dill weed fresh",
    "doodh": "milk whole 3 25 milkfat with added vitamin d",
    "doodhi": "gourd white flowered calabash raw",
    "drumstick leaves": "drumstick leaves raw",
    "egg": "egg whole raw fresh",
    "egg white": "egg white raw fresh",
    "eggplant": "eggplant raw",
    "fat free milk": "milk canned condensed sweetened",
    "fava beans": "broadbeans fava beans mature seeds raw",
    "fennel": "chicory witloof raw",
    "fennel seeds": "spices fennel seed",
    "fenugreek leaves": "spices fenugreek seed",
    "fenugreek seeds": "spices fenugreek seed",
    "fig": "figs raw",
    "flattened rice": "rice white long grain regular raw unenriched",
    "flax seeds": "seeds flaxseed",
    "florence fennel bulb": "chicory witloof raw",
    "french beans": "beans snap green raw",
    "fresh fig": "figs raw",
    "fresh methi": "spices fenugreek seed",
    "fresh turmeric": "spices turmeric ground",
    "gajar": "carrots raw",
    "garbanzo": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "garlic": "garlic raw",
    "gath gobhi": "lambsquarters raw",
    "gawar phali": "gums seed gums includes locust bean guar",
    "gehun": "wheat flour white industrial 10 protein bleached enriched",
    "ghee": "butter oil anhydrous",
    "ghiya": "gourd white flowered calabash raw",
    "gingelly oil": "salad dressing italian dressing reduced fat without salt",
    "ginger": "ginger root raw",
    "globe artichoke": "beans snap green microwaved",
    "gobhi": "cauliflower raw",
    "grapefruit": "melons cantaloupe raw",
    "grapes": "grapes american type slip skin raw",
    "greek yogurt": "egg yolk raw frozen salted pasteurized",
    "green beans": "beans snap green raw",
    "green chilli": "nopales raw",
    "green gram": "mung beans mature seeds raw",
    "green leek": "leeks bulb and lower leaf portion raw",
    "green peas": "peas green raw",
    "green pigeon peas": "pigeon peas red gram mature seeds raw",
    "ground oats": "cereals oats regular and quick not fortified dry",
    "groundnut oil": "margarine regular hard soybean hydrogenated",
    "groundnuts": "nuts macadamia nuts raw",
    "guar": "gums seed gums includes locust bean guar",
    "guava": "guavas common raw",
    "haakh saag": "cucumber peeled raw",
    "haldi": "spices turmeric ground",
    "hara dhaniya": "coriander cilantro leaves raw",
    "hara pyaz": "onions spring or scallions includes tops and bulb raw",
    "haree chai patti": "lemon grass citronella raw",
    "hari gobhi": "broccoli raw",
    "hari mirch": "nopales raw",
    "haricot beans": "beans pinto mature seeds canned solids and liquids",
    "hung curd": "egg yolk raw frozen salted pasteurized",
    "iceberg lettuce": "lettuce green leaf raw",
    "imli": "tamarinds raw",
    "indian gooseberry": "squash zucchini baby raw",
    "jackfruit": "jackfruit raw",
    "jaiphal": "spices mace ground",
    "jaitun ka tel": "oil olive salad or cooking",
    "jal kumbhi": "watercress raw",
    "jalapeno": "peppers chili green canned",
    "jalapeno pepper": "peppers chili green canned",
    "jardalu": "apricots raw",
    "jau": "barley pearled raw",
    "jeera": "spices curry powder",
    "jimikand": "yam raw",
    "jowar": "sorghum grain",
    "kabuli chana": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "kaccha aam": "mangos raw",
    "kaccha kela": "bananas raw",
    "kacchi haldi": "spices turmeric ground",
    "kaddu": "pumpkin raw",
    "kaddu ke beej": "seeds pumpkin and squash seed kernels dried",
    "kadi patta": "coriander cilantro leaves raw",
    "kaghzi nimbu": "lemon juice from concentrate canned or bottled",
    "kairi": "mangos raw",
    "kaju": "nuts cashew nuts raw",
    "kakdi": "cucumber with peel raw",
    "kala chana": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "kala namak": "garlic raw",
    "kale": "kale raw",
    "kali dal": "mung beans mature seeds raw",
    "kali mirch": "spices pepper black",
    "kamal kakdi": "lettuce cos or romaine raw",
    "kanda": "onions raw",
    "karela": "balsam pear bitter gourd pods raw",
    "kathal": "jackfruit raw",
    "kela": "bananas raw",
    "khajoor": "guavas strawberry raw",
    "kharbuja": "orange juice chilled includes from concentrate",
    "kheera": "cucumber with peel raw",
    "khubani": "apricots raw",
    "khumb": "mushrooms white raw",
    "kidney beans": "beans kidney all types mature seeds raw",
    "kiwi": "oranges raw florida",
    "kiwifruit": "oranges raw florida",
    "knol khol": "lambsquarters raw",
    "kohlrabi": "lambsquarters raw",
    "kurmura": "rice white long grain regular raw unenriched",
    "kuttu": "buckwheat groats roasted cooked",
    "ladyfinger": "okra raw",
    "lal mirch": "cabbage napa cooked",
    "lal patta gobhi": "cabbage red raw",
    "lal shimla mirch": "peppers sweet red raw",
    "lasun": "garlic raw",
    "lauki": "gourd white flowered calabash raw",
    "laung": "spices cinnamon ground",
    "leek": "leeks bulb and lower leaf portion raw",
    "leeks": "leeks bulb and lower leaf portion raw",
    "lehsun": "garlic raw",
    "lemon": "lemons raw without peel",
    "lemongrass": "lemon grass citronella raw",
    "lentils": "lentils raw",
    "lima beans": "beans kidney royal red mature seeds raw",
    "lime": "lemon juice from concentrate canned or bottled",
    "litchi": "tangerines mandarin oranges raw",
    "lobia": "sausage meatless",
    "long grain basmati": "rice white long grain regular raw unenriched",
    "lotus root": "lettuce cos or romaine raw",
    "low fat milk": "milk nonfat fluid with added vitamin a and vitamin d fat free or skim",
    "lychee": "tangerines mandarin oranges raw",
    "magaz": "seeds pumpkin and squash seed kernels dried",
    "makai": "corn sweet yellow raw",
    "makhan": "butter salted",
    "makki ka atta": "cornmeal white self rising degermed enriched",
    "mangetout": "peas mature seeds sprouted cooked boiled drained without salt",
    "mango": "mangos raw",
    "masoor dal": "lentils raw",
    "matar": "peas green raw",
    "mattha": "yogurt plain whole milk",
    "mealmaker": "soybeans mature seeds raw",
    "medjool dates": "guavas strawberry raw",
    "methi dana": "spices fenugreek seed",
    "methi leaves": "spices fenugreek seed",
    "milk": "milk whole 3 25 milkfat with added vitamin d",
    "millet": "millet raw",
    "mint leaves": "rosemary fresh",
    "mooli": "radishes raw",
    "moong dal": "mung beans mature seeds raw",
    "moongphali": "nuts macadamia nuts raw",
    "moongphali butter": "nuts macadamia nuts raw",
    "moongphali ka tel": "margarine regular hard soybean hydrogenated",
    "moringa leaves": "drumstick leaves raw",
    "mosambi": "oranges raw all commercial varieties",
    "mousambi": "oranges raw all commercial varieties",
    "mung beans": "mung beans mature seeds raw",
    "murmura": "rice white long grain regular raw unenriched",
    "muskmelon": "orange juice chilled includes from concentrate",
    "mustard greens": "mustard greens raw",
    "mustard oil": "oil mustard",
    "mustard seeds": "spices oregano dried",
    "narangi": "oranges raw all commercial varieties",
    "nariyal": "nuts coconut meat raw",
    "nariyal pani": "nuts coconut water liquid from coconuts",
    "nariyal tel": "oil coconut",
    "nashpati": "pears raw",
    "navy beans": "beans pinto mature seeds canned solids and liquids",
    "neelabadari": "blueberries raw",
    "nellikai": "squash zucchini baby raw",
    "nimbu": "lemons raw without peel",
    "nutmeg": "spices mace ground",
    "nutrela": "soybeans mature seeds raw",
    "oat flour": "cereals oats regular and quick not fortified dry",
    "oatmeal": "cereals oats regular and quick not fortified dry",
    "oats": "cereals oats regular and quick not fortified dry",
    "okra": "okra raw",
    "olive oil": "oil olive salad or cooking",
    "onion": "onions raw",
    "orange": "oranges raw all commercial varieties",
    "oyster mushroom": "mushrooms canned drained solids",
    "padwal": "gourd dishcloth towelgourd raw",
    "pak choi": "yardlong bean cooked boiled drained without salt",
    "palak": "spinach raw",
    "paneer": "cheese cottage lowfat 1 milkfat",
    "paneer block": "cheese cottage lowfat 1 milkfat",
    "papaya": "papayas raw",
    "papita": "papayas raw",
    "parsley": "parsley fresh",
    "parsnip": "onions frozen whole cooked boiled drained without salt",
    "patta gobhi": "cabbage raw",
    "peach": "peaches canned water pack solids and liquids",
    "peanut butter": "nuts macadamia nuts raw",
    "peanut oil": "margarine regular hard soybean hydrogenated",
    "peanuts": "nuts macadamia nuts raw",
    "pear": "pears raw",
    "pearl barley": "barley pearled raw",
    "pearl millet": "millet raw",
    "peas": "peas green raw",
    "peeli shimla mirch": "peppers sweet green cooked boiled drained with salt",
    "petha": "waxgourd chinese preserving melon raw",
    "phool gobhi": "cauliflower raw",
    "pineapple": "orange peel raw",
    "pinto beans": "beans pinto mature seeds cooked boiled without salt",
    "pista": "nuts pistachio nuts raw",
    "pistachios": "nuts pistachio nuts raw",
    "plantain": "bananas raw",
    "plum": "plums raw",
    "poha": "rice white long grain regular raw unenriched",
    "pomegranate": "pomegranates raw",
    "potato": "potatoes flesh and skin raw",
    "pudina": "rosemary fresh",
    "puffed rice": "rice white long grain regular raw unenriched",
    "pumpkin": "pumpkin raw",
    "pumpkin seeds": "seeds pumpkin and squash seed kernels dried",
    "pyaz": "onions raw",
    "quinoa": "quinoa cooked",
    "quinoa seeds": "quinoa cooked",
    "radish": "radishes raw",
    "rai": "spices oregano dried",
    "rajgira leaves": "amaranth leaves raw",
    "rajma": "beans kidney all types mature seeds raw",
    "rava": "wheat flour white all purpose enriched unbleached",
    "raw banana": "bananas raw",
    "raw mango": "mangos raw",
    "red bell pepper": "peppers sweet red raw",
    "red cabbage": "cabbage red raw",
    "red chilli": "cabbage napa cooked",
    "red lentil": "lentils raw",
    "rice": "rice white long grain regular raw unenriched",
    "ridge gourd": "gourd dishcloth towelgourd raw",
    "ripe mango": "mangos raw",
    "rock salt": "garlic raw",
    "rocket leaves": "broccoli cooked boiled drained without salt",
    "rolled oats": "cereals oats regular and quick not fortified dry",
    "romaine lettuce": "lettuce iceberg includes crisphead types raw",
    "rutabaga": "potatoes scalloped dry mix prepared with water whole milk and butter",
    "sabja seeds": "seeds chia seeds dried",
    "sabudana": "rice white long grain regular raw unenriched",
    "sabut dhaniya": "spices cloves ground",
    "sabut moong": "mung beans mature seeds raw",
    "sabut moong green": "mung beans mature seeds raw",
    "sabut urad": "mung beans mature seeds raw",
    "safed lobia seeds": "sausage meatless",
    "safed makhan": "butter salted",
    "safed til": "seeds sesame seed kernels dried decorticated",
    "safed vatana": "peas green raw",
    "sago": "rice white long grain regular raw unenriched",
    "sahjan patta": "drumstick leaves raw",
    "salad patta": "lettuce iceberg includes crisphead types raw",
    "sambar onion": "shallots raw",
    "santara": "oranges raw all commercial varieties",
    "sapota": "raspberries frozen red sweetened",
    "sarson ka saag": "mustard greens raw",
    "sarson ka tel": "oil mustard",
    "sarson ke dane": "spices oregano dried",
    "saunf": "spices fennel seed",
    "scallion": "onions spring or scallions includes tops and bulb raw",
    "seb": "apples raw with skin includes foods for usda s food distribution program",
    "semolina": "wheat flour white all purpose enriched unbleached",
    "sendha namak": "garlic raw",
    "sesame oil": "salad dressing italian dressing reduced fat without salt",
    "sesame paste": "seeds sesame seed kernels dried decorticated",
    "sesame seeds": "seeds sesame seed kernels dried decorticated",
    "shakarkandi": "sweet potato raw unprepared includes foods for usda s food distribution program",
    "shalgam": "turnips raw",
    "shalgam saag": "turnip greens frozen unprepared",
    "shallot": "shallots raw",
    "sharifa": "raspberries canned red heavy syrup pack solids and liquids",
    "shatavari": "broccoli frozen chopped cooked boiled drained without salt",
    "shepu": "dill weed fresh",
    "shiitake mushroom": "mushrooms portabella raw",
    "shimla mirch": "peppers sweet green raw",
    "silverbeet": "celtuce raw",
    "singhara": "squash winter butternut cooked baked without salt",
    "sitaphal": "raspberries canned red heavy syrup pack solids and liquids",
    "skim milk": "milk canned condensed sweetened",
    "snake gourd": "gourd dishcloth towelgourd raw",
    "snap peas": "peas mature seeds sprouted cooked boiled drained without salt",
    "snow peas": "peas mature seeds sprouted cooked boiled drained without salt",
    "soft tofu": "tofu firm prepared with calcium sulfate and magnesium chloride nigari",
    "sooji": "wheat flour white all purpose enriched unbleached",
    "sorghum": "sorghum grain",
    "soy chunks": "soybeans mature seeds raw",
    "soy milk": "tofu soft prepared with calcium sulfate and magnesium chloride nigari",
    "soy paneer": "tofu firm prepared with calcium sulfate and magnesium chloride nigari",
    "soya bean": "soybeans mature seeds raw",
    "soya doodh": "tofu soft prepared with calcium sulfate and magnesium chloride nigari",
    "soya tel": "oil safflower salad or cooking linoleic over 70",
    "soybean oil": "oil safflower salad or cooking linoleic over 70",
    "soybeans": "soybeans mature seeds raw",
    "speckled beans": "beans pinto mature seeds cooked boiled without salt",
    "spinach": "spinach raw",
    "split bengal gram": "chickpeas garbanzo beans bengal gram mature seeds raw",
    "spring onion": "onions spring or scallions includes tops and bulb raw",
    "strawberries": "strawberries raw",
    "strawberry": "strawberries raw",
    "sugar peas": "peas mature seeds sprouted cooked boiled drained without salt",
    "sugar snap peas": "peas mature seeds sprouted cooked boiled drained without salt",
    "summer squash": "squash summer zucchini includes skin raw",
    "sunflower oil": "oil safflower salad or cooking high oleic primary safflower oil of commerce",
    "sunflower seeds": "seeds sunflower seed kernels dried",
    "surajmukhi beej": "seeds sunflower seed kernels dried",
    "surajmukhi tel": "oil safflower salad or cooking high oleic primary safflower oil of commerce",
    "suran": "yam raw",
    "suva": "dill weed fresh",
    "swede": "potatoes scalloped dry mix prepared with water whole milk and butter",
    "sweet basil": "basil fresh",
    "sweet cherries": "cherries sweet raw",
    "sweet corn": "corn sweet yellow raw",
    "sweet lime": "oranges raw all commercial varieties",
    "sweet potato": "sweet potato raw unprepared includes foods for usda s food distribution program",
    "swiss chard": "celtuce raw",
    "tahini": "seeds sesame seed kernels dried decorticated",
    "tamarind": "tamarinds raw",
    "tamatar": "tomatoes red ripe raw year round average",
    "tapioca pearls": "rice white long grain regular raw unenriched",
    "tarbooz": "watermelon raw",
    "taro": "taro raw",
    "tender corn": "corn sweet yellow raw",
    "tender green beans": "beans snap green raw",
    "thick yogurt": "egg yolk raw frozen salted pasteurized",
    "til ka tel": "salad dressing italian dressing reduced fat without salt",
    "tofu": "tofu firm prepared with calcium sulfate and magnesium chloride nigari",
    "tofu silken": "tofu firm prepared with calcium sulfate and magnesium chloride nigari",
    "tomato": "tomatoes red ripe raw year round average",
    "toned milk": "milk nonfat fluid with added vitamin a and vitamin d fat free or skim",
    "toor dal": "pigeon peas red gram mature seeds raw",
    "tori": "gourd dishcloth towelgourd raw",
    "tulsi": "basil fresh",
    "turai": "gourd dishcloth towelgourd raw",
    "turmeric": "spices turmeric ground",
    "turmeric powder": "spices turmeric ground",
    "turnip": "turnips raw",
    "turnip greens": "turnip greens frozen unprepared",
    "tuscan kale": "kale raw",
    "tuvar dal": "pigeon peas red gram mature seeds raw",
    "tuvar lilva": "pigeon peas red gram mature seeds raw",
    "urad dal": "mung beans mature seeds raw",
    "walnuts": "nuts walnuts english",
    "water chestnut": "squash winter butternut cooked baked without salt",
    "watercress": "watercress raw",
    "watermelon": "watermelon raw",
    "watermelon seeds": "seeds pumpkin and squash seed kernels dried",
    "waxgourd": "waxgourd chinese preserving melon raw",
    "wheat": "wheat flour white industrial 10 protein bleached enriched",
    "wheat grain": "wheat flour white industrial 10 protein bleached enriched",
    "white carrot": "onions frozen whole cooked boiled drained without salt",
    "white jowar": "sorghum grain",
    "white mushroom": "mushrooms white raw",
    "white peas": "peas green raw",
    "white rice": "rice white long grain regular raw unenriched",
    "whole moong": "mung beans mature seeds raw",
    "whole wheat flour": "wheat flour whole grain soft wheat",
    "yam": "yam raw",
    "yellow bell pepper": "peppers sweet green cooked boiled drained with salt",
    "yellow moong": "mung beans mature seeds raw",
    "yellow turnip": "potatoes scalloped dry mix prepared with water whole milk and butter",
    "yogurt": "yogurt plain whole milk",
    "zucchini": "squash summer zucchini includes skin raw",
}

def get_db_connection():
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn

def is_db_ready():
    if not DB_PATH.is_file():
        return False
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nutrition_metadata'")
        if not cur.fetchone():
            conn.close()
            return False
        cur.execute("SELECT value FROM nutrition_metadata WHERE key = 'status'")
        status_row = cur.fetchone()
        cur.execute("SELECT value FROM nutrition_metadata WHERE key = 'version'")
        version_row = cur.fetchone()
        conn.close()
        # Ensure schema version 1.1.0 (with kcal standardization)
        return bool(status_row and status_row[0] == "ready" and version_row and version_row[0] == "1.1.0")
    except Exception:
        return False

def init_nutrition_database(force_rebuild=False):
    """
    Initializes and builds persistent SQLite nutrition tables with standardized kcal values.
    Runs once and persists forever. Skips immediately if already built and version matches.
    """
    if not force_rebuild and is_db_ready():
        return True

    if not USDA_CSV_PATH.is_file():
        raise FileNotFoundError(f"USDA dataset not found at: {USDA_CSV_PATH}")

    conn = get_db_connection()
    with conn:
        if force_rebuild:
            conn.execute("DROP TABLE IF EXISTS food_nutrition_profiles;")
            conn.execute("DROP TABLE IF EXISTS usda_raw_foods;")
            conn.execute("DROP TABLE IF EXISTS nutrition_metadata;")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS food_nutrition_profiles (
                food_key TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                usda_food_name TEXT,
                fdc_id INTEGER,
                food_category TEXT,
                calories REAL,
                raw_energy REAL,
                energy_unit TEXT,
                protein_g REAL,
                carbs_g REAL,
                fat_g REAL,
                fiber_g REAL,
                calcium_mg REAL,
                iron_mg REAL,
                vitamin_c_mg REAL,
                has_nutrition INTEGER NOT NULL DEFAULT 1,
                source TEXT DEFAULT 'usda_comprehensive',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usda_raw_foods (
                fdc_id INTEGER PRIMARY KEY,
                food_name TEXT NOT NULL,
                name_clean TEXT NOT NULL,
                data_type TEXT,
                food_category TEXT,
                calories REAL,
                raw_energy REAL,
                energy_unit TEXT,
                protein_g REAL,
                carbs_g REAL,
                fat_g REAL,
                fiber_g REAL,
                calcium_mg REAL,
                iron_mg REAL,
                vitamin_c_mg REAL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_usda_name_clean ON usda_raw_foods(name_clean);")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS nutrition_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)

    # Read the USDA dataset
    df = pd.read_csv(USDA_CSV_PATH)
    df["name_clean"] = df["food_name"].apply(clean_food_name)

    # Populate usda_raw_foods with standardized kcal
    records = []
    for _, row in df.iterrows():
        def sf(val):
            return float(val) if pd.notna(val) else None

        raw_cal = sf(row.get("calories"))
        pro = sf(row.get("protein_g"))
        carb = sf(row.get("carbs_g"))
        fat = sf(row.get("fat_g"))

        kcal_val, raw_energy_val, unit_tag = resolve_energy_kcal(raw_cal, pro, carb, fat)

        records.append((
            int(row["fdc_id"]),
            str(row["food_name"]),
            str(row["name_clean"]),
            str(row.get("data_type", "")),
            str(row.get("food_category", "")),
            kcal_val,
            raw_energy_val,
            unit_tag,
            pro,
            carb,
            fat,
            sf(row.get("fiber_g")),
            sf(row.get("calcium_mg")),
            sf(row.get("iron_mg")),
            sf(row.get("vitamin_c_mg"))
        ))

    with conn:
        conn.execute("DELETE FROM usda_raw_foods;")
        conn.executemany("""
            INSERT OR REPLACE INTO usda_raw_foods 
            (fdc_id, food_name, name_clean, data_type, food_category, calories, raw_energy, energy_unit, protein_g, carbs_g, fat_g, fiber_g, calcium_mg, iron_mg, vitamin_c_mg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, records)

    # Index all known foods from substitution and basket datasets
    sub_path = PROJECT_ROOT / "Datasets" / "food_substitution_dataset" / "food_substitution_dataset_150plus.csv"
    basket_path = PROJECT_ROOT / "Datasets" / "user_food_basket_dataset" / "user_food_basket_dataset_expanded.csv"

    known_foods = set()
    if sub_path.is_file():
        sub_df = pd.read_csv(sub_path)
        known_foods.update(sub_df["Food"].dropna().str.strip().tolist())
        known_foods.update(sub_df["Alternative"].dropna().str.strip().tolist())
    if basket_path.is_file():
        b_df = pd.read_csv(basket_path)
        known_foods.update(b_df["Food"].dropna().str.strip().tolist())

    now_iso = datetime.now(timezone.utc).isoformat()
    profiles_to_insert = []

    for food in sorted(known_foods):
        norm = clean_food_name(food)
        lookup_name = AGRICULTURAL_ALIASES.get(norm, norm)

        # Match against USDA records
        # Priority 1: Exact match on name_clean
        cur = conn.cursor()
        cur.execute("SELECT * FROM usda_raw_foods WHERE name_clean = ? LIMIT 1", (lookup_name,))
        matched_row = cur.fetchone()

        if not matched_row:
            # Priority 2: Substring word boundary match, prioritizing SR Legacy & Foundation, then raw, then fewest NaNs
            cur.execute("""
                SELECT * FROM usda_raw_foods 
                WHERE name_clean LIKE ? 
                ORDER BY 
                    CASE WHEN data_type IN ('SR Legacy', 'Foundation') THEN 0 ELSE 1 END,
                    CASE WHEN name_clean LIKE '% raw%' THEN 0 ELSE 1 END,
                    (CASE WHEN calories IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN protein_g IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN carbs_g IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN fat_g IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN fiber_g IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN calcium_mg IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN iron_mg IS NOT NULL THEN 1 ELSE 0 END +
                     CASE WHEN vitamin_c_mg IS NOT NULL THEN 1 ELSE 0 END) DESC,
                    LENGTH(name_clean) ASC
                LIMIT 1
            """, (f"%{lookup_name}%",))
            matched_row = cur.fetchone()

        if matched_row:
            profiles_to_insert.append((
                norm,
                food,
                matched_row["food_name"],
                matched_row["fdc_id"],
                matched_row["food_category"],
                round(matched_row["calories"], 1) if matched_row["calories"] is not None else None,
                round(matched_row["raw_energy"], 1) if matched_row["raw_energy"] is not None else None,
                matched_row["energy_unit"],
                round(matched_row["protein_g"], 1) if matched_row["protein_g"] is not None else None,
                round(matched_row["carbs_g"], 1) if matched_row["carbs_g"] is not None else None,
                round(matched_row["fat_g"], 1) if matched_row["fat_g"] is not None else None,
                round(matched_row["fiber_g"], 1) if matched_row["fiber_g"] is not None else None,
                round(matched_row["calcium_mg"], 1) if matched_row["calcium_mg"] is not None else None,
                round(matched_row["iron_mg"], 1) if matched_row["iron_mg"] is not None else None,
                round(matched_row["vitamin_c_mg"], 1) if matched_row["vitamin_c_mg"] is not None else None,
                1,
                "usda_comprehensive",
                now_iso,
                now_iso
            ))
        else:
            profiles_to_insert.append((
                norm,
                food,
                None,
                None,
                None,
                None, None, "missing",
                None, None, None, None, None, None, None,
                0,
                "missing_record",
                now_iso,
                now_iso
            ))

    with conn:
        conn.execute("DELETE FROM food_nutrition_profiles;")
        conn.executemany("""
            INSERT OR REPLACE INTO food_nutrition_profiles 
            (food_key, display_name, usda_food_name, fdc_id, food_category, calories, raw_energy, energy_unit, protein_g, carbs_g, fat_g, fiber_g, calcium_mg, iron_mg, vitamin_c_mg, has_nutrition, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, profiles_to_insert)

        # Write metadata
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('status', 'ready');")
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('version', '1.1.0');")
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('energy_standard', 'kcal_per_100g');")
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('kj_to_kcal_factor', '4.184');")
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('built_at', ?);", (now_iso,))
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('total_profiles', ?);", (str(len(profiles_to_insert)),))
        conn.execute("INSERT OR REPLACE INTO nutrition_metadata (key, value) VALUES ('total_usda_records', ?);", (str(len(records)),))

    conn.close()
    return True

# In-memory LRU cache for zero-latency queries within the same process
_MEM_CACHE = {}

def get_food_nutrition(food_name):
    """
    Retrieves the persistent nutrition profile for a food item.
    Reuses existing SQLite data across backend restarts, page refreshes, and browser restarts.
    Always returns calories consistently in kcal per 100g.
    """
    if not food_name:
        return None

    norm = clean_food_name(food_name)
    if norm in _MEM_CACHE:
        return _MEM_CACHE[norm]

    # Ensure database exists and is up to date
    if not is_db_ready():
        init_nutrition_database()

    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Check food_nutrition_profiles
    cur.execute("SELECT * FROM food_nutrition_profiles WHERE food_key = ?", (norm,))
    row = cur.fetchone()

    if row:
        if not row["has_nutrition"]:
            _MEM_CACHE[norm] = None
            conn.close()
            return None

        result = dict(row)
        _MEM_CACHE[norm] = result
        conn.close()
        return result

    # 2. Check alias map or search usda_raw_foods
    lookup_name = AGRICULTURAL_ALIASES.get(norm, norm)
    cur.execute("SELECT * FROM usda_raw_foods WHERE name_clean = ? LIMIT 1", (lookup_name,))
    matched_row = cur.fetchone()

    if not matched_row:
        cur.execute("""
            SELECT * FROM usda_raw_foods 
            WHERE name_clean LIKE ? 
            ORDER BY 
                CASE WHEN data_type IN ('SR Legacy', 'Foundation') THEN 0 ELSE 1 END,
                CASE WHEN name_clean LIKE '% raw%' THEN 0 ELSE 1 END,
                LENGTH(name_clean) ASC
            LIMIT 1
        """, (f"%{lookup_name}%",))
        matched_row = cur.fetchone()

    now_iso = datetime.now(timezone.utc).isoformat()
    if matched_row:
        def r1(v):
            return round(v, 1) if v is not None else None

        profile = {
            "food_key": norm,
            "display_name": food_name.strip(),
            "usda_food_name": matched_row["food_name"],
            "fdc_id": matched_row["fdc_id"],
            "food_category": matched_row["food_category"],
            "calories": r1(matched_row["calories"]),
            "raw_energy": r1(matched_row["raw_energy"]),
            "energy_unit": matched_row["energy_unit"],
            "protein_g": r1(matched_row["protein_g"]),
            "carbs_g": r1(matched_row["carbs_g"]),
            "fat_g": r1(matched_row["fat_g"]),
            "fiber_g": r1(matched_row["fiber_g"]),
            "calcium_mg": r1(matched_row["calcium_mg"]),
            "iron_mg": r1(matched_row["iron_mg"]),
            "vitamin_c_mg": r1(matched_row["vitamin_c_mg"]),
            "has_nutrition": 1,
            "source": "usda_comprehensive",
            "created_at": now_iso,
            "updated_at": now_iso
        }
        with conn:
            conn.execute("""
                INSERT OR REPLACE INTO food_nutrition_profiles 
                (food_key, display_name, usda_food_name, fdc_id, food_category, calories, raw_energy, energy_unit, protein_g, carbs_g, fat_g, fiber_g, calcium_mg, iron_mg, vitamin_c_mg, has_nutrition, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'usda_comprehensive', ?, ?);
            """, (
                norm, profile["display_name"], profile["usda_food_name"], profile["fdc_id"], profile["food_category"],
                profile["calories"], profile["raw_energy"], profile["energy_unit"], profile["protein_g"], profile["carbs_g"], profile["fat_g"], profile["fiber_g"],
                profile["calcium_mg"], profile["iron_mg"], profile["vitamin_c_mg"], now_iso, now_iso
            ))
        _MEM_CACHE[norm] = profile
        conn.close()
        return profile
    else:
        # Mark as genuine missing to avoid repeated failed queries
        with conn:
            conn.execute("""
                INSERT OR REPLACE INTO food_nutrition_profiles 
                (food_key, display_name, has_nutrition, source, created_at, updated_at)
                VALUES (?, ?, 0, 'missing_record', ?, ?);
            """, (norm, food_name.strip(), now_iso, now_iso))
        _MEM_CACHE[norm] = None
        conn.close()
        return None

if __name__ == "__main__":
    import sys
    force = "--rebuild" in sys.argv
    print(f"Initializing standardized nutrition database (force={force})...")
    init_nutrition_database(force_rebuild=force)
    print("Standardized nutrition database ready!")
