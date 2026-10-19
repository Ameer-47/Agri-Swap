import pyarrow.dataset as ds

dataset = ds.dataset(
    "../Datasets/Agricultural Market Price Dataset/cleaned_dataset",
    format="parquet"
)

matched_commodities = [
    "Apple",
    "Banana",
    "Banana - Green",
    "Beetroot",
    "Capsicum",
    "Cabbage",
    "Carrot",
    "Cauliflower",
    "Green Chilli",
    "Maize",
    "Brinjal",
    "Garlic",
    "Ginger (Green)",
    "Grapes",
    "Lemon",
    "Mango",
    "Onion",
    "Orange",
    "Pear (Marasebu)",
    "Green Peas",
    "Peas Wet",
    "Pineapple",
    "Pomegranate",
    "Potato",
    "Soyabean",
    "Spinach",
    "Sweet Potato",
    "Tomato",
    "Turnip"
]

total = dataset.count_rows(
    filter=ds.field("Commodity").isin(matched_commodities)
)

states = dataset.to_table(
    columns=["State"],
    filter=ds.field("Commodity").isin(matched_commodities)
)["State"].unique()

print("Matched market records:", total)
print("States available:", len(states))

for state in sorted(states.to_pylist()):
    print(state)