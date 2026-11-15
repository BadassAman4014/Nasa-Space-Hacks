"""
GPM IMERG Late Run daily precipitation (GPM_3IMERGDL.07) for one 0.1° grid cell.

Each day is fetched as a one-cell OPeNDAP subset from NASA's cloud OPeNDAP
service (a few KB instead of a 30 MB global file). IMERG Late is satellite-only
(not gauge-corrected) and is available about one day after observation.
The Final Run (gauge-corrected) lags by months, so it is not used for recent data.
"""

from __future__ import annotations

import io
import logging
import math
import os
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

from app.services.nasa.real.store import real_store

log = logging.getLogger("fieldshift.imerg")
load_dotenv(Path(__file__).resolve().parents[4] / ".env")

COLLECTION = "C2723754859-GES_DISC"  # GPM_3IMERGDL.07, cloud-hosted
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
OPENDAP = "https://opendap.earthdata.nasa.gov/collections/{cid}/granules/{gid}.dap.nc4"
PRODUCT = "GPM_3IMERGDL.07"


class ImergUnavailable(RuntimeError):
    pass


def cell_index(lat: float, lon: float) -> tuple[int, int]:
    """Index of the 0.1° IMERG cell containing the point (grid edges at -180/-90)."""
    lon_i = int(math.floor((lon + 180.0) / 0.1 + 1e-9))
    lat_i = int(math.floor((lat + 90.0) / 0.1 + 1e-9))
    return min(3599, max(0, lon_i)), min(1799, max(0, lat_i))


def _granules(start: str, end: str) -> Dict[str, str]:
    """Map YYYY-MM-DD -> newest granule title for that day."""
    out: Dict[str, str] = {}
    page = 1
    while True:
        r = requests.get(
            CMR,
            params={
                "collection_concept_id": COLLECTION,
                "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
                "page_size": 2000,
                "page_num": page,
            },
            timeout=60,
        )
        r.raise_for_status()
        entries = r.json()["feed"]["entry"]
        for e in entries:
            day = e["time_start"][:10]
            if day not in out or e["title"] > out[day]:
                out[day] = e["title"]
        if len(entries) < 2000:
            break
        page += 1
    return out


def _fetch_day(title: str, lon_i: int, lat_i: int, token: str) -> Optional[float]:
    import h5py
    import numpy as np

    url = OPENDAP.format(cid=COLLECTION, gid=urllib.parse.quote(title, safe=""))
    ce = f"/precipitation[0:1:0][{lon_i}:1:{lon_i}][{lat_i}:1:{lat_i}]"
    r = requests.get(url, params={"dap4.ce": ce}, headers={"Authorization": f"Bearer {token}"}, timeout=90)
    if r.status_code != 200 or r.content[:4] != b"\x89HDF":
        raise ImergUnavailable(f"OPeNDAP HTTP {r.status_code}")
    with h5py.File(io.BytesIO(r.content), "r") as f:
        v = float(np.array(f["precipitation"]).ravel()[0])
    return None if (not math.isfinite(v) or v < 0) else round(v, 2)


def daily_precipitation(lat: float, lon: float, start: str, end: str, workers: int = 8) -> Dict[str, Any]:
    """
    Daily precipitation (mm) for the IMERG cell containing the point.
    Missing days are fetched and cached; days IMERG has not published yet are reported as missing.
    """
    lon_i, lat_i = cell_index(lat, lon)
    cell_key = f"{lon_i}_{lat_i}"
    cell_lat = round(-90.0 + (lat_i + 0.5) * 0.1, 2)
    cell_lon = round(-180.0 + (lon_i + 0.5) * 0.1, 2)
    cached = real_store.get_imerg(cell_key, start, end)

    wanted: List[str] = []
    d = date.fromisoformat(start)
    while d <= date.fromisoformat(end):
        wanted.append(d.isoformat())
        d += timedelta(days=1)
    missing = [day for day in wanted if day not in cached]

    errors: List[str] = []
    if missing:
        token = os.getenv("EARTHDATA_TOKEN", "").strip()
        if not token:
            raise ImergUnavailable("EARTHDATA_TOKEN is not set.")
        titles = _granules(min(missing), max(missing))
        todo = [(day, titles[day]) for day in missing if day in titles]
        new_rows = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(_fetch_day, t, lon_i, lat_i, token): (day, t) for day, t in todo}
            for fut in as_completed(futs):
                day, title = futs[fut]
                try:
                    new_rows.append((cell_key, day, fut.result(), title, cell_lat, cell_lon))
                except Exception as exc:
                    errors.append(f"{day}: {exc}")
        if new_rows:
            real_store.save_imerg(new_rows)
            cached = real_store.get_imerg(cell_key, start, end)

    days = [
        {"date": day, "precip_mm": cached[day]["precip_mm"], "granule": cached[day]["granule"]}
        for day in wanted
        if day in cached
    ]
    return {
        "product": PRODUCT,
        "provenance": "satellite_estimate",
        "description": "NASA GPM IMERG Late Run daily precipitation, satellite-only estimate (not gauge-corrected).",
        "cell": {"lat": cell_lat, "lon": cell_lon, "size_deg": 0.1},
        "days": days,
        "missing_days": [day for day in wanted if day not in cached],
        "errors": errors[:5],
    }


def days_since_rain(series: Dict[str, Any], threshold_mm: float = 1.0) -> Optional[int]:
    days = [d for d in series["days"] if d["precip_mm"] is not None]
    if not days:
        return None
    last = date.fromisoformat(days[-1]["date"])
    for d in reversed(days):
        if d["precip_mm"] >= threshold_mm:
            return (last - date.fromisoformat(d["date"])).days
    return None
