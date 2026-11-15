"""
SMAP L4 (SPL4SMGP.008) root-zone and surface soil moisture for one 9 km EASE-Grid 2.0 cell,
read directly from NASA's cloud OPeNDAP service (one-cell subsets, ~15 KB each, no queue).

The product's own percentile layer (sm_rootzone_pctl) is mostly fill values, including over
Cottbus, so the percentile is computed here: today's root-zone value is ranked against the
same cell's values within +-15 days of the same date in 2016..previous year (one 10:30 UTC
granule per day). Values are model output that assimilates SMAP brightness temperatures.
"""

from __future__ import annotations

import io
import logging
import os
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from pyproj import Transformer

from app.services.nasa.real.store import point_key, real_store

log = logging.getLogger("fieldshift.smap_l4")
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

COLLECTION = "C3480440870-NSIDC_CPRD"
PRODUCT = "SPL4SMGP.008"
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
OPENDAP = "https://opendap.earthdata.nasa.gov/collections/{cid}/granules/{gid}.dap.nc4"
VAR_RZ = "Geophysical_Data_sm_rootzone"
VAR_SF = "Geophysical_Data_sm_surface"
CLIM_FIRST_YEAR = 2016
CLIM_HALF_WINDOW_DAYS = 15
MIN_CLIM_SAMPLES = 100

# EASE-Grid 2.0 Global, 9 km. Origin and cell size verified against the Sample_X/Line_Y
# indices NASA AppEEARS returned for the same coordinates (cell 2081, 172 for Cottbus).
_T = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
_CELL_M = 9008.055
_X0, _Y0 = -17367530.445, 7314540.830


class SmapUnavailable(RuntimeError):
    pass


