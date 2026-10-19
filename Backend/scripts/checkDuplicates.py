import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("Backend/.env")

client = MongoClient(os.getenv("MONGO_URI"))
collection = client["agri_swap"]["prices"]

pipeline = [
    {
        "$group": {
            "_id": {
                "commodity": "$commodity",
                "state": "$state",
                "district": "$district",
                "market": "$market",
                "date": "$date",
                "modalPrice": "$modalPrice"
            }
        }
    },
    {
        "$count": "unique_records"
    }
]

result = list(collection.aggregate(pipeline))

print(result)

client.close()