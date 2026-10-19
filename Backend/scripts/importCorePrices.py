import os
from datetime import datetime
import pyarrow.parquet as pq
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        ".env"
    )
)

client = MongoClient(os.getenv("MONGO_URI"))
collection = client["agri_swap"]["prices"]

base_path = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "Datasets",
    "Agricultural Market Price Dataset",
    "feature_engineered_dataset"
)

commodities = [
    "onion",
    "potato",
    "rice",
    "wheat",
    "maize",
    "bengal_gram",
    "mustard"
]

for commodity in commodities:
    existing = collection.count_documents({
        "commodity": commodity.replace("_", " ").title()
    })

    if existing >= 1000:
        print(commodity, "already imported")
        continue

    file_path = os.path.join(base_path, commodity + ".parquet")

    table = pq.read_table(file_path)
    df = table.slice(0, 1000).to_pandas()

    records = []

    for _, row in df.iterrows():
        records.append({
            "commodity": row["Commodity"],
            "state": row["State"],
            "district": row["District"],
            "market": row["Market"],
            "date": datetime.combine(
                row["Arrival_Date"],
                datetime.min.time()
            ),
            "modalPrice": float(row["Modal_Price"])
        })

    collection.insert_many(records)

    print(
        commodity,
        "->",
        len(records),
        "records imported"
    )

client.close()