import urllib.request
import json
import time

def test_url(url, desc):
    t0 = time.time()
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req) as res:
            elapsed = round((time.time() - t0) * 1000, 2)
            data = json.loads(res.read().decode())
            status = res.status
            success = data.get("success", True)
            from_db = data.get("fromPersistentStorage", "N/A")
            print(f"[{status}] {desc} in {elapsed}ms -> success: {success}, fromDB: {from_db}")
            return data
    except Exception as e:
        elapsed = round((time.time() - t0) * 1000, 2)
        print(f"[FAIL] {desc} in {elapsed}ms -> {e}")
        return None

def main():
    print("=== 1. TESTING BACKEND HEALTH & PERSISTENCE STATS ===")
    test_url("http://127.0.0.1:5000/api/health", "Health check")
    stats = test_url("http://127.0.0.1:5000/api/prices/cache-stats", "Cache stats")
    print(f"  Total Persistent Queries: {stats.get('totalPersistentQueries')}")
    print(f"  Auto-refresh Disabled: {stats.get('autoRefreshDisabled')}")

    print("\n=== 2. TESTING PERSISTED HISTORICAL PRICES & TIMELINES ===")
    t1 = test_url("http://127.0.0.1:5000/api/prices/historical?commodity=Tomato&dateRange=30d&page=1&limit=10", "Tomato 30d Table")
    print(f"  Tomato Total: {t1.get('total')}, Records: {len(t1.get('records', []))}, Sample: {t1.get('records', [{}])[0].get('market')}")

    tl1 = test_url("http://127.0.0.1:5000/api/prices/timeline?commodity=Tomato&dateRange=30d", "Tomato 30d Timeline")
    print(f"  Tomato Timeline: {tl1.get('count')} dates, Current: {tl1.get('currentPrice')}, Prev: {tl1.get('previousPrice')}")

    t2 = test_url("http://127.0.0.1:5000/api/prices/historical?commodity=Onion&state=Maharashtra&dateRange=14d&page=1&limit=10", "Onion Maharashtra 14d Table")
    print(f"  Onion MH Total: {t2.get('total')}")

    tl2 = test_url("http://127.0.0.1:5000/api/prices/timeline?commodity=Rice&state=Tamil%20Nadu&dateRange=30d", "Rice Tamil Nadu 30d Timeline")
    print(f"  Rice TN Timeline: {tl2.get('count')} dates")

    print("\n=== 3. TESTING SPEED OF REPEATED IDENTICAL QUERIES ===")
    t1_rep = test_url("http://127.0.0.1:5000/api/prices/historical?commodity=Tomato&dateRange=30d&page=1&limit=10", "Repeated Tomato 30d Table")
    tl1_rep = test_url("http://127.0.0.1:5000/api/prices/timeline?commodity=Tomato&dateRange=30d", "Repeated Tomato 30d Timeline")

    print("\n=== 4. TESTING LOCATIONS & COMMODITIES ===")
    loc = test_url("http://127.0.0.1:5000/api/prices/locations?state=Tamil%20Nadu", "Locations Tamil Nadu")
    print(f"  TN Districts: {len(loc.get('districts', []))}, Markets: {len(loc.get('markets', []))}")
    comm = test_url("http://127.0.0.1:5000/api/prices/commodities", "Commodities List")
    print(f"  Total Commodities: {comm.get('count')}")

    print("\n=== 5. TESTING GENUINELY EMPTY COMBINATIONS ===")
    empty_res = test_url("http://127.0.0.1:5000/api/prices/historical?commodity=NonExistentCrop123&dateRange=30d", "NonExistentCrop Table")
    print(f"  Empty query: total = {empty_res.get('total')}, records = {len(empty_res.get('records', []))}")

    print("\n=== 6. TESTING LSTM PREDICTION MODEL ===")
    pred = test_url("http://127.0.0.1:5000/api/prices/predict?commodity=Tomato&horizon=7", "Tomato LSTM 7d Prediction")
    print(f"  LSTM Success: {pred.get('success')}, Predictions Count: {len(pred.get('predictions', []))}")

if __name__ == "__main__":
    main()
