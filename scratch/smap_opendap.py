"""Can SMAP L4 (SPL4SMGP) be subset directly via cloud OPeNDAP at one cell? Never prints secrets."""
import io
import os
import urllib.parse

import requests
from dotenv import load_dotenv

load_dotenv("backend/.env")
T = os.getenv("EARTHDATA_TOKEN", "").strip()
H = {"Authorization": f"Bearer {T}"}

c = requests.get("https://cmr.earthdata.nasa.gov/search/collections.json", params={"short_name": "SPL4SMGP", "version": "008"}, timeout=30).json()["feed"]["entry"]
print("collections:", [(e["id"], e.get("data_center"), e.get("cloud_hosted")) for e in c])
cid = c[0]["id"]
g = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", params={"collection_concept_id": cid, "sort_key": "-start_date", "page_size": 2}, timeout=30).json()["feed"]["entry"]
title = g[0]["title"]
print("latest granule:", title, g[0]["time_start"])
base = f"https://opendap.earthdata.nasa.gov/collections/{cid}/granules/{urllib.parse.quote(title, safe='')}"
r = requests.get(base + ".dmr.xml", headers=H, timeout=60)
print("dmr:", r.status_code)
if r.ok:
    names = [l.strip() for l in r.text.splitlines() if "<Float32 name=" in l and ("rootzone" in l or "surface_temp" in l or l.strip().startswith('<Float32 name="x"') or l.strip().startswith('<Float32 name="y"'))]
    print("\n".join(names[:12]))
else:
    print(r.text[:300].replace("\n", " "))
