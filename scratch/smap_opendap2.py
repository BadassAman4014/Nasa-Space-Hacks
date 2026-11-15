"""One-cell SMAP L4 read via cloud OPeNDAP, cross-checked against AppEEARS values for the same cell and time."""
import csv
import io
import os
import re
import urllib.parse

import h5py
import numpy as np
import requests
from dotenv import load_dotenv

load_dotenv("backend/.env")
H = {"Authorization": f"Bearer {os.getenv('EARTHDATA_TOKEN', '').strip()}"}
cid = "C3480440870-NSIDC_CPRD"

# A granule inside the AppEEARS probe window: 2026-11-10 22:30 UTC
g = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json",
                 params={"collection_concept_id": cid, "temporal": "2026-11-10T21:00:00Z,2026-11-10T23:00:00Z", "page_size": 5}, timeout=30).json()["feed"]["entry"]
title = g[0]["title"]
print("granule:", title)
base = f"https://opendap.earthdata.nasa.gov/collections/{cid}/granules/{urllib.parse.quote(title, safe='')}"

dmr = requests.get(base + ".dmr.xml", headers=H, timeout=60).text
i = dmr.index('name="sm_rootzone_pctl"')
print("pctl decl:", re.sub(r"\s+", " ", dmr[i - 20:i + 420]))

x, y = 2081, 172  # EASE-Grid 2.0 9 km cell of Field 1 (verified against AppEEARS indices)
vals = {}
for var in ("sm_rootzone", "sm_rootzone_pctl", "sm_surface"):
    ce = f"/Geophysical_Data/{var}[{y}][{x}]"
    r = requests.get(base + ".dap.nc4", params={"dap4.ce": ce}, headers=H, timeout=90)
    print(var, "HTTP", r.status_code, len(r.content), "bytes", r.content[:4])
    if r.ok and r.content[:4] == b"\x89HDF":
        with h5py.File(io.BytesIO(r.content), "r") as f:
            def find(n, o):
                if n.endswith(var) and isinstance(o, h5py.Dataset):
                    vals[var] = float(np.array(o).ravel()[0])
            f.visititems(find)
    else:
        print("   ", re.sub(r"<[^>]+>|\s+", " ", r.text)[:300])
print("OPeNDAP values:", vals)

rows = list(csv.DictReader(open("scratch/appeears_out/fieldshift-cottbus-smap-probe-SPL4SMGP-008-results.csv", encoding="utf-8")))
hit = [r for r in rows if r["Date"].startswith("2026-11-10 22:30")]
print("AppEEARS same time:", {k.split("Geophysical_Data_")[-1]: r[k] for r in hit for k in r if "sm_" in k})
