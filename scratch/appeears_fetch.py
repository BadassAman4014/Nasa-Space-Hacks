"""Download and summarise the finished AppEEARS SMAP task. Never prints secrets."""
import csv
import io
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
API = "https://appeears.earthdatacloud.nasa.gov/api"
U = os.getenv("EARTHDATA_USERNAME", "").strip()
P = os.getenv("EARTHDATA_PASSWORD", "").strip()
tok = requests.post(f"{API}/login", auth=(U, P), timeout=60).json()["token"]
H = {"Authorization": f"Bearer {tok}"}
tid = json.loads(Path(__file__).with_name("appeears_task.json").read_text())["task_id"]

bundle = requests.get(f"{API}/bundle/{tid}", headers=H, timeout=60).json()
files = bundle["files"]
print("files:", [(f["file_name"], f["file_size"]) for f in files])
out = Path(__file__).with_name("appeears_out")
out.mkdir(exist_ok=True)
for f in files:
    if f["file_name"].endswith(".csv"):
        r = requests.get(f"{API}/bundle/{tid}/{f['file_id']}", headers=H, timeout=120, allow_redirects=True)
        (out / Path(f["file_name"]).name).write_bytes(r.content)
        rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8"))))
        print(f"\n== {f['file_name']}: {len(rows)} rows")
        if rows:
            cols = [c for c in rows[0] if "soil_moisture" in c or "sm_" in c or c in ("Date", "Latitude", "Longitude")]
            print("cols:", cols)
            for row in rows[:3] + rows[-3:]:
                print("  ", {c: row[c] for c in cols})
