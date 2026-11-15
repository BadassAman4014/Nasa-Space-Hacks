"""Cloud OPeNDAP subset of IMERG daily with EDL bearer token. Never prints secrets."""
import io
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
T = os.getenv("EARTHDATA_TOKEN", "").strip()
H = {"Authorization": f"Bearer {T}"}

gid = "GPM_3IMERGDF.07%3A3B-DAY.MS.MRG.3IMERG.20240601-S000000-E235959.V07B.nc4"
base = f"https://opendap.earthdata.nasa.gov/collections/C2723754864-GES_DISC/granules/{gid}"

# lon index: (lon + 179.95) / 0.1 ; lat index: (lat + 89.95) / 0.1  (cell centres)
lon_i = round((14.31 + 179.95) / 0.1)
lat_i = round((51.76 + 89.95) / 0.1)
print("indices lon,lat:", lon_i, lat_i)

t0 = time.time()
r = requests.get(base + ".dmr.xml", headers=H, timeout=60)
print("dmr:", r.status_code, round(time.time() - t0, 1), "s")
for line in r.text.splitlines():
    if "Dim name" in line or ('<Float32 name="precipitation"' in line) or ('<Float32 name="lat"' in line) or ('<Float32 name="lon"' in line) or ('Dimension name' in line):
        print("   ", line.strip()[:140])

ce = f"/precipitation[0:1:0][{lon_i-1}:1:{lon_i+1}][{lat_i-1}:1:{lat_i+1}];/lat[{lat_i-1}:1:{lat_i+1}];/lon[{lon_i-1}:1:{lon_i+1}]"
t0 = time.time()
r = requests.get(base + ".dap.nc4", params={"dap4.ce": ce}, headers=H, timeout=120)
print("subset:", r.status_code, len(r.content), "bytes", round(time.time() - t0, 1), "s", r.headers.get("content-type"))
if r.ok and r.content[:4] == b"\x89HDF":
    import h5py
    import numpy as np
    with h5py.File(io.BytesIO(r.content), "r") as f:
        print("   vars:", list(f.keys()))
        print("   lat:", np.array(f["lat"])[:], "lon:", np.array(f["lon"])[:])
        print("   precip mm/day:", np.array(f["precipitation"]).round(2).tolist())
else:
    print("   ", r.text[:300])
