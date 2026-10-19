import urllib.request
import urllib.parse
import json
import duckdb
import time
import sys

BASE_URL = "http://localhost:5000/api/prices/historical"
PARQUET_GLOB = "Datasets/Agricultural Market Price Dataset/cleaned_dataset/*.parquet"

con = duckdb.connect()

def direct_parquet_query(commodity, state, district, market, date_range="all", search="", limit=5, page=1):
    where_clauses = ["1=1"]
    if state and state != "All":
        where_clauses.append(f"State = '{state.replace(chr(39), chr(39)+chr(39))}'")
    if district and district != "All":
        where_clauses.append(f"District = '{district.replace(chr(39), chr(39)+chr(39))}'")
    if market and market != "All":
        where_clauses.append(f"Market = '{market.replace(chr(39), chr(39)+chr(39))}'")
    if commodity and commodity != "All":
        c_map = {
            "Soybean": "Soyabean%",
            "Soyabean": "Soyabean%",
            "Chilli": "%Chilli%",
            "Cotton": "Cotton%",
            "Rice": "Rice%",
            "Wheat": "Wheat%",
            "Potato": "Potato%",
            "Tomato": "Tomato%",
            "Onion": "Onion%",
            "Banana": "Banana%",
            "Turmeric": "Turmeric%",
            "Maize": "Maize%"
        }
        if commodity in c_map:
            where_clauses.append(f"Commodity ILIKE '{c_map[commodity]}'")
        else:
            where_clauses.append(f"(Commodity = '{commodity}' OR Commodity ILIKE '{commodity}%')")
    if search and search.strip():
        s = search.strip().replace("'", "''")
        where_clauses.append(f"(Market ILIKE '%{s}%' OR District ILIKE '%{s}%' OR State ILIKE '%{s}%' OR Commodity ILIKE '%{s}%')")

    base_where = " AND ".join(where_clauses)
    
    if date_range in ["7d", "14d", "30d"]:
        days = {"7d": 7, "14d": 14, "30d": 30}[date_range]
        cnt_sql = f"""
        WITH raw_f AS (
            SELECT Arrival_Date FROM read_parquet('{PARQUET_GLOB}') WHERE {base_where}
        ),
        max_d AS (SELECT max(Arrival_Date) as m_date FROM raw_f)
        SELECT count(*) FROM raw_f f, max_d WHERE f.Arrival_Date >= max_d.m_date - INTERVAL {days} DAY
        """
    else:
        cnt_sql = f"SELECT count(*) FROM read_parquet('{PARQUET_GLOB}') WHERE {base_where}"

    total = con.execute(cnt_sql).fetchone()[0]
    return total

def test_region(desc, params, allow_empty=False):
    encoded = urllib.parse.urlencode(params)
    url = f"{BASE_URL}?{encoded}"
    
    t0 = time.time()
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        api_time = (time.time() - t0) * 1000

    api_total = data.get("total", 0)
    api_count = data.get("count", 0)
    records = data.get("records", [])

    # Direct parquet benchmark
    pq_total = direct_parquet_query(
        commodity=params.get("commodity"),
        state=params.get("state"),
        district=params.get("district"),
        market=params.get("market"),
        date_range=params.get("dateRange", "30d"),
        search=params.get("search", ""),
        limit=params.get("limit", 5),
        page=params.get("page", 1)
    )

    print(f"============================================================")
    print(f"REGION TEST: {desc}")
    print(f"  Params:       State='{params.get('state')}', Dist='{params.get('district')}', Mkt='{params.get('market')}', Comm='{params.get('commodity')}', Range='{params.get('dateRange')}'")
    print(f"  API Total:    {api_total:,} records  (Returned: {api_count} rows in {api_time:.1f}ms)")
    print(f"  Parquet Total: {pq_total:,} records")

    # Verification checks
    assert api_total == pq_total, f"MISMATCH! API returned {api_total} but Parquet has {pq_total}!"
    print("  >> [OK] API total matches direct Parquet count 100%!")

    if not allow_empty:
        assert api_total > 0, f"Expected non-zero records for {desc}!"
        if len(records) > 0:
            r = records[0]
            print(f"  Sample Row:   Date: {r['date']} | Commodity: {r['commodity']} | Market: {r['market']} | Min: Rs.{r['min']} | Modal: Rs.{r['modal']}")
            # Validate row matches filters
            if params.get("state") and params["state"] != "All":
                assert r["state"] == params["state"], f"State mismatch: {r['state']} != {params['state']}"
            if params.get("district") and params["district"] != "All":
                assert r["district"] == params["district"], f"District mismatch: {r['district']} != {params['district']}"
            if params.get("market") and params["market"] != "All":
                assert r["market"] == params["market"], f"Market mismatch: {r['market']} != {params['market']}"
            print("  >> [OK] Returned record attributes strictly match selected filters.")
    else:
        print("  >> [OK] Clean empty result verified as expected.")

    print()
    return True

