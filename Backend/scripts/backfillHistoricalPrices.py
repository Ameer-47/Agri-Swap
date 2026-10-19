#!/usr/bin/env python3
"""
Agri$wap - Permanent Historical Price Data Backfill & Persistence Service

Pre-populates and durably persists historical market queries and timeline aggregates
from the cleaned Parquet dataset into durable SQLite storage (Backend/data/historical_prices.db).
Guarantees that historical data is permanently persisted and never re-fetched or rebuilt on daily visits.
"""

import sys
import os
import json
import sqlite3
import time
from datetime import datetime

# Import query execution function from historicalPriceQuery
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services")))
from historicalPriceQuery import execute_query, get_normalized_cache_key, init_db, DB_PATH

CORE_COMMODITIES = [
    "Tomato",
    "Onion",
    "Potato",
    "Rice",
    "Wheat",
    "Bengal Gram",
    "Mustard",
    "Soybean",
    "Maize",
    "Apple",
    "Banana",
    "Garlic",
    "Ginger",
    "Grapes",
    "Lemon",
    "Mango",
    "Orange",
    "Cotton"
]

TOP_STATES = [
    "All",
    "Tamil Nadu",
    "Maharashtra",
    "Uttar Pradesh",
    "Karnataka",
    "NCT of Delhi",
    "Gujarat",
    "West Bengal",
    "Kerala",
    "Punjab",
    "Rajasthan",
    "Madhya Pradesh",
    "Andhra Pradesh",
    "Telangana"
]

DATE_RANGES = ["30d", "14d", "7d"]

def run_backfill(force=False, commodity_filter=None):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = init_db()
    cursor = conn.cursor()

    # Check if initial backfill was already completed
    cursor.execute("SELECT value FROM system_metadata WHERE key = 'initial_backfill_completed'")
    row = cursor.fetchone()
    if row and not force and not commodity_filter:
        cursor.execute("SELECT count(*) FROM historical_query_cache")
        total_cached = cursor.fetchone()[0]
        print(f"[AGRI-SWAP] Historical price persistence already initialized ({total_cached} queries cached at {row[0]}).")
        print("[AGRI-SWAP] Reusing existing persistent records. Daily auto-refresh is DISABLED.")
        conn.close()
        return {
            "status": "already_initialized",
            "cachedQueries": total_cached,
            "completedAt": row[0]
        }

    commodities = [commodity_filter] if commodity_filter else CORE_COMMODITIES
    print(f"[AGRI-SWAP] Starting controlled backfill for {len(commodities)} commodities across {len(TOP_STATES)} regions...")
    t0 = time.time()
    inserted_count = 0
    skipped_count = 0
    error_count = 0

    for comm in commodities:
        for state in TOP_STATES:
            for dr in DATE_RANGES:
                # 1. Timeline aggregate query
                timeline_params = {
                    "commodity": comm,
                    "state": state,
                    "district": "All",
                    "market": "All",
                    "dateRange": dr,
                    "timeline": True
                }
                tl_key = get_normalized_cache_key(timeline_params)
                
                cursor.execute("SELECT 1 FROM historical_query_cache WHERE cache_key = ?", (tl_key,))
                if cursor.fetchone() and not force:
                    skipped_count += 1
                else:
                    try:
                        res = execute_query(timeline_params, con_db=conn, bypass_cache=True)
                        if res.get("success"):
                            data_json = json.dumps(res)
                            cursor.execute("""
                                INSERT OR REPLACE INTO historical_query_cache 
                                (cache_key, data, commodity, state, district, market, date_range, is_timeline, record_count, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
                            """, (tl_key, data_json, comm, state, "All", "All", dr, res.get("count", 0)))
                            inserted_count += 1
                    except Exception as e:
                        error_count += 1
                        print(f"  [ERROR] Backfilling timeline {comm} {state} {dr}: {e}")

                # 2. Table query (page 1, 10 records)
                table_params = {
                    "commodity": comm,
                    "state": state,
                    "district": "All",
                    "market": "All",
                    "dateRange": dr,
                    "search": "",
                    "sortField": "date",
                    "sortOrder": "desc",
                    "page": 1,
                    "limit": 10,
                    "timeline": False
                }
                tb_key = get_normalized_cache_key(table_params)
                cursor.execute("SELECT 1 FROM historical_query_cache WHERE cache_key = ?", (tb_key,))
                if cursor.fetchone() and not force:
                    skipped_count += 1
                else:
                    try:
                        res = execute_query(table_params, con_db=conn, bypass_cache=True)
                        if res.get("success"):
                            data_json = json.dumps(res)
                            cursor.execute("""
                                INSERT OR REPLACE INTO historical_query_cache 
                                (cache_key, data, commodity, state, district, market, date_range, is_timeline, record_count, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
                            """, (tb_key, data_json, comm, state, "All", "All", dr, res.get("count", 0)))
                            inserted_count += 1
                    except Exception as e:
                        error_count += 1
                        print(f"  [ERROR] Backfilling table {comm} {state} {dr}: {e}")

        conn.commit()
        print(f"  -> Completed {comm}: total inserted so far={inserted_count}, skipped={skipped_count}")

    # Mark backfill complete
    now_iso = datetime.utcnow().isoformat() + "Z"
    cursor.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('initial_backfill_completed', ?)", (now_iso,))
    cursor.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('auto_refresh_disabled', 'true')")
    cursor.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('source_dataset', 'Datasets/Agricultural Market Price Dataset/cleaned_dataset')")
    cursor.execute("SELECT count(*) FROM historical_query_cache")
    total_cached = cursor.fetchone()[0]
    cursor.execute("INSERT OR REPLACE INTO system_metadata (key, value) VALUES ('total_cached_queries', ?)", (str(total_cached),))
    conn.commit()
    conn.close()

    elapsed = round(time.time() - t0, 2)
    print(f"\n[AGRI-SWAP] Backfill finished in {elapsed}s: {inserted_count} queries persisted, {skipped_count} skipped, {error_count} errors.")
    print(f"[AGRI-SWAP] Total durable cached entries in DB: {total_cached}. Daily auto-refresh is disabled.")
    return {
        "status": "completed",
        "inserted": inserted_count,
        "skipped": skipped_count,
        "errors": error_count,
        "totalCached": total_cached,
        "elapsedSeconds": elapsed
    }

if __name__ == "__main__":
    force_run = "--force" in sys.argv
    comm_arg = None
    for arg in sys.argv[1:]:
        if arg.startswith("--commodity="):
            comm_arg = arg.split("=")[1].strip()

    result = run_backfill(force=force_run, commodity_filter=comm_arg)
    print(json.dumps(result))
