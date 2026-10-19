import os
from datetime import datetime
import pyarrow.dataset as ds
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(".env")

client = MongoClient(os.getenv("MONGO_URI"))
collection = client["agri_swap"]["prices"]

file_path = os.path.join(
    "..",
    "Datasets",
    "Agricultural Market Price Dataset",
    "cleaned_dataset"
)

dataset = ds.dataset(file_path, format="parquet")

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

filter_condition = ds.field("Commodity").isin(matched_commodities)

records_by_group = {}

for batch in dataset.to_batches(
    columns=[
        "State",
        "District",
        "Market",
        "Commodity",
        "Arrival_Date",
        "Modal_Price"
    ],
    filter=filter_condition,
    batch_size=100000
):
    data = batch.to_pydict()

    for state, district, market, commodity, arrival_date, modal_price in zip(
        data["State"],
        data["District"],
        data["Market"],
        data["Commodity"],
        data["Arrival_Date"],
        data["Modal_Price"]
    ):
        if state is None or commodity is None or modal_price is None:
            continue

        group_key = (commodity, state)

        if group_key not in records_by_group:
            records_by_group[group_key] = []

        if len(records_by_group[group_key]) >= 100:
            continue

        records_by_group[group_key].append({
            "commodity": commodity,
            "state": state,
            "district": district,
            "market": market,
            "date": datetime.combine(
                arrival_date,
                datetime.min.time()
            ),
            "modalPrice": float(modal_price)
        })

print("Commodity-state groups found:", len(records_by_group))

for commodity in matched_commodities:
    collection.delete_many({
        "commodity": commodity
    })

all_records = []

for records in records_by_group.values():
    all_records.extend(records)

for i in range(0, len(all_records), 1000):
    collection.insert_many(all_records[i:i + 1000])

print("Records imported:", len(all_records))
print(
    "Commodity-state groups imported:",
    len(records_by_group)
)

client.close()