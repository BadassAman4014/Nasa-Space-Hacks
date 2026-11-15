"""Submit a real AppEEARS point request for SMAP at the Cottbus field. Never prints secrets."""
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
U = os.getenv("EARTHDATA_USERNAME", "").strip()
P = os.getenv("EARTHDATA_PASSWORD", "").strip()
API = "https://appeears.earthdatacloud.nasa.gov/api"

for prod in ("SPL3SMP_E.006", "SPL4SMGP.008"):
    layers = requests.get(f"{API}/product/{prod}", timeout=60).json()
    names = [k for k in layers if "soil_moisture" in k.lower() and "error" not in k.lower()]
    print(prod, "->", names[:12])

tok = requests.post(f"{API}/login", auth=(U, P), timeout=60).json()["token"]
H = {"Authorization": f"Bearer {tok}"}
task = {
    "task_type": "point",
    "task_name": "fieldshift_cottbus_smap_probe",
    "params": {
        "dates": [{"startDate": "10-01-2026", "endDate": "11-14-2026"}],
        "layers": [
            {"product": "SPL3SMP_E.006", "layer": "Soil_Moisture_Retrieval_Data_AM_soil_moisture"},
            {"product": "SPL3SMP_E.006", "layer": "Soil_Moisture_Retrieval_Data_PM_soil_moisture_pm"},
            {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_rootzone"},
            {"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_surface"},
        ],
        "coordinates": [{"id": "field-3a860dfdb7", "category": "field", "latitude": 51.78004, "longitude": 14.3014}],
    },
}
r = requests.post(f"{API}/task", json=task, headers=H, timeout=60)
print("submit:", r.status_code, r.text[:400])
if r.ok:
    Path(__file__).with_name("appeears_task.json").write_text(json.dumps(r.json()))