def cell_index(lat: float, lon: float) -> Tuple[int, int]:
    x, y = _T.transform(lon, lat)
    return int((x - _X0) // _CELL_M), int((_Y0 - y) // _CELL_M)


def _titles(start: date, end: date) -> Dict[str, str]:
    """Map YYYY-MM-DD -> the 10:30 UTC granule title for that day."""
    out: Dict[str, str] = {}
    r = requests.get(
        CMR,
        params={"collection_concept_id": COLLECTION, "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z", "page_size": 2000},
        timeout=60,
    )
    r.raise_for_status()
    for e in r.json()["feed"]["entry"]:
        m = re.search(r"_(\d{4})(\d{2})(\d{2})T103000_", e["title"])
        if m:
            out[f"{m.group(1)}-{m.group(2)}-{m.group(3)}"] = e["title"]
    return out


def _read(title: str, x: int, y: int, token: str) -> Tuple[float, float]:
    import h5py
    import numpy as np

    url = OPENDAP.format(cid=COLLECTION, gid=urllib.parse.quote(title, safe=""))
    ce = f"/Geophysical_Data/sm_rootzone[{y}][{x}];/Geophysical_Data/sm_surface[{y}][{x}]"
    r = requests.get(url, params={"dap4.ce": ce}, headers={"Authorization": f"Bearer {token}"}, timeout=90)
    if r.status_code != 200 or r.content[:4] != b"\x89HDF":
        raise SmapUnavailable(f"OPeNDAP HTTP {r.status_code}")
    got: Dict[str, float] = {}
    with h5py.File(io.BytesIO(r.content), "r") as f:
        f.visititems(
            lambda n, o: got.update({n.split("/")[-1]: float(np.array(o).ravel()[0])})
            if hasattr(o, "shape") and n.split("/")[-1] in ("sm_rootzone", "sm_surface")
            else None
        )
    return got["sm_rootzone"], got["sm_surface"]


def _snapshots(key: str, start: str, end: str, var: str = VAR_RZ) -> List[Dict[str, Any]]:
    """Stored values at the 10:30 UTC snapshot only, so every day is compared like with like."""
    return [r for r in real_store.get_point_values(key, PRODUCT, var, start, end) if r["value"] is not None and r["obs_time"][11:16] == "10:30"]


def _have(key: str, start: str, end: str) -> set:
    return {r["obs_time"][:10] for r in _snapshots(key, start, end)}


def ensure_days(lat: float, lon: float, days: List[date], workers: int = 6) -> int:
    """Fetch and cache the 10:30 UTC L4 value for each missing day. Returns number of new values."""
    token = os.getenv("EARTHDATA_TOKEN", "").strip()
    if not token:
        raise SmapUnavailable("EARTHDATA_TOKEN is not set.")
    key = point_key(lat, lon)
    x, y = cell_index(lat, lon)
    days = sorted(set(d for d in days if d <= date.today() - timedelta(days=3)))
    if not days:
        return 0
    have = _have(key, days[0].isoformat(), days[-1].isoformat())
    todo = [d for d in days if d.isoformat() not in have]
    if not todo:
        return 0
    # one CMR query per calendar year touched
    titles: Dict[str, str] = {}
    for yr in sorted({d.year for d in todo}):
        ys = [d for d in todo if d.year == yr]
        titles.update(_titles(ys[0], ys[-1]))

    def work(d: date):
        t = titles.get(d.isoformat())
        if not t:
            return None
        try:
            rz, sf = _read(t, x, y, token)
        except Exception as exc:
            log.warning("SMAP L4 %s: %s", d, exc)
            return None
        ts = f"{d.isoformat()}T10:30:00"
        ref = f"NASA SMAP L4 granule {t} (cell x={x}, y={y})"
        rows = []
        if 0.0 <= rz <= 0.9:
            rows.append((key, PRODUCT, VAR_RZ, ts, rz, None, ref))
        if 0.0 <= sf <= 0.9:
            rows.append((key, PRODUCT, VAR_SF, ts, sf, None, ref))
        return rows

    stored = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for rows in pool.map(work, todo):
            if rows:
                stored += real_store.save_point_values(rows)
    return stored


def percentile_for(lat: float, lon: float, on: date) -> Dict[str, Any]:
    """Percentile of the root-zone value on `on` against the same season in earlier years."""
    key = point_key(lat, lon)
    clim_days: List[date] = []
    for yr in range(CLIM_FIRST_YEAR, on.year):
        centre = date(yr, on.month, min(on.day, 28)) if on.month == 2 else date(yr, on.month, on.day)
        clim_days += [centre + timedelta(days=k) for k in range(-CLIM_HALF_WINDOW_DAYS, CLIM_HALF_WINDOW_DAYS + 1)]
    ensure_days(lat, lon, clim_days + [on])
    current = _snapshots(key, on.isoformat(), on.isoformat())
    if not current:
        raise SmapUnavailable(f"No SMAP L4 value for {on}.")
    value = current[0]["value"]
    clim = []
    for d in clim_days:
        clim += [r["value"] for r in _snapshots(key, d.isoformat(), d.isoformat())]
    if len(clim) < MIN_CLIM_SAMPLES:
        raise SmapUnavailable(f"Only {len(clim)} climatology samples found (need {MIN_CLIM_SAMPLES}).")
    below = sum(1 for v in clim if v < value)
    equal = sum(1 for v in clim if v == value)
    pct = 100.0 * (below + 0.5 * equal) / len(clim)
    clim_sorted = sorted(clim)
    return {
        "date": on.isoformat(),
        "rootzone_m3m3": round(value, 4),
        "percentile": round(pct, 1),
        "climatology_samples": len(clim),
        "climatology_years": f"{CLIM_FIRST_YEAR}-{on.year - 1}",
        "climatology_median_m3m3": round(clim_sorted[len(clim_sorted) // 2], 4),
        "climatology_p10_m3m3": round(clim_sorted[int(0.1 * (len(clim_sorted) - 1))], 4),
        "climatology_p90_m3m3": round(clim_sorted[int(0.9 * (len(clim_sorted) - 1))], 4),
        "source_ref": current[0]["source_ref"],
        "cell": cell_index(lat, lon),
    }


def latest_available_day() -> date:
    """Newest day with a 10:30 UTC granule (L4 lags real time by ~3-4 days)."""
    r = requests.get(
        CMR,
        params={"collection_concept_id": COLLECTION, "sort_key": "-start_date", "page_size": 20},
        timeout=30,
    )
    r.raise_for_status()
    days = []
    for e in r.json()["feed"]["entry"]:
        m = re.search(r"_(\d{4})(\d{2})(\d{2})T103000_", e["title"])
        if m:
            days.append(date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
    if not days:
        raise SmapUnavailable("No recent SMAP L4 granules found.")
    return max(days)
