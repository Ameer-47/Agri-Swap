#!/usr/bin/env python3
"""
Agri$wap - Offline Food Substitution Cache Backfill Utility

Generates and durably persists base food substitution templates into SQLite storage
(substitution_query_cache in Backend/data/historical_prices.db or custom DB).

Features:
- Idempotent: Skips existing valid cache entries by default.
- Uses exact existing algorithm and nutrition logic from ML.food_substitution.
- Supports dry-run mode (--dry-run).
- Supports custom DB path (--db-path) for safe isolated testing.
- Supports single-food filter (--food) and multi-preference modes (--preferences).
- Transactional and reports detailed success, skip, and error statistics.
"""

import sys
import os
import json
import sqlite3
import time
import argparse
from datetime import datetime

# Ensure project root is in PYTHONPATH
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

DEFAULT_DB_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "data", "historical_prices.db"))

SUPPORTED_PREFERENCES = ["balanced", "nutrition", "price", "cooking"]

def get_db_connection(db_path):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS substitution_query_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            food TEXT,
            quantity REAL,
            unit TEXT,
            preference TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_sub_food_pref
        ON substitution_query_cache(food, preference);
    """)
    conn.commit()
    return conn

def is_entry_valid(cursor, cache_key):
    try:
        cursor.execute("SELECT data FROM substitution_query_cache WHERE cache_key = ?", (cache_key,))
        row = cursor.fetchone()
        if not row or not row[0]:
            return False
        parsed = json.loads(row[0])
        return bool(parsed.get("success") is True and parsed.get("alternatives"))
    except Exception:
        return False

def run_backfill(
    db_path=DEFAULT_DB_PATH,
    dry_run=False,
    force=False,
    target_food=None,
    preferences=None,
    top_n=10,
    quiet=False
):
    from ML.food_substitution.agricultural_food_substitution import (
        get_single_food_substitutions,
        get_available_substitution_foods
    )

    if preferences is None:
        preferences = ["balanced"]
    else:
        preferences = [p.strip().lower() for p in preferences if p.strip().lower() in SUPPORTED_PREFERENCES]
        if not preferences:
            preferences = ["balanced"]

    available_foods_res = get_available_substitution_foods()
    all_foods = [item["name"] for item in available_foods_res.get("foods", [])]

    if target_food:
        target_norm = target_food.strip().lower()
        foods_to_process = [f for f in all_foods if f.strip().lower() == target_norm]
        if not foods_to_process:
            foods_to_process = [target_food.strip()]
    else:
        foods_to_process = all_foods

    total_combinations = len(foods_to_process) * len(preferences)
    print("=" * 70)
    print("  AGRI-SWAP FOOD SUBSTITUTION CACHE BACKFILL UTILITY")
    print("=" * 70)
    print(f"Target Database   : {db_path}")
    print(f"Dry Run Mode      : {'ENABLED (No changes will be written)' if dry_run else 'DISABLED (Writes to SQLite)'}")
    print(f"Force Overwrite   : {'YES' if force else 'NO (Skips existing valid entries)'}")
    print(f"Distinct Foods    : {len(foods_to_process)} produce items")
    print(f"Preferences       : {', '.join(preferences)}")
    print(f"Total Combinations: {total_combinations} potential templates")
    print("-" * 70)

    conn = None
    if not dry_run:
        conn = get_db_connection(db_path)
        cursor = conn.cursor()
    else:
        cursor = None
        if os.path.exists(db_path):
            try:
                conn_read = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
                cursor = conn_read.cursor()
            except Exception:
                cursor = None

    t_start = time.perf_counter()
    inserted_count = 0
    skipped_count = 0
    failed_count = 0
    no_alts_count = 0

    batch = []
    batch_size = 25

    for idx, food_name in enumerate(foods_to_process, start=1):
        clean_food = food_name.strip().lower()

        for pref in preferences:
            cache_key = f"{clean_food}_1_kg_{pref}"

            if cursor and not force:
                if is_entry_valid(cursor, cache_key):
                    skipped_count += 1
                    if not quiet:
                        print(f"[{idx}/{len(foods_to_process)}] [SKIP] {food_name} ({pref}) -> already cached")
                    continue

            try:
                t0 = time.perf_counter()
                payload = get_single_food_substitutions(
                    food_name=food_name,
                    quantity=1.0,
                    unit="kg",
                    preference=pref,
                    top_n=top_n
                )
                t_sub = (time.perf_counter() - t0) * 1000

                if not payload or not payload.get("success"):
                    failed_count += 1
                    if not quiet:
                        print(f"[{idx}/{len(foods_to_process)}] [FAIL] {food_name} ({pref}) -> {payload.get('message', 'Failed')}")
                    continue

                alts_count = len(payload.get("alternatives", []))
                if alts_count == 0:
                    no_alts_count += 1
                    if not quiet:
                        print(f"[{idx}/{len(foods_to_process)}] [EMPTY] {food_name} ({pref}) -> 0 alternatives found")
                    continue

                if "originalFood" in payload and isinstance(payload["originalFood"], dict):
                    orig_food = payload["originalFood"]
                    if "estimatedPricePerKg" not in orig_food and "pricePerKg" in orig_food:
                        orig_food["estimatedPricePerKg"] = orig_food.get("pricePerKg")

                payload_json = json.dumps(payload)

                if dry_run:
                    inserted_count += 1
                    if not quiet:
                        print(f"[{idx}/{len(foods_to_process)}] [DRY-RUN] {food_name} ({pref}) -> {alts_count} alts in {t_sub:.1f}ms ({len(payload_json)} bytes)")
                else:
                    batch.append((
                        cache_key,
                        payload_json,
                        food_name,
                        1.0,
                        "kg",
                        pref
                    ))
                    inserted_count += 1
                    if not quiet:
                        print(f"[{idx}/{len(foods_to_process)}] [OK] {food_name} ({pref}) -> {alts_count} alts in {t_sub:.1f}ms ({len(payload_json)} bytes)")

                    if len(batch) >= batch_size:
                        cursor.executemany("""
                            INSERT OR REPLACE INTO substitution_query_cache
                            (cache_key, data, food, quantity, unit, preference, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, batch)
                        conn.commit()
                        batch.clear()

            except Exception as e:
                failed_count += 1
                print(f"[{idx}/{len(foods_to_process)}] [ERROR] {food_name} ({pref}) -> {str(e)}")

    if not dry_run and batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO substitution_query_cache
            (cache_key, data, food, quantity, unit, preference, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """, batch)
        conn.commit()
        batch.clear()

    if not dry_run and conn:
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
            """)
            cursor.execute("""
                INSERT OR REPLACE INTO system_metadata (key, value)
                VALUES ('substitution_backfill_last_run', datetime('now'))
            """)
            conn.commit()
        except Exception:
            pass
        conn.close()

    total_time = time.perf_counter() - t_start
    avg_ms = (total_time / total_combinations * 1000) if total_combinations > 0 else 0

    print("=" * 70)
    print("  BACKFILL SUMMARY")
    print("=" * 70)
    print(f"Total Combinations Processed: {total_combinations}")
    print(f"Successfully Prepared/Stored: {inserted_count}")
    print(f"Skipped (Already Valid)     : {skipped_count}")
    print(f"Zero Alternatives Recorded  : {no_alts_count}")
    print(f"Errors/Failures             : {failed_count}")
    print(f"Total Elapsed Time          : {total_time:.2f} seconds ({avg_ms:.1f} ms/combination)")
    print("=" * 70)

    return {
        "status": "success",
        "dryRun": dry_run,
        "totalCombinations": total_combinations,
        "insertedCount": inserted_count,
        "skippedCount": skipped_count,
        "noAltsCount": no_alts_count,
        "failedCount": failed_count,
        "totalTimeSeconds": round(total_time, 2)
    }

