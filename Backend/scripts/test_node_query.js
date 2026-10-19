const { spawn } = require("child_process");
const path = require("path");

const t0 = Date.now();
const proc = spawn("python", [
    "-c",
    `
import duckdb, json, sys
con = duckdb.connect()
rows = con.execute('''
    SELECT 
        strftime(Arrival_Date, '%Y-%m-%d') as date,
        Commodity as commodity,
        State as state,
        District as district,
        Market as market,
        Min_Price as min,
        Max_Price as max,
        Modal_Price as modal
    FROM read_parquet('Datasets/Agricultural Market Price Dataset/cleaned_dataset/*.parquet')
    WHERE State = 'Tamil Nadu' AND Commodity ILIKE 'Tomato%'
    ORDER BY Arrival_Date DESC
    LIMIT 20
''').fetchall()
cols = ['date', 'commodity', 'state', 'district', 'market', 'min', 'max', 'modal']
data = [dict(zip(cols, r)) for r in rows]
print(json.dumps(data))
`
], {
    cwd: path.join(__dirname, "../..")
});

let out = "";
proc.stdout.on("data", d => out += d);
proc.on("close", code => {
    const dt = Date.now() - t0;
    console.log(`Finished in ${dt}ms, exit code ${code}`);
    try {
        const json = JSON.parse(out.trim());
        console.log(`Parsed ${json.length} records. Sample 1:`, json[0]);
    } catch (e) {
        console.error("Parse error:", e, "Raw output:", out);
    }
});
