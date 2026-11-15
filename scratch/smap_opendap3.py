"""Is sm_rootzone_pctl ever populated? Check a window around Cottbus and across days; also wetness."""
import io
import os
import urllib.parse

import h5py
import numpy as np
import requests
from dotenv import load_dotenv

load_dotenv("backend/.env")
H = {"Authorization": f"Bearer {os.getenv('EARTHDATA_TOKEN', '').strip()}"}
cid = "C3480440870-NSIDC_CPRD"
x, y = 2081, 172


def read(base, var, y0, y1, x0, x1):
    ce = f"/Geophysical_Data/{var}[{y0}:{y1}][{x0}:{x1}]"
    r = requests.get(base + ".dap.nc4", params={"dap4.ce": ce}, headers=H, timeout=90)
    if r.status_code != 200 or r.content[:4] != b"\x89HDF":
        return None
    out = {}
    with h5py.File(io.BytesIO(r.content), "r") as f:
        f.visititems(lambda n, o: out.update({n: np.array(o)}) if n.endswith(var) and isinstance(o, h5py.Dataset) else None)
    return list(out.values())[0]


for day in ("2026-11-10", "2026-10-15", "2026-09-01", "2026-06-15"):
    g = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json",
                     params={"collection_concept_id": cid, "temporal": f"{day}T11:00:00Z,{day}T13:00:00Z", "page_size": 1}, timeout=30).json()["feed"]["entry"]
    base = f"https://opendap.earthdata.nasa.gov/collections/{cid}/granules/{urllib.parse.quote(g[0]['title'], safe='')}"
    line = [day]
    for var in ("sm_rootzone_pctl", "sm_rootzone_wetness"):
        a = read(base, var, y - 3, y + 3, x - 3, x + 3)
        if a is None:
            line.append(f"{var}: read failed")
            continue
        v = a[a > -9000]
        line.append(f"{var}: {v.size}/{a.size} valid" + (f", cell={float(a[3, 3]):.2f}" if a.shape == (7, 7) else ""))
    print(" | ".join(line))
