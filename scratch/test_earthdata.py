"""Probe Earthdata credentials against subsetting services. Never prints secrets."""
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
U = os.getenv("EARTHDATA_USERNAME", "").strip()
P = os.getenv("EARTHDATA_PASSWORD", "").strip()
T = os.getenv("EARTHDATA_TOKEN", "").strip()

# 1. Bearer token validity (CMR accepts EDL tokens)
r = requests.get("https://urs.earthdata.nasa.gov/api/users/tokens", auth=(U, P), timeout=30)
print("EDL user/pass login:", r.status_code)

# 2. AppEEARS login (point extraction service)
t0 = time.time()
r = requests.post("https://appeears.earthdatacloud.nasa.gov/api/login", auth=(U, P), timeout=60)
print("AppEEARS login:", r.status_code, round(time.time() - t0, 1), "s")
if r.ok:
    tok = r.json()["token"]
    prods = requests.get("https://appeears.earthdatacloud.nasa.gov/api/product", timeout=60).json()
    want = [p for p in prods if p["ProductAndVersion"].startswith(("SPL3SMP_E", "SPL4SMGP", "SPL3SMP."))]
    for p in want:
        print("  product:", p["ProductAndVersion"], "|", p.get("Description", "")[:70], "|", p.get("TemporalExtentEnd"))
    requests.post("https://appeears.earthdatacloud.nasa.gov/api/logout", headers={"Authorization": f"Bearer {tok}"}, timeout=30)

# 3. GES DISC OPeNDAP subset of one GPM IMERG daily file, bearer token
url = (
    "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/2024/06/"
    "3B-DAY.MS.MRG.3IMERG.20240601-S000000-E235959.V07B.nc4.dap.nc4"
    "?dap4.ce=/precipitation[0:1:0][1942:1:1944][717:1:719]"
)
t0 = time.time()
s = requests.Session()
s.headers["Authorization"] = f"Bearer {T}"
r = s.get(url, timeout=90, allow_redirects=True)
print("GES DISC OPeNDAP (token):", r.status_code, len(r.content), "bytes", round(time.time() - t0, 1), "s", r.headers.get("content-type"))
if not r.ok:
    print("  body:", r.text[:200].replace("\n", " "))
