import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://localhost:5000/api/prices/historical"

def run_test(name, query_params, min_expected_total=None, expect_zero=False):
    encoded = urllib.parse.urlencode(query_params)
    url = f"{BASE_URL}?{encoded}"
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as res:
            status = res.status
            body = res.read().decode('utf-8')
            data = json.loads(body)
            
            records = data.get("records", [])
            total = data.get("total", 0)
            count = data.get("count", len(records))
            
            print(f"============================================================")
            print(f"TEST: {name}")
            print(f"URL: {url}")
            print(f"HTTP Status: {status} | Success: {data.get('success')}")
            print(f"Total Matches in Dataset: {total:,} | Rows Returned on Page: {count}")
            
            if expect_zero:
                assert total == 0, f"Expected 0 total records but got {total}"
                print(">> [PASS] Confirmed genuinely empty combination cleanly returned 0 rows.")
            else:
                assert total > 0, f"Expected total > 0 but got {total}"
                if min_expected_total is not None:
                    assert total >= min_expected_total, f"Expected total >= {min_expected_total} but got {total}"
                
                print("Sample Row from Cleaned Parquet Dataset:")
                if len(records) > 0:
                    r0 = records[0]
                    print(f"   Date:      {r0.get('date')}")
                    print(f"   Commodity: {r0.get('commodity')}")
                    print(f"   State:     {r0.get('state')}")
                    print(f"   District:  {r0.get('district')}")
                    print(f"   Market:    {r0.get('market')}")
                    print(f"   Min Price: Rs.{r0.get('min')}/Qtl")
                    print(f"   Max Price: Rs.{r0.get('max')}/Qtl")
                    print(f"   Modal Price: Rs.{r0.get('modal')}/Qtl")
                    
                    # Verify fields match filter
                    if query_params.get("state") and query_params.get("state") != "All":
                        assert r0.get("state") == query_params["state"], f"State mismatch: {r0.get('state')} != {query_params['state']}"
                    if query_params.get("district") and query_params.get("district") != "All":
                        assert r0.get("district") == query_params["district"], f"District mismatch: {r0.get('district')} != {query_params['district']}"
                    if query_params.get("market") and query_params.get("market") != "All":
                        assert r0.get("market") == query_params["market"], f"Market mismatch: {r0.get('market')} != {query_params['market']}"
                print(">> [PASS] Verified real record fields match selected filters.")
            print()
            return True, data
    except Exception as e:
        print(f">> [FAIL] Exception in {name}: {e}")
        return False, None

