import os
import pyarrow.parquet as pq
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime

load_dotenv(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        ".env"
    )
)

MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI)
db = client["agri_swap"]
collection = db["prices"]

file_path = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "Datasets",
    "Agricultural Market Price Dataset",
    "feature_engineered_dataset",
    "tomato.parquet"
)

table = pq.read_table(file_path)
df = table.slice(0, 1000).to_pandas()

records = []

for _, row in df.iterrows():
    records.append({
        "commodity": row["Commodity"],
        "state": row["State"],
        "district": row["District"],
        "market": row["Market"],
       "date": datetime.combine(row["Arrival_Date"], datetime.min.time()),
        "modalPrice": float(row["Modal_Price"])
    })

collection.insert_many(records)

print("1000 tomato price records imported successfully")

client.close()