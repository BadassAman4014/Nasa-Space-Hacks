"""Try cloud-hosted IMERG via CMR + Harmony subsetting. Never prints secrets."""
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
U = os.getenv("EARTHDATA_USERNAME", "").strip()
P = os.getenv("EARTHDATA_PASSWORD", "").strip()
T = os.getenv("EARTHDATA_TOKEN", "").strip()

r = requests.get("https://urs.earthdata.nasa.gov/api/users/tokens", auth=(U, P), timeout=30)
toks = r.json() if r.ok else []
print("tokens on account:", len(toks), [t.get("expiration_date") for t in toks])

for ver in ("07",):
    r = requests.get("https://cmr.earthdata.nasa.gov/search/collections.json",
                     params={"short_name": "GPM_3IMERGDF", "version": ver}, timeout=30)
    entries = r.json()["feed"]["entry"]
    print("CMR collections:", [(e["id"], e.get("data_center"), e.get("cloud_hosted")) for e in entries])

coll = next((e["id"] for e in entries if e.get("cloud_hosted")), entries[0]["id"])
g = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json",
                 params={"collection_concept_id": coll, "temporal": "2024-06-01T00:00:00Z,2024-06-01T23:59:59Z", "page_size": 2},
                 timeout=30).json()["feed"]["entry"]
links = [l["href"] for l in g[0]["links"] if l["href"].startswith("https") and l["href"].endswith(".nc4")]
print("granule links:", links[:3])

hurl = (
    f"https://harmony.earthdata.nasa.gov/{coll}/ogc-api-coverages/1.0.0/collections/precipitation/coverage/rangeset"
    "?subset=lat(51.6:51.9)&subset=lon(14.1:14.5)&subset=time(\"2024-06-01T00:00:00Z\":\"2024-06-03T23:59:59Z\")"
)
t0 = time.time()
r = requests.get(hurl, headers={"Authorization": f"Bearer {T}"}, timeout=240, allow_redirects=False)
ct = r.headers.get("content-type") or ""
print("harmony:", r.status_code, round(time.time() - t0, 1), "s", ct, r.headers.get("location", "")[:140])
print("   ", r.text[:600].replace("\n", " ") if ("json" in ct or "text" in ct) else f"{len(r.content)} bytes binary")