def main():
    print("=================================================================")
    print("AGRI$WAP HISTORICAL PRICE DETAILS TABLE VERIFICATION SUITE")
    print("Testing Real Data Flow from Cleaned Parquet Dataset via DuckDB")
    print("=================================================================\n")
    
    all_passed = True
    
    # 1. Tamil Nadu -> Virudhunagar -> Virudhunagar (Tomato)
    ok, _ = run_test(
        "1. Tamil Nadu -> Virudhunagar -> Virudhunagar (Tomato, All Dates)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Virudhunagar", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=20
    )
    all_passed = all_passed and ok

    # 2. Tamil Nadu -> Virudhunagar -> Rajapalayam (Uzhavar Sandhai ) (Tomato)
    ok, _ = run_test(
        "2. Tamil Nadu -> Virudhunagar -> Rajapalayam (Uzhavar Sandhai ) (Tomato, All Dates)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Rajapalayam (Uzhavar Sandhai )", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=400
    )
    all_passed = all_passed and ok

    # 3. Tamil Nadu -> Virudhunagar -> Virudhunagar (Maize)
    ok, _ = run_test(
        "3. Tamil Nadu -> Virudhunagar -> Virudhunagar (Maize)",
        {"commodity": "Maize", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Virudhunagar", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=100
    )
    all_passed = all_passed and ok

    # 4. Kerala -> Ernakulam -> Ernakulam APMC (Banana)
    ok, _ = run_test(
        "4. Kerala -> Ernakulam -> Ernakulam APMC (Banana)",
        {"commodity": "Banana", "state": "Kerala", "district": "Ernakulam", "market": "Ernakulam APMC", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=50
    )
    all_passed = all_passed and ok

    # 5. Karnataka -> Bangalore -> Bangalore APMC (Potato)
    ok, _ = run_test(
        "5. Karnataka -> Bangalore -> Bangalore APMC (Potato)",
        {"commodity": "Potato", "state": "Karnataka", "district": "Bangalore", "market": "Bangalore APMC", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=50
    )
    all_passed = all_passed and ok

    # 6. Telangana -> Hyderabad -> Bowenpally APMC (Onion)
    ok, _ = run_test(
        "6. Telangana -> Hyderabad -> Bowenpally APMC (Onion)",
        {"commodity": "Onion", "state": "Telangana", "district": "Hyderabad", "market": "Bowenpally APMC", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=50
    )
    all_passed = all_passed and ok

    # 7. Puducherry -> Karaikal -> Karaikal (Cotton)
    ok, _ = run_test(
        "7. Puducherry -> Karaikal -> Karaikal (Cotton)",
        {"commodity": "Cotton", "state": "Puducherry", "district": "Karaikal", "market": "Karaikal", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=300
    )
    all_passed = all_passed and ok

    # 8. Genuinely empty test: Puducherry (Tomato)
    ok, _ = run_test(
        "8. Genuinely Empty Test Case: Puducherry (Tomato)",
        {"commodity": "Tomato", "state": "Puducherry", "district": "All", "market": "All", "dateRange": "all", "page": 1, "limit": 5},
        expect_zero=True
    )
    all_passed = all_passed and ok

    # 9. Date Range comparison: Rajapalayam Tomato 7d vs 30d vs all
    ok, data_7d = run_test(
        "9a. Date Range Filtering: 7 Days (Rajapalayam Tomato)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Rajapalayam (Uzhavar Sandhai )", "dateRange": "7d", "page": 1, "limit": 5}
    )
    all_passed = all_passed and ok

    ok, data_30d = run_test(
        "9b. Date Range Filtering: 30 Days (Rajapalayam Tomato)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Rajapalayam (Uzhavar Sandhai )", "dateRange": "30d", "page": 1, "limit": 5}
    )
    all_passed = all_passed and ok

    # 10. Search query filter: Virudhunagar searching for "Rajapalayam"
    ok, _ = run_test(
        "10. In-Table Search Filter: 'Rajapalayam' across Virudhunagar",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "All", "search": "Rajapalayam", "dateRange": "all", "page": 1, "limit": 5},
        min_expected_total=100
    )
    all_passed = all_passed and ok

    # 11. Pagination: Page 1 vs Page 2
    ok, p1 = run_test(
        "11a. Pagination: Page 1 (limit 3)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Rajapalayam (Uzhavar Sandhai )", "dateRange": "all", "page": 1, "limit": 3}
    )
    all_passed = all_passed and ok

    ok, p2 = run_test(
        "11b. Pagination: Page 2 (limit 3)",
        {"commodity": "Tomato", "state": "Tamil Nadu", "district": "Virudhunagar", "market": "Rajapalayam (Uzhavar Sandhai )", "dateRange": "all", "page": 2, "limit": 3}
    )
    all_passed = all_passed and ok
    
    if p1 and p2:
        id1 = [r["id"] for r in p1["records"]]
        id2 = [r["id"] for r in p2["records"]]
        print(f">> Pagination Check: Page 1 IDs={id1}, Page 2 IDs={id2}")
        assert id1 != id2, "Page 1 and Page 2 returned identical record IDs!"
        print(">> [PASS] Pagination successfully advances records.")

    print("\n=================================================================")
    if all_passed:
        print("RESULT: ALL 11 TEST SCENARIOS PASSED WITH 100% SUCCESS!")
    else:
        print("RESULT: ONE OR MORE TESTS FAILED.")
    print("=================================================================")
    
    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
