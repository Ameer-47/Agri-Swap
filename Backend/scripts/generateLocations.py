import os
import time
import json
import duckdb

def generate_location_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(base_dir, "..", ".."))
    parquet_pattern = os.path.join(
        project_root,
        "Datasets",
        "Agricultural Market Price Dataset",
        "cleaned_dataset",
        "*.parquet"
    ).replace("\\", "/")

    data_dir = os.path.join(base_dir, "..", "data")
    os.makedirs(data_dir, exist_ok=True)
    out_file = os.path.join(data_dir, "locations.json")

    print(f"Reading Parquet dataset from: {parquet_pattern}")
    t0 = time.time()
    con = duckdb.connect()

    # Query distinct location combinations directly from cleaned parquet dataset
    df = con.execute(f"""
        SELECT DISTINCT State, District, Market
        FROM read_parquet('{parquet_pattern}')
        WHERE State IS NOT NULL AND District IS NOT NULL AND Market IS NOT NULL
        ORDER BY State, District, Market
    """).df()

    elapsed = time.time() - t0
    print(f"Extracted {len(df)} distinct combinations across cleaned dataset in {elapsed:.2f}s")

    all_states = sorted(df['State'].unique().tolist())
    hierarchy = {}

    for state in all_states:
        sub_state = df[df['State'] == state]
        districts = sorted(sub_state['District'].unique().tolist())
        all_markets_in_state = sorted(sub_state['Market'].unique().tolist())
        
        district_to_markets = {}
        for d in districts:
            m_list = sorted(sub_state[sub_state['District'] == d]['Market'].unique().tolist())
            district_to_markets[d] = m_list

        hierarchy[state] = {
            "districts": districts,
            "markets": all_markets_in_state,
            "district_to_markets": district_to_markets
        }

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceDataset": "Datasets/Agricultural Market Price Dataset/cleaned_dataset/*.parquet",
        "totalCombinations": len(df),
        "totalStates": len(all_states),
        "states": all_states,
        "hierarchy": hierarchy
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Saved {out_file} ({os.path.getsize(out_file) / 1024:.2f} KB)")
    
    # Audit Target States
    targets = ["Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana", "Puducherry"]
    print("\n--- Target States Verification ---")
    for t in targets:
        if t in hierarchy:
            d_len = len(hierarchy[t]["districts"])
            m_len = len(hierarchy[t]["markets"])
            print(f"  {t}: {d_len} districts, {m_len} distinct markets")
        else:
            print(f"  {t}: MISSING")

if __name__ == "__main__":
    generate_location_data()
