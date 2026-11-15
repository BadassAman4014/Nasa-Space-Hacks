"""Query every catalogue dataset for Field 2 (read-only GETs) and record what actually comes back."""
import json
import time
from pathlib import Path

import requests

B = "http://127.0.0.1:8000/api"
OUT = Path("scratch/audit/api")
FIELD = "field-2bf954950c"

cat = requests.get(f"{B}/nasa-challenge/catalog", timeout=60).json()
print("catalogue size:", len(cat))
rows = []
for d in cat:
    t = time.time()
    try:
        r = requests.get(f"{B}/nasa-challenge/fields/{FIELD}/query", params={"dataset_id": d["id"]}, timeout=90)
        body = r.json() if r.ok else {"error": r.text[:200]}
        status = body.get("status")
    except Exception as e:
        body, status = {"error": f"{type(e).__name__}"}, "exception"
    dt = round(time.time() - t, 1)
    data = body.get("data", {}) if isinstance(body, dict) else {}
    rows.append({
        "id": d["id"], "name": d["name"], "agency": d["agency"], "category": d["category"],
        "catalog_live_queryable": d.get("is_live_queryable"), "http": r.status_code if 'r' in dir() else None,
        "status": status, "seconds": dt, "summary": body.get("summary"), "source_url": body.get("source_url"),
        "data_keys": list(data.keys())[:14], "metadata": body.get("metadata"),
        "data_preview": json.dumps(data, ensure_ascii=False, default=str)[:420],
    })
    print(f"{d['id']:<24} {str(status):<12} {dt:>5}s  live_flag={d.get('is_live_queryable')}  {str(body.get('summary'))[:90]}")

(OUT / "dataset_queries_field2.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