def main():
    parser = argparse.ArgumentParser(description="AGRI-SWAP Offline Food Substitution Cache Backfill")
    parser.add_argument("--db-path", type=str, default=DEFAULT_DB_PATH, help=f"Path to SQLite database (default: {DEFAULT_DB_PATH})")
    parser.add_argument("--dry-run", action="store_true", help="Simulate generation without writing anything to the database")
    parser.add_argument("--force", action="store_true", help="Force recalculation and overwrite existing cache entries")
    parser.add_argument("--food", type=str, default=None, help="Backfill only a specific food commodity (e.g. --food=Cauliflower)")
    parser.add_argument("--preferences", type=str, default="balanced", help="Comma-separated preferences to backfill (e.g. balanced,nutrition,price,cooking)")
    parser.add_argument("--all-preferences", action="store_true", help="Shorthand to backfill all 4 supported preference modes")
    parser.add_argument("--top_n", type=int, default=10, help="Number of alternatives per template (default: 10)")
    parser.add_argument("--quiet", action="store_true", help="Quiet mode (suppress per-item progress lines)")

    args = parser.parse_args()

    if args.all_preferences:
        pref_list = SUPPORTED_PREFERENCES
    else:
        pref_list = [p.strip() for p in args.preferences.split(",") if p.strip()]

    result = run_backfill(
        db_path=args.db_path,
        dry_run=args.dry_run,
        force=args.force,
        target_food=args.food,
        preferences=pref_list,
        top_n=args.top_n,
        quiet=args.quiet
    )

    if args.quiet:
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
