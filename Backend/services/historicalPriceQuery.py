#!/usr/bin/env python3
"""
Agri$wap Historical Price Query Service
Queries the cleaned agricultural market price parquet dataset using DuckDB.
Persists query results and aggregates in durable SQLite storage (Backend/data/historical_prices.db).
Reuses stored results across page refreshes, browser restarts, and backend restarts.
"""

import sys
import os
import json
import sqlite3
try:
    import duckdb
except ImportError:
    duckdb = None
import time

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
DB_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "data", "historical_prices.db"))

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15.0)
    con.execute("PRAGMA journal_mode = WAL;")
    con.execute("PRAGMA synchronous = NORMAL;")
    con.execute("""
        CREATE TABLE IF NOT EXISTS historical_query_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            commodity TEXT,
            state TEXT,
            district TEXT,
            market TEXT,
            date_range TEXT,
            is_timeline INTEGER DEFAULT 0,
            record_count INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        );
    """)
    con.execute("""
        CREATE INDEX IF NOT EXISTS idx_query_comm_state 
        ON historical_query_cache(commodity, state, is_timeline);
    """)
    con.execute("""
        CREATE INDEX IF NOT EXISTS idx_query_timeline 
        ON historical_query_cache(is_timeline, date_range);
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS system_metadata (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    con.commit()
    return con

def get_normalized_cache_key(params):
    commodity = str(params.get("commodity", "All") or "All").strip()
    state = str(params.get("state", "All") or "All").strip()
    district = str(params.get("district", "All") or "All").strip()
    market = str(params.get("market", "All") or "All").strip()
    date_range = str(params.get("dateRange", "30d") or "30d").strip().lower()
    search = str(params.get("search", "") or "").strip().lower()
    sort_field = str(params.get("sortField", "date") or "date").strip().lower()
    sort_order = str(params.get("sortOrder", "desc") or "desc").strip().lower()
    
    try:
        page = max(1, int(params.get("page", 1) or 1))
    except (ValueError, TypeError):
        page = 1
        
    try:
        limit = min(100, max(1, int(params.get("limit", 10) or 10)))
    except (ValueError, TypeError):
        limit = 10
        
    is_timeline = 1 if params.get("timeline") in [True, "true", "True", 1, "1"] else 0

    return f"hist::c={commodity}::s={state}::d={district}::m={market}::dr={date_range}::q={search}::sf={sort_field}::so={sort_order}::p={page}::l={limit}::tl={is_timeline}"

def get_parquet_dir():
    return os.environ.get(
        "PARQUET_DATASET_DIR",
        os.path.join(
            PROJECT_ROOT,
            "Datasets",
            "Agricultural Market Price Dataset",
            "cleaned_dataset"
        )
    )

def check_parquet_dataset_status():
    """
    Inspects dataset directory existence and content without masking OS faults.
    Returns: (status: str, detail_or_exception)
      - ('available', path_to_directory)
      - ('missing', detail_message)
      - ('empty', detail_message)
      - ('error', live_exception_instance)
    """
    cleaned_dir = get_parquet_dir()
    if not os.path.exists(cleaned_dir):
        return ("missing", f"Directory does not exist: {cleaned_dir}")
    if not os.path.isdir(cleaned_dir):
        return ("missing", f"Path is not a directory: {cleaned_dir}")
    try:
        with os.scandir(cleaned_dir) as entries:
            has_parquet = any(e.is_file() and e.name.endswith(".parquet") for e in entries)
            return ("available", cleaned_dir) if has_parquet else ("empty", f"Directory has 0 .parquet files: {cleaned_dir}")
    except PermissionError as perm_err:
        sys.stderr.write(f"[ERROR] Permission denied scanning dataset directory: {perm_err}\n")
        return ("error", perm_err)
    except OSError as os_err:
        sys.stderr.write(f"[ERROR] OS error scanning dataset directory: {os_err}\n")
        return ("error", os_err)

def get_parquet_path(date_range="30d", prefer_recent=True):
    status, detail = check_parquet_dataset_status()
    if status != "available":
        if status == "error":
            raise detail
        return None

    cleaned_dir = get_parquet_dir()
    if prefer_recent and date_range in ["7d", "14d", "30d"]:
        p2026 = os.path.join(cleaned_dir, "2026.parquet")
        if os.path.exists(p2026):
            return p2026.replace("\\", "/")

    return os.path.join(cleaned_dir, "*.parquet").replace("\\", "/")

def get_all_parquet_path():
    status, detail = check_parquet_dataset_status()
    if status != "available":
        if status == "error":
            raise detail
        return None
    cleaned_dir = get_parquet_dir()
    return os.path.join(cleaned_dir, "*.parquet").replace("\\", "/")

def execute_query(params, con_db=None, bypass_cache=False):
    cache_key = get_normalized_cache_key(params)
    
    # 1. Check persistent SQLite cache first
    if not bypass_cache:
        own_con = False
        db_conn = con_db
        try:
            if db_conn is None:
                db_conn = init_db()
                own_con = True
            cursor = db_conn.cursor()
            cursor.execute("SELECT data FROM historical_query_cache WHERE cache_key = ?", (cache_key,))
            row = cursor.fetchone()
            if row:
                cached_data = json.loads(row[0])
                cached_data["fromPersistentStorage"] = True
                cached_data["dataSource"] = "sqlite_cache"
                if own_con:
                    db_conn.close()
                return cached_data
        except Exception as err:
            sys.stderr.write(f"[WARN] Error reading from SQLite cache: {err}\n")
        finally:
            if own_con and db_conn:
                try:
                    db_conn.close()
                except Exception:
                    pass

    # 2. Cache miss -> Check dataset availability before invoking DuckDB
    ds_status, ds_detail = check_parquet_dataset_status()
    if ds_status == "error":
        raise ds_detail
    elif ds_status in ("missing", "empty") or duckdb is None:
        is_tl = bool(params.get("timeline") in [True, "true", "True", 1, "1"])
        commodity = str(params.get("commodity", "All") or "All").strip()
        fallback_payload = {
            "success": True,
            "records": [],
            "count": 0,
            "total": 0,
            "page": max(1, int(params.get("page", 1) or 1)) if not is_tl else 1,
            "limit": min(100, max(1, int(params.get("limit", 10) or 10))) if not is_tl else 10,
            "totalPages": 0,
            "isFallbackMode": True,
            "fromPersistentStorage": False,
            "dataSource": "none",
            "fallbackReason": "duckdb_missing" if duckdb is None else f"parquet_dataset_{ds_status}",
            "message": f"Granular mandi records are unavailable in lightweight cloud mode for {commodity}. Pre-cached historical records are available in SQLite."
        }
        if is_tl:
            fallback_payload.update({
                "timeline": True,
                "commodity": commodity,
                "currentPrice": None,
                "previousPrice": None
            })
        return fallback_payload

    date_range = str(params.get("dateRange", "30d")).lower()
    parquet_path = get_parquet_path(date_range=date_range, prefer_recent=True)
    if duckdb is None:
        return fallback_payload
    con = duckdb.connect()

    commodity = params.get("commodity")
    state = params.get("state")
    district = params.get("district")
    market = params.get("market")
    search = params.get("search", "")
    sort_field = str(params.get("sortField", "date")).lower()
    sort_order = str(params.get("sortOrder", "desc")).upper()
    
    try:
        page = max(1, int(params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
        
    try:
        limit = min(100, max(1, int(params.get("limit", 10))))
    except (ValueError, TypeError):
        limit = 10
        
    offset = (page - 1) * limit

    where_clauses = ["1=1"]

    # 1. State filter
    if state and state != "All":
        clean_state = state.replace("'", "''")
        if clean_state in ["Delhi", "NCT of Delhi"]:
            where_clauses.append("(State = 'NCT of Delhi' OR State = 'Delhi')")
        else:
            where_clauses.append(f"State = '{clean_state}'")

    # 2. District filter
    if district and district != "All":
        clean_dist = district.replace("'", "''")
        where_clauses.append(f"District = '{clean_dist}'")

    # 3. Market filter: exact match on registered market name
    clean_mkt = None
    if market and market != "All":
        clean_mkt = market.replace("'", "''").strip()
        where_clauses.append(f"Market = '{clean_mkt}'")

    # 4. Commodity filter with comprehensive alias normalization and exact matching
    if commodity and commodity != "All":
        c_map = {
            "Soybean": "Soyabean%",
            "Soyabean": "Soyabean%",
            "Chilli": "%Chilli%",
            "Green Chilli": "%Chilli%",
            "Dry Chillies": "%Chilli%",
            "Cotton": "Cotton%",
            "Rice": "Rice%",
            "Wheat": "Wheat%",
            "Potato": "Potato%",
            "Tomato": "Tomato%",
            "Onion": "Onion%",
            "Banana": "Banana%",
            "Turmeric": "Turmeric%",
            "Maize": "Maize%",
            "Makka": "%Maize%",
            "Bengal Gram": "%Bengal Gram%",
            "Gram": "%Bengal Gram%",
            "Chana": "%Bengal Gram%",
            "Black Gram": "%Black Gram%",
            "Urad": "%Black Gram%",
            "Urd": "%Black Gram%",
            "Green Gram": "%Green Gram%",
            "Moong": "%Green Gram%",
            "Arhar": "%Arhar%",
            "Tur": "%Arhar%",
            "Toor": "%Arhar%",
            "Paddy": "Paddy%",
            "Dhan": "%Paddy%",
            "Mustard": "Mustard%",
            "Sarson": "Mustard%",
            "Groundnut": "Groundnut%",
            "Peanut": "Groundnut%",
            "Bhindi": "Bhindi%",
            "Ladies Finger": "%Bhindi%",
            "Barley": "Barley%",
            "Jau": "%Barley%",
            "Bajra": "Bajra%",
            "Jowar": "Jowar%",
            "Garlic": "Garlic%",
            "Ginger": "Ginger%",
            "Apple": "Apple%",
            "Coconut": "Coconut%"
        }
        if commodity in c_map:
            target_pattern = c_map[commodity].replace("'", "''")
            where_clauses.append(f"Commodity ILIKE '{target_pattern}'")
        else:
            clean_comm = commodity.replace("'", "''")
            where_clauses.append(f"(Commodity = '{clean_comm}' OR Commodity ILIKE '{clean_comm}%')")

    # 5. Search text filter
    if search and search.strip():
        clean_s = search.strip().replace("'", "''")
        where_clauses.append(
            f"(Market ILIKE '%{clean_s}%' OR District ILIKE '%{clean_s}%' OR State ILIKE '%{clean_s}%' OR Commodity ILIKE '%{clean_s}%')"
        )

    base_where = " AND ".join(where_clauses)
    is_timeline = params.get("timeline") in [True, "true", "True", 1, "1"]

    # Dynamic market display label for aggregated timeline records
    if clean_mkt:
        mkt_label_sql = "first(f.Market) as market"
        grouped_mkt_label_sql = "first(Market) as market"
    elif district and district != "All":
        clean_d_label = district.replace("'", "''")
        mkt_label_sql = f"'{clean_d_label} (All Mandis)' as market"
        grouped_mkt_label_sql = f"'{clean_d_label} (All Mandis)' as market"
    elif state and state != "All":
        clean_s_label = state.replace("'", "''")
        mkt_label_sql = f"'{clean_s_label} (All Mandis)' as market"
        grouped_mkt_label_sql = f"'{clean_s_label} (All Mandis)' as market"
    else:
        mkt_label_sql = "'National (All Mandis)' as market"
        grouped_mkt_label_sql = "'National (All Mandis)' as market"

    t0 = time.time()

    # TIMELINE QUERY PATH
    if is_timeline:
        if not commodity or commodity == "All":
            return {
                "success": True,
                "timeline": True,
                "commodity": "All",
                "records": [],
                "count": 0,
                "currentPrice": None,
                "previousPrice": None,
                "execTimeMs": 0.0
            }

        days_map = {"7d": 7, "14d": 14, "30d": 30}
        
        def run_timeline_for_path(current_path):
            if date_range in days_map:
                days = days_map[date_range]
                sql = f"""
                WITH raw_filtered AS (
                    SELECT 
                        Arrival_Date,
                        COALESCE(Min_Price, Modal_Price, 0.0) as min_val,
                        COALESCE(Max_Price, Modal_Price, 0.0) as max_val,
                        COALESCE(Modal_Price, 0.0) as modal_val,
                        Market,
                        State,
                        District
                    FROM read_parquet('{current_path}')
                    WHERE {base_where} AND Modal_Price IS NOT NULL AND Modal_Price > 0
                ),
                max_d AS (
                    SELECT max(Arrival_Date) as m_date FROM raw_filtered
                )
                SELECT 
                    strftime(f.Arrival_Date, '%Y-%m-%d') as raw_date,
                    strftime(f.Arrival_Date, '%d %b') as date,
                    round(avg(f.modal_val), 1) as modal,
                    round(avg(f.min_val), 1) as min,
                    round(avg(f.max_val), 1) as max,
                    {mkt_label_sql},
                    first(f.State) as state,
                    first(f.District) as district
                FROM raw_filtered f, max_d
                WHERE f.Arrival_Date >= max_d.m_date - INTERVAL {days} DAY
                GROUP BY f.Arrival_Date
                ORDER BY f.Arrival_Date ASC
                """
                res_rows = con.execute(sql).fetchall()

                if len(res_rows) < 2:
                    fallback_limit = max(days, 14)
                    fallback_sql = f"""
                    WITH raw_filtered AS (
                        SELECT 
                            Arrival_Date,
                            COALESCE(Min_Price, Modal_Price, 0.0) as min_val,
                            COALESCE(Max_Price, Modal_Price, 0.0) as max_val,
                            COALESCE(Modal_Price, 0.0) as modal_val,
                            Market,
                            State,
                            District
                        FROM read_parquet('{current_path}')
                        WHERE {base_where} AND Modal_Price IS NOT NULL AND Modal_Price > 0
                    ),
                    grouped_dates AS (
                        SELECT 
                            Arrival_Date,
                            round(avg(modal_val), 1) as modal,
                            round(avg(min_val), 1) as min,
                            round(avg(max_val), 1) as max,
                            {grouped_mkt_label_sql},
                            first(State) as state,
                            first(District) as district
                        FROM raw_filtered
                        GROUP BY Arrival_Date
                        ORDER BY Arrival_Date DESC
                        LIMIT {fallback_limit}
                    )
                    SELECT 
                        strftime(Arrival_Date, '%Y-%m-%d') as raw_date,
                        strftime(Arrival_Date, '%d %b') as date,
                        modal,
                        min,
                        max,
                        market,
                        state,
                        district
                    FROM grouped_dates
                    ORDER BY Arrival_Date ASC
                    """
                    fb_rows = con.execute(fallback_sql).fetchall()
                    if len(fb_rows) > len(res_rows):
                        res_rows = fb_rows
                return res_rows
            else:
                # All time
                sql = f"""
                WITH raw_filtered AS (
                    SELECT 
                        Arrival_Date,
                        COALESCE(Min_Price, Modal_Price, 0.0) as min_val,
                        COALESCE(Max_Price, Modal_Price, 0.0) as max_val,
                        COALESCE(Modal_Price, 0.0) as modal_val,
                        Market,
                        State,
                        District
                    FROM read_parquet('{current_path}')
                    WHERE {base_where} AND Modal_Price IS NOT NULL AND Modal_Price > 0
                )
                SELECT 
                    strftime(Arrival_Date, '%Y-%m-%d') as raw_date,
                    strftime(Arrival_Date, '%d %b') as date,
                    round(avg(modal_val), 1) as modal,
                    round(avg(min_val), 1) as min,
                    round(avg(max_val), 1) as max,
                    {grouped_mkt_label_sql},
                    first(State) as state,
                    first(District) as district
                FROM raw_filtered
                GROUP BY Arrival_Date
                ORDER BY Arrival_Date ASC
                """
                return con.execute(sql).fetchall()

        rows = run_timeline_for_path(parquet_path)
        # If 0 rows with 2026.parquet, fallback to all parquet files
        if len(rows) == 0 and parquet_path != get_all_parquet_path():
            rows = run_timeline_for_path(get_all_parquet_path())

        elapsed_ms = round((time.time() - t0) * 1000, 2)
        cols = ["raw_date", "date", "modal", "min", "max", "market", "state", "district"]
        records = [dict(zip(cols, r)) for r in rows]
        current_price = records[-1]["modal"] if records else None
        previous_price = records[-7]["modal"] if len(records) >= 7 else (records[0]["modal"] if records else None)

        result_payload = {
            "success": True,
            "timeline": True,
            "commodity": commodity or "All",
            "records": records,
            "count": len(records),
            "currentPrice": current_price,
            "previousPrice": previous_price,
            "execTimeMs": elapsed_ms,
            "fromPersistentStorage": False,
            "dataSource": "parquet"
        }

    # TABLE QUERY PATH
    else:
        def run_table_for_path(current_path):
            if date_range in ["7d", "14d", "30d"]:
                days_map = {"7d": 7, "14d": 14, "30d": 30}
                days = days_map[date_range]

                select_sql = f"""
                WITH raw_filtered AS (
                    SELECT 
                        Arrival_Date,
                        Commodity,
                        State,
                        District,
                        Market,
                        COALESCE(Min_Price, Modal_Price, 0.0) as min_val,
                        COALESCE(Max_Price, Modal_Price, 0.0) as max_val,
                        COALESCE(Modal_Price, 0.0) as modal_val
                    FROM read_parquet('{current_path}')
                    WHERE {base_where}
                ),
                max_d AS (
                    SELECT max(Arrival_Date) as m_date FROM raw_filtered
                )
                SELECT 
                    strftime(f.Arrival_Date, '%Y-%m-%d') as date,
                    f.Commodity as commodity,
                    f.State as state,
                    f.District as district,
                    f.Market as market,
                    f.min_val as min,
                    f.max_val as max,
                    f.modal_val as modal
                FROM raw_filtered f, max_d
                WHERE f.Arrival_Date >= max_d.m_date - INTERVAL {days} DAY
                """

                count_sql = f"""
                WITH raw_filtered AS (
                    SELECT Arrival_Date
                    FROM read_parquet('{current_path}')
                    WHERE {base_where}
                ),
                max_d AS (
                    SELECT max(Arrival_Date) as m_date FROM raw_filtered
                )
                SELECT count(*)
                FROM raw_filtered f, max_d
                WHERE f.Arrival_Date >= max_d.m_date - INTERVAL {days} DAY
                """
                
                sort_col_map = {
                    "date": "f.Arrival_Date",
                    "commodity": "f.Commodity",
                    "state": "f.State",
                    "district": "f.District",
                    "market": "f.Market",
                    "min": "f.min_val",
                    "max": "f.max_val",
                    "modal": "f.modal_val"
                }
            else:
                select_sql = f"""
                SELECT 
                    strftime(Arrival_Date, '%Y-%m-%d') as date,
                    Commodity as commodity,
                    State as state,
                    District as district,
                    Market as market,
                    COALESCE(Min_Price, Modal_Price, 0.0) as min,
                    COALESCE(Max_Price, Modal_Price, 0.0) as max,
                    COALESCE(Modal_Price, 0.0) as modal
                FROM read_parquet('{current_path}')
                WHERE {base_where}
                """

                count_sql = f"""
                SELECT count(*)
                FROM read_parquet('{current_path}')
                WHERE {base_where}
                """

                sort_col_map = {
                    "date": "Arrival_Date",
                    "commodity": "Commodity",
                    "state": "State",
                    "district": "District",
                    "market": "Market",
                    "min": "Min_Price",
                    "max": "Max_Price",
                    "modal": "Modal_Price"
                }

            sort_col = sort_col_map.get(sort_field, sort_col_map["date"])
            direction = "ASC" if sort_order == "ASC" else "DESC"
            final_query = f"{select_sql} ORDER BY {sort_col} {direction} LIMIT {limit} OFFSET {offset}"

            t_rows = con.execute(final_query).fetchall()
            
            if date_range in ["7d", "14d", "30d"] and offset == 0 and len(t_rows) < 2:
                days_map = {"7d": 7, "14d": 14, "30d": 30}
                days = days_map[date_range]
                fallback_table_sql = f"""
                WITH raw_filtered AS (
                    SELECT 
                        Arrival_Date,
                        Commodity,
                        State,
                        District,
                        Market,
                        COALESCE(Min_Price, Modal_Price, 0.0) as min_val,
                        COALESCE(Max_Price, Modal_Price, 0.0) as max_val,
                        COALESCE(Modal_Price, 0.0) as modal_val
                    FROM read_parquet('{current_path}')
                    WHERE {base_where}
                ),
                recent_dates AS (
                    SELECT DISTINCT Arrival_Date
                    FROM raw_filtered
                    ORDER BY Arrival_Date DESC
                    LIMIT {days}
                )
                SELECT 
                    strftime(f.Arrival_Date, '%Y-%m-%d') as date,
                    f.Commodity as commodity,
                    f.State as state,
                    f.District as district,
                    f.Market as market,
                    f.min_val as min,
                    f.max_val as max,
                    f.modal_val as modal
                FROM raw_filtered f
                WHERE f.Arrival_Date IN (SELECT Arrival_Date FROM recent_dates)
                ORDER BY {sort_col} {direction}
                LIMIT {limit} OFFSET {offset}
                """
                fallback_rows = con.execute(fallback_table_sql).fetchall()
                if len(fallback_rows) > len(t_rows):
                    t_rows = fallback_rows
                    count_fb_sql = f"""
                    WITH raw_filtered AS (
                        SELECT Arrival_Date
                        FROM read_parquet('{current_path}')
                        WHERE {base_where}
                    ),
                    recent_dates AS (
                        SELECT DISTINCT Arrival_Date
                        FROM raw_filtered
                        ORDER BY Arrival_Date DESC
                        LIMIT {days}
                    )
                    SELECT count(*)
                    FROM raw_filtered f
                    WHERE f.Arrival_Date IN (SELECT Arrival_Date FROM recent_dates)
                    """
                    count_res = con.execute(count_fb_sql).fetchone()
                    tot = count_res[0] if count_res else len(t_rows)
                    return t_rows, tot

            if offset == 0 and len(t_rows) < limit:
                tot = len(t_rows)
            else:
                count_res = con.execute(count_sql).fetchone()
                tot = count_res[0] if count_res else len(t_rows)

            return t_rows, tot

        rows, total = run_table_for_path(parquet_path)
        # If 0 rows with 2026.parquet, fallback to all parquet files
        if len(rows) == 0 and parquet_path != get_all_parquet_path():
            rows, total = run_table_for_path(get_all_parquet_path())

        elapsed_ms = round((time.time() - t0) * 1000, 2)
        cols = ["date", "commodity", "state", "district", "market", "min", "max", "modal"]
        records = []
        for idx, r in enumerate(rows):
            item = dict(zip(cols, r))
            item["id"] = offset + idx + 1
            records.append(item)

        total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 1

        result_payload = {
            "success": True,
            "records": records,
            "count": len(records),
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": total_pages,
            "execTimeMs": elapsed_ms,
            "fromPersistentStorage": False,
            "dataSource": "parquet"
        }

    # 3. Persist successful result permanently into SQLite storage
    if result_payload.get("isFallbackMode"):
        return result_payload

    try:
        save_con = con_db
        own_save = False
        if save_con is None:
            save_con = init_db()
            own_save = True

        save_cur = save_con.cursor()
        save_cur.execute("""
            INSERT OR REPLACE INTO historical_query_cache 
            (cache_key, data, commodity, state, district, market, date_range, is_timeline, record_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (
            cache_key,
            json.dumps(result_payload),
            commodity or "All",
            state or "All",
            district or "All",
            market or "All",
            date_range,
            1 if is_timeline else 0,
            len(result_payload.get("records", []))
        ))
        save_con.commit()
        if own_save:
            save_con.close()
    except Exception as save_err:
        sys.stderr.write(f"[WARN] Failed to write query to SQLite cache: {save_err}\n")

    return result_payload

def main():
    try:
        if len(sys.argv) > 1:
            raw_input = sys.argv[1]
        else:
            raw_input = sys.stdin.read()

        params = json.loads(raw_input) if raw_input.strip() else {}
        result = execute_query(params)
        print(json.dumps(result))
    except Exception as e:
        error_res = {
            "success": False,
            "error": str(e),
            "records": [],
            "total": 0
        }
        print(json.dumps(error_res))
        sys.exit(1)

if __name__ == "__main__":
    main()