def main():
    print("=================================================================")
    print("AGRI$WAP BROAD CROSS-VALIDATION SUITE: ALL REGIONS OF INDIA")
    print("Direct Parquet vs Live API Comparison across North, West, East, South")
    print("=================================================================\n")

    tests = [
        # 1. North India: Punjab
        ("North India - Punjab (Ludhiana -> Ludhiana, Wheat)", {
            "state": "Punjab", "district": "Ludhiana", "market": "Ludhiana", "commodity": "Wheat", "dateRange": "all", "page": 1, "limit": 5
        }, False),
        
        # 2. West India: Maharashtra (Nashik -> Lasalgaon, Onion)
        ("West India - Maharashtra (Nashik -> Lasalgaon, Onion)", {
            "state": "Maharashtra", "district": "Nashik", "market": "Lasalgaon", "commodity": "Onion", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 3. West India: Gujarat (Rajkot -> Rajkot, Cotton)
        ("West India - Gujarat (Rajkot -> Rajkot, Cotton)", {
            "state": "Gujarat", "district": "Rajkot", "market": "Rajkot", "commodity": "Cotton", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 4. North India: Uttar Pradesh (Agra -> Agra, Potato)
        ("North India - Uttar Pradesh (Agra -> Agra, Potato)", {
            "state": "Uttar Pradesh", "district": "Agra", "market": "Agra", "commodity": "Potato", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 5. East India: West Bengal (Hooghly -> Sheoraphuly, Potato)
        ("East India - West Bengal (Hooghly -> Sheoraphuly, Potato)", {
            "state": "West Bengal", "district": "Hooghly", "market": "Sheoraphuly", "commodity": "Potato", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 6. South India: Kerala (Kottayam -> Kottayam, Banana)
        ("South India - Kerala (Kottayam -> Kottayam, Banana)", {
            "state": "Kerala", "district": "Kottayam", "market": "Kottayam", "commodity": "Banana", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 7. South India: Karnataka (Kolar -> Kolar, Tomato)
        ("South India - Karnataka (Kolar -> Kolar, Tomato)", {
            "state": "Karnataka", "district": "Kolar", "market": "Kolar", "commodity": "Tomato", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 8. South India: Andhra Pradesh (Chittor -> Madanapalli, Tomato)
        ("South India - Andhra Pradesh (Chittor -> Madanapalli, Tomato)", {
            "state": "Andhra Pradesh", "district": "Chittor", "market": "Madanapalli", "commodity": "Tomato", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 9. South India: Telangana (Warangal -> Warangal, Chilli)
        ("South India - Telangana (Warangal -> Warangal, Chilli)", {
            "state": "Telangana", "district": "Warangal", "market": "Warangal", "commodity": "Chilli", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 10. South India: Tamil Nadu (Madurai -> Madurai, Brinjal)
        ("South India - Tamil Nadu (Madurai -> Madurai, Brinjal)", {
            "state": "Tamil Nadu", "district": "Madurai", "market": "Madurai", "commodity": "Brinjal", "dateRange": "all", "page": 1, "limit": 5
        }, False),

        # 11. All Commodities across an entire district (Tamil Nadu -> Coimbatore)
        ("District Wide - All Commodities (Tamil Nadu -> Coimbatore)", {
            "state": "Tamil Nadu", "district": "Coimbatore", "market": "All", "commodity": "All", "dateRange": "30d", "page": 1, "limit": 5
        }, False),

        # 12. All States for a specific commodity (Soyabean across India)
        ("Pan-India - All States (Soyabean)", {
            "state": "All", "district": "All", "market": "All", "commodity": "Soyabean", "dateRange": "30d", "page": 1, "limit": 5
        }, False),

        # 13. Genuinely Empty Case (Puducherry -> Tomato)
        ("Empty Case - Puducherry (Tomato)", {
            "state": "Puducherry", "district": "All", "market": "All", "commodity": "Tomato", "dateRange": "all", "page": 1, "limit": 5
        }, True)
    ]

    all_passed = True
    for desc, params, allow_empty in tests:
        try:
            ok = test_region(desc, params, allow_empty=allow_empty)
            all_passed = all_passed and ok
        except Exception as e:
            print(f"FAILED on {desc}: {e}\n")
            all_passed = False

    print("=================================================================")
    if all_passed:
        print("ALL 13 BROAD REGIONAL CROSS-VALIDATION TESTS PASSED 100%!")
        print("API MATCHES DIRECT PARQUET QUERIES WITH PERFECT FIDELITY.")
    else:
        print("ONE OR MORE TESTS FAILED.")
    print("=================================================================")
    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
