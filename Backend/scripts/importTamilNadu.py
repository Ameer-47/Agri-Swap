import os
from datetime import datetime
import pyarrow.dataset as ds
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

file_path = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "Datasets",
    "Agricultural Market Price Dataset",
    "feature_engineered_dataset",
    "tomato.parquet"
)

dataset = ds.dataset(file_path, format="parquet")

table = dataset.to_table(
    filter=ds.field("State") == "Tamil Nadu"
)

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

print("1000 Tamil Nadu tomato records imported successfully")

client.close()