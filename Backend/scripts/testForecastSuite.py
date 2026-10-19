import urllib.request
import json
import time

def run_suite():
    commodities = ["Tomato", "Onion", "Potato", "Rice", "Wheat"]
    horizons = [7, 30]

    print("=================================================================")
    print("      AGRI-SWAP PREDICTION & PERSISTENCE VERIFICATION SUITE      ")
    print("=================================================================\n")

    print("--- 1. Testing Direct Backend Forecasts (Port 5000) ---")
    for c in commodities:
        for h in horizons:
            t0 = time.time()
            url = f"http://127.0.0.1:5000/api/prices/predict?commodity={c}&horizon={h}"
            try:
                with urllib.request.urlopen(url) as res:
                    elapsed = round((time.time() - t0) * 1000, 2)
                    data = json.loads(res.read().decode())
                    status = res.status
                    success = data.get("success", False)
                    price = data.get("predictedPrice")
                    from_db = data.get("fromPersistentStorage", False)
                    preds = len(data.get("predicted7d" if h == 7 else "predicted30d", []))
                    print(f"  [{status}] {c:8} ({h:2}d) in {elapsed:6.2f}ms | Success: {success} | PredPrice: Rs.{price} | Points: {preds} | fromDB: {from_db}")
            except Exception as e:
                print(f"  [FAIL] {c:8} ({h:2}d) -> {e}")

    print("\n--- 2. Testing Frontend Proxy Forecasts (Port 5173 -> 5000) ---")
    for c in commodities:
        for h in horizons:
            t0 = time.time()
            url = f"http://localhost:5173/api/prices/predict?commodity={c}&horizon={h}"
            try:
                with urllib.request.urlopen(url) as res:
                    elapsed = round((time.time() - t0) * 1000, 2)
                    data = json.loads(res.read().decode())
                    status = res.status
                    success = data.get("success", False)
                    price = data.get("predictedPrice")
                    print(f"  [{status}] Proxy {c:8} ({h:2}d) in {elapsed:6.2f}ms | Success: {success} | PredPrice: Rs.{price}")
            except Exception as e:
                print(f"  [FAIL] Proxy {c:8} ({h:2}d) -> {e}")

    print("\n--- 3. Testing Historical Market Data & Timelines ---")
    try:
        t0 = time.time()
        with urllib.request.urlopen("http://127.0.0.1:5000/api/prices/historical?commodity=Tomato&dateRange=30d&limit=5") as res:
            dt = round((time.time() - t0) * 1000, 2)
            d = json.loads(res.read().decode())
            print(f"  Historical Table in {dt}ms -> Status: {res.status}, Total Matches: {d.get('total')}, Rows Returned: {len(d.get('records', []))}")
    except Exception as e:
        print(f"  Historical Table FAIL: {e}")

    try:
        t0 = time.time()
        with urllib.request.urlopen("http://127.0.0.1:5000/api/prices/timeline?commodity=Tomato&dateRange=30d") as res:
            dt = round((time.time() - t0) * 1000, 2)
            d = json.loads(res.read().decode())
            print(f"  Historical Timeline in {dt}ms -> Status: {res.status}, Count: {d.get('count')}, CurrentPrice: Rs.{d.get('currentPrice')}")
    except Exception as e:
        print(f"  Historical Timeline FAIL: {e}")

    print("\n--- 4. Testing Unsupported Commodity Handling ---")
    try:
        with urllib.request.urlopen("http://127.0.0.1:5000/api/prices/predict?commodity=DragonFruit&horizon=7") as res:
            d = json.loads(res.read().decode())
            print(f"  Unsupported Commodity -> success: {d.get('success')}, supported: {d.get('supported')}, forecastAvailable: {d.get('forecastAvailable')}")
    except Exception as e:
        print(f"  Unsupported Commodity FAIL: {e}")

if __name__ == "__main__":
    run_suite()
