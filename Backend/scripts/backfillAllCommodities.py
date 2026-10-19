#!/usr/bin/env python3
"""
Agri$wap - Comprehensive Backfill for All 389 Commodities
Pre-populates default national (state=All, dateRange=30d) timeline and table records
from the cleaned Parquet dataset into Backend/data/historical_prices.db.
"""

import sys
import os
import json
import sqlite3
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services")))
from historicalPriceQuery import execute_query, get_normalized_cache_key, init_db, DB_PATH

def main():
    print("[AGRI-SWAP] Starting Comprehensive Commodity Backfill...")
    loc_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "locations.json"))
    with open(loc_file, "r", encoding="utf-8") as f:
        loc_data = json.load(f)

    commodities = loc_data.get("commodities", [])
    print(f"Total commodities to backfill: {len(commodities)}")

    db_conn = init_db()
    if not db_conn:
        print("[ERROR] Could not connect to SQLite database:", DB_PATH)
        return

    cur = db_conn.cursor()
    existing_keys = set(r[0] for r in cur.execute("SELECT cache_key FROM historical_query_cache").fetchall())

    inserted_tl = 0
    inserted_tb = 0
    start_time = time.time()

    for idx, comm in enumerate(commodities, 1):
        # 1. Timeline Query (state=All, dr=30d)
        tl_params = {
            "commodity": comm,
            "state": "All",
            "district": "All",
            "market": "All",
            "dateRange": "30d",
            "timeline": True
        }
        tl_key = get_normalized_cache_key(tl_params)
        if tl_key not in existing_keys:
            try:
                tl_data = execute_query(tl_params, con_db=db_conn, bypass_cache=True)
                if tl_data and tl_data.get("success") and len(tl_data.get("records", [])) > 0:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO historical_query_cache 
                        (cache_key, commodity, state, district, market, date_range, is_timeline, data, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """,
                        (tl_key, comm, "All", "All", "All", "30d", 1, json.dumps(tl_data))
                    )
                    existing_keys.add(tl_key)
                    inserted_tl += 1
            except Exception as e:
                pass

        # 2. Table Query (state=All, dr=30d, limit=10, page=1)
        tb_params = {
            "commodity": comm,
            "state": "All",
            "district": "All",
            "market": "All",
            "dateRange": "30d",
            "search": "",
            "sortField": "date",
            "sortOrder": "desc",
            "page": 1,
            "limit": 10
        }
        tb_key = get_normalized_cache_key(tb_params)
        if tb_key not in existing_keys:
            try:
                tb_data = execute_query(tb_params, con_db=db_conn, bypass_cache=True)
                if tb_data and tb_data.get("success") and len(tb_data.get("records", [])) > 0:
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO historical_query_cache 
                        (cache_key, commodity, state, district, market, date_range, is_timeline, data, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """,
                        (tb_key, comm, "All", "All", "All", "30d", 0, json.dumps(tb_data))
                    )
                    existing_keys.add(tb_key)
                    inserted_tb += 1
            except Exception as e:
                pass

        # Commit every 25 commodities
        if idx % 25 == 0 or idx == len(commodities):
            db_conn.commit()
            elapsed = time.time() - start_time
            print(f"[{idx}/{len(commodities)}] Backfilled {inserted_tl} TL, {inserted_tb} TB queries ({elapsed:.1f}s)")

    # Update system metadata
    cur.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('comprehensive_backfill_at', datetime('now'))")
    db_conn.commit()

    total_entries = cur.execute("SELECT count(*) FROM historical_query_cache").fetchone()[0]
    total_comms = cur.execute("SELECT count(DISTINCT commodity) FROM historical_query_cache").fetchone()[0]
    db_conn.close()

    print(f"\n✅ [SUCCESS] Backfill completed in {time.time() - start_time:.1f}s!")
    print(f"   Added {inserted_tl} timeline entries and {inserted_tb} table entries.")
    print(f"   Total cache entries in DB: {total_entries}")
    print(f"   Total distinct commodities in DB: {total_comms}")

if __name__ == "__main__":
    main()
