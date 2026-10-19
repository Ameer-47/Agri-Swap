import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("Backend/.env")

client = MongoClient(os.getenv("MONGO_URI"))
collection = client["agri_swap"]["prices"]

seen = set()
duplicate_ids = []

records = collection.find()

for record in records:
    key = (
        record.get("commodity"),
        record.get("state"),
        record.get("district"),
        record.get("market"),
        record.get("date"),
        record.get("modalPrice")
    )

    if key in seen:
        duplicate_ids.append(record["_id"])
    else:
        seen.add(key)

if duplicate_ids:
    result = collection.delete_many({"_id": {"$in": duplicate_ids}})
    print("Duplicate records removed:", result.deleted_count)
else:
    print("No duplicate records found")

print("Remaining records:", collection.count_documents({}))

client.close()