import pyarrow.dataset as ds
import pyarrow.compute as pc

dataset = ds.dataset(
    "../Datasets/Agricultural Market Price Dataset/cleaned_dataset",
    format="parquet"
)

table = dataset.to_table(columns=["Commodity"])
unique_values = pc.unique(table["Commodity"]).to_pylist()

keywords = [
    "apple",
    "banana",
    "beetroot",
    "bell pepper",
    "capsicum",
    "cabbage",
    "carrot",
    "cauliflower",
    "chilli",
    "corn",
    "cucumber",
    "eggplant",
    "brinjal",
    "garlic",
    "ginger",
    "grape",
    "jalapeno",
    "kiwi",
    "lemon",
    "lettuce",
    "mango",
    "onion",
    "orange",
    "paprika",
    "pear",
    "peas",
    "pineapple",
    "pomegranate",
    "potato",
    "radish",
    "soybean",
    "soy beans",
    "spinach",
    "sweetcorn",
    "sweet potato",
    "tomato",
    "turnip",
    "watermelon"
]

for keyword in keywords:
    matches = [
        value for value in unique_values
        if value and keyword in value.lower()
    ]

    print("\n" + keyword + ":")
    
    if matches:
        for match in matches:
            print("  ", match)
    else:
        print("   No match")