import pandas as pd
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(base_dir, "test_predictions.csv")

df = pd.read_csv(file_path)
df["Arrival_Date"] = pd.to_datetime(df["Arrival_Date"])

df["Price_Change_Percent"] = (
    (df["Predicted_Modal_Price"] - df["Actual_Modal_Price"])
    / df["Actual_Modal_Price"]
) * 100


def calculate_price_risk(price_change):
    if price_change < 10:
        return "Low"
    elif price_change < 25:
        return "Medium"
    else:
        return "High"


df["Price_Risk"] = df["Price_Change_Percent"].apply(calculate_price_risk)

output_file = os.path.join(base_dir, "price_risk_predictions.csv")
df.to_csv(output_file, index=False)


def get_food_risk(food_name):
    food_data = df[
        df["Commodity"].str.lower() == food_name.lower()
    ].copy()

    if food_data.empty:
        return None

    food_data["Arrival_Date"] = pd.to_datetime(food_data["Arrival_Date"])

    latest_record = food_data.sort_values(
        "Arrival_Date"
    ).iloc[-1]

    return {
        "Commodity": latest_record["Commodity"],
        "Actual_Price": latest_record["Actual_Modal_Price"],
        "Predicted_Price": latest_record["Predicted_Modal_Price"],
        "Price_Change_Percent": latest_record["Price_Change_Percent"],
        "Price_Risk": latest_record["Price_Risk"]
    }