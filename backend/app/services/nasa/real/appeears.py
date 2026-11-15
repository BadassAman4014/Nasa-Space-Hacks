"""
NASA AppEEARS client: point extraction (SMAP, MODIS) and field-polygon extraction (ECOSTRESS).

AppEEARS processes requests asynchronously (minutes to an hour), so requests are
submitted once, polled by a background worker, and served from the local cache.
Docs: https://appeears.earthdatacloud.nasa.gov/api/
"""

from __future__ import annotations

import base64
import csv
import io
import logging
import os
import re
import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from dotenv import load_dotenv
from PIL import Image

from app.services.nasa.real.store import point_key, real_store

log = logging.getLogger("fieldshift.appeears")
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

API = "https://appeears.earthdatacloud.nasa.gov/api"

#: Point layers requested for every location. (product, layer)
POINT_LAYERS: List[Tuple[str, str]] = [
    ("SPL3SMP_E.006", "Soil_Moisture_Retrieval_Data_AM_soil_moisture"),
    ("SPL3SMP_E.006", "Soil_Moisture_Retrieval_Data_AM_retrieval_qual_flag"),
    ("SPL3SMP_E.006", "Soil_Moisture_Retrieval_Data_PM_soil_moisture_pm"),
    ("SPL3SMP_E.006", "Soil_Moisture_Retrieval_Data_PM_retrieval_qual_flag_pm"),
    ("SPL4SMGP.008", "Geophysical_Data_sm_rootzone"),
    ("SPL4SMGP.008", "Geophysical_Data_sm_rootzone_pctl"),
    ("SPL4SMGP.008", "Geophysical_Data_sm_surface"),
    ("MOD13Q1.061", "_250m_16_days_NDVI"),
    ("MOD13Q1.061", "_250m_16_days_pixel_reliability"),
]

#: ECOSTRESS evaporative stress index, 70 m, extracted for the field polygon.
AREA_LAYERS: List[Tuple[str, str]] = [
    ("ECO_L4T_ESI.002", "ESI"),
    ("ECO_L4T_ESI.002", "cloud"),
]

FILL_VALUES = {-9999.0, -9999, 65534.0, 65535.0, -3000.0}


class AppeearsError(RuntimeError):
    pass


class AppeearsClient:
    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._token_at = 0.0
        self._lock = threading.Lock()

    # ---- auth ------------------------------------------------------------
    def configured(self) -> bool:
        return bool(os.getenv("EARTHDATA_USERNAME", "").strip() and os.getenv("EARTHDATA_PASSWORD", "").strip())

    def _headers(self) -> Dict[str, str]:
        with self._lock:
            if not self._token or time.time() - self._token_at > 12 * 3600:
                if not self.configured():
                    raise AppeearsError("EARTHDATA_USERNAME / EARTHDATA_PASSWORD are not set.")
                r = requests.post(
                    f"{API}/login",
                    auth=(os.getenv("EARTHDATA_USERNAME", "").strip(), os.getenv("EARTHDATA_PASSWORD", "").strip()),
                    timeout=60,
                )
                if r.status_code != 200:
                    raise AppeearsError(f"AppEEARS login failed (HTTP {r.status_code}).")
                self._token = r.json()["token"]
                self._token_at = time.time()
            return {"Authorization": f"Bearer {self._token}"}

    # ---- submission ------------------------------------------------------
    @staticmethod
    def _fmt(d: str) -> str:
        return datetime.strptime(d, "%Y-%m-%d").strftime("%m-%d-%Y")

    def submit_point(self, lat: float, lon: float, start: str, end: str) -> str:
        key = point_key(lat, lon)
        task = {
            "task_type": "point",
            "task_name": f"fieldshift_point_{key}_{start}_{end}",
            "params": {
                "dates": [{"startDate": self._fmt(start), "endDate": self._fmt(end)}],
                "layers": [{"product": p, "layer": l} for p, l in POINT_LAYERS],
                "coordinates": [{"id": key, "category": "field", "latitude": lat, "longitude": lon}],
            },
        }
        r = requests.post(f"{API}/task", json=task, headers=self._headers(), timeout=60)
        if r.status_code not in (200, 202):
            raise AppeearsError(f"Point task rejected (HTTP {r.status_code}): {r.text[:200]}")
        tid = r.json()["task_id"]
        real_store.add_task(tid, "point", key, start, end, r.json().get("status", "pending"))
        return tid

    def submit_area(self, target_key: str, geometry: Dict[str, Any], start: str, end: str) -> str:
        task = {
            "task_type": "area",
            "task_name": f"fieldshift_area_{target_key}_{start}_{end}",
            "params": {
                "dates": [{"startDate": self._fmt(start), "endDate": self._fmt(end)}],
                "layers": [{"product": p, "layer": l} for p, l in AREA_LAYERS],
                "output": {"format": {"type": "geotiff"}, "projection": "geographic"},
                "geo": {
                    "type": "FeatureCollection",
                    "features": [{"type": "Feature", "properties": {}, "geometry": geometry}],
                },
            },
        }
        r = requests.post(f"{API}/task", json=task, headers=self._headers(), timeout=60)
        if r.status_code not in (200, 202):
            raise AppeearsError(f"Area task rejected (HTTP {r.status_code}): {r.text[:200]}")
        tid = r.json()["task_id"]
        real_store.add_task(tid, "area", target_key, start, end, r.json().get("status", "pending"))
        return tid

    # ---- polling & ingestion -------------------------------------------
    def poll_once(self) -> List[Dict[str, Any]]:
        """Check every open task once; ingest finished ones. Returns status per task."""
        results = []
        for t in real_store.open_tasks():
            tid = t["task_id"]
            try:
                r = requests.get(f"{API}/task/{tid}", headers=self._headers(), timeout=60)
                if r.status_code != 200:
                    real_store.update_task(tid, "error" if r.status_code == 404 else t["status"], f"status HTTP {r.status_code}")
                    continue
                status = r.json().get("status", "unknown")
                if status == "done":
                    n = self._ingest(t)
                    real_store.update_task(tid, "ingested", f"{n} values/rasters stored", completed=True)
                    status = "ingested"
                elif status == "error":
                    real_store.update_task(tid, "error", str(r.json().get("error"))[:300])
                else:
                    real_store.update_task(tid, status)
                results.append({"task_id": tid, "kind": t["kind"], "target": t["target_key"], "status": status})
            except Exception as exc:  # network blips: retried on next poll
                log.warning("AppEEARS poll failed for %s: %s", tid, exc)
                results.append({"task_id": tid, "kind": t["kind"], "target": t["target_key"], "status": f"poll failed: {type(exc).__name__}"})
        return results

    def _bundle(self, tid: str) -> List[Dict[str, Any]]:
        r = requests.get(f"{API}/bundle/{tid}", headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json().get("files", [])

    def _download(self, tid: str, file_id: str) -> bytes:
        r = requests.get(f"{API}/bundle/{tid}/{file_id}", headers=self._headers(), timeout=300, allow_redirects=True)
        r.raise_for_status()
        return r.content

    def _ingest(self, task: Dict[str, Any]) -> int:
        if task["kind"] == "point":
            return self._ingest_point(task)
        return self._ingest_area(task)

    def _ingest_point(self, task: Dict[str, Any]) -> int:
        tid, key = task["task_id"], task["target_key"]
        total = 0
        for f in self._bundle(tid):
            if not f["file_name"].endswith("-results.csv"):
                continue
            text = self._download(tid, f["file_id"]).decode("utf-8")
            rows = list(csv.DictReader(io.StringIO(text)))
            if not rows:
                continue
            out = []
            for product, _layer in POINT_LAYERS:
                prefix = product.replace(".", "_") + "_"
                for col in rows[0]:
                    if not col.startswith(prefix):
                        continue
                    variable = col[len(prefix):]
                    if variable.startswith(("Line_Y", "Sample_X")) or variable.endswith(("_MODLAND", "_VI_Usefulness")):
                        continue
                    if variable not in {l for p, l in POINT_LAYERS if p == product}:
                        continue
                    for row in rows:
                        raw = row.get(col, "")
                        try:
                            v = float(raw)
                        except ValueError:
                            continue
                        val = None if v in FILL_VALUES else v
                        obs_time = row["Date"].replace(" UTC", "").replace(" ", "T")
                        out.append((key, product, variable, obs_time, val, None, f"AppEEARS task {tid}"))
            total += real_store.save_point_values(out)
        return total

    def _ingest_area(self, task: Dict[str, Any]) -> int:
        """Store each ECOSTRESS ESI overpass with enough cloud-free field pixels as a rendered map."""
        import rasterio

        tid, key = task["task_id"], task["target_key"]
        files = self._bundle(tid)
        by_stamp: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for f in files:
            name = f["file_name"]
            if not name.endswith(".tif"):
                continue
            m = re.search(r"_(ESI|cloud)_doy(\d{13})", name)
            if not m:
                continue
            by_stamp.setdefault(m.group(2), {})[m.group(1)] = f
        stored = 0
        for stamp, parts in sorted(by_stamp.items()):
            if "ESI" not in parts:
                continue
            year, doy = int(stamp[:4]), int(stamp[4:7])
            hh, mm = stamp[7:9], stamp[9:11]
            obs_date = (date(year, 1, 1) + timedelta(days=doy - 1)).isoformat()
            with rasterio.MemoryFile(self._download(tid, parts["ESI"]["file_id"])) as mf, mf.open() as ds:
                esi = ds.read(1).astype("float64")
                nod = ds.nodata
                b = ds.bounds
            valid = np.isfinite(esi) & (esi >= 0) & (esi <= 2.0)
            if nod is not None:
                valid &= esi != nod
            if "cloud" in parts:
                with rasterio.MemoryFile(self._download(tid, parts["cloud"]["file_id"])) as mf, mf.open() as ds:
                    cloud = ds.read(1)
                valid &= cloud == 0
            if valid.sum() < 4:
                continue
            values = esi[valid]
            payload = {
                "product": "ECO_L4T_ESI.002",
                "variable": "ESI",
                "overpass_utc": f"{obs_date}T{hh}:{mm}Z",
                "bounds": [[b.bottom, b.left], [b.top, b.right]],
                "valid_pixels": int(valid.sum()),
                "total_pixels": int(valid.size),
                "mean": round(float(values.mean()), 3),
                "p10": round(float(np.percentile(values, 10)), 3),
                "p90": round(float(np.percentile(values, 90)), 3),
                "png": _render_esi(esi, valid),
            }
            real_store.save_raster(key, "ECO_L4T_ESI.002", payload["overpass_utc"], payload, f"AppEEARS task {tid}")
            stored += 1
        return stored


#: ESI colour classes: low ratio of actual to potential ET = water stress.
ESI_CLASSES = [(0.0, (190, 30, 45)), (0.3, (240, 170, 40)), (0.6, (70, 160, 90)), (0.85, (40, 110, 180))]


def _render_esi(esi: np.ndarray, valid: np.ndarray) -> str:
    h, w = esi.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    for thr, colour in ESI_CLASSES:
        sel = valid & (esi >= thr)
        rgba[sel, :3] = colour
    rgba[valid, 3] = 200
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").resize((w * 4, h * 4), Image.NEAREST).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


appeears = AppeearsClient()


class AppeearsWorker:
    """Background thread polling AppEEARS every 60 s while tasks are open."""

    def __init__(self, interval_s: int = 60):
        self.interval_s = interval_s
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="appeears-worker", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while True:
            try:
                if real_store.open_tasks():
                    appeears.poll_once()
            except Exception as exc:
                log.warning("AppEEARS worker error: %s", exc)
            time.sleep(self.interval_s)


appeears_worker = AppeearsWorker()
