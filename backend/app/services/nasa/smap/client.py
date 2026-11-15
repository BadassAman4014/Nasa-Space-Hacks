"""
NASA SMAP client for CMR granule searching, Earthdata downloading, and local caching.
Supports SPL3SMP_E.006 (Enhanced L3 Radiometer Global Daily 9 km EASE-Grid Soil Moisture).
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
import requests
from app.services.nasa.earthdata_auth import earthdata_auth
from app.services.nasa.common import BRANDENBURG_BBOX

CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "nasa" / "smap"

class SmapClient:
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or DATA_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.auth = earthdata_auth

    def search_cmr_granules(
        self,
        start_date: str,
        end_date: str,
        bbox: tuple[float, float, float, float] = BRANDENBURG_BBOX,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Search official NASA CMR (Common Metadata Repository) for SPL3SMP_E.006 granules.
        """
        params = {
            "short_name": "SPL3SMP_E",
            "version": "006",
            "bounding_box": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
            "temporal": f"{start_date}T00:00:00Z,{end_date}T23:59:59Z",
            "page_size": limit,
            "sort_key": "start_date",
        }
        try:
            r = requests.get(CMR_SEARCH_URL, params=params, timeout=15)
            if r.status_code == 200:
                entries = r.json().get("feed", {}).get("entry", [])
                granules = []
                for e in entries:
                    download_url = None
                    for link in e.get("links", []):
                        href = link.get("href", "")
                        if href.endswith(".h5") and "datapool" in href or "data" in href:
                            download_url = href
                            break
                    granules.append({
                        "granule_id": e.get("title", ""),
                        "time_start": e.get("time_start", ""),
                        "download_url": download_url,
                        "dataset_id": "SPL3SMP_E.006",
                    })
                return granules
        except Exception:
            pass
        return []

    def get_local_or_download_granule(
        self,
        granule_id: str,
        download_url: Optional[str] = None,
    ) -> Optional[Path]:
        """
        Check if SMAP HDF5 granule is cached locally; if not and Earthdata auth is configured, download it.
        """
        target_file = self.cache_dir / f"{granule_id}.h5"
        if target_file.exists() and target_file.stat().st_size > 1000:
            return target_file

        if not download_url or not self.auth.is_configured:
            return None if not target_file.exists() else target_file

        session = self.auth.create_session()
        try:
            r = session.get(download_url, stream=True, timeout=30)
            if r.status_code == 200:
                with open(target_file, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
                        f.write(chunk)
                return target_file
        except Exception:
            pass

        return None if not target_file.exists() else target_file

    def fetch_open_smap_daily(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real SMAP L3 Enhanced (SPL3SMP_E.006) surface soil moisture for the 9 km cell
        containing the point, extracted by NASA AppEEARS. Only retrievals flagged
        "recommended quality" are returned. If AppEEARS has not finished yet, a task is
        queued and whatever is already cached is returned (possibly nothing).
        """
        from app.services.nasa.real import series

        series.ensure_point_data(lat, lon, start_date, end_date)
        by_day: dict[str, list[dict[str, Any]]] = {}
        for row in series.smap_measured(lat, lon, start_date, end_date):
            if row["used"]:
                by_day.setdefault(row["date"], []).append(row)
        obs_list = []
        for iso_date, passes in sorted(by_day.items()):
            values = [p["value_m3m3"] for p in passes]
            obs_list.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": round(sum(values) / len(values), 4),
                "minimum_value": min(values),
                "maximum_value": max(values),
                "unit": "m³/m³",
                "valid_pixel_count": len(values),
                "coverage_percentage": 100.0,
                "quality_status": "recommended",
                "source_granule": passes[0]["source_ref"] + " (" + ", ".join(p["pass"] for p in passes) + ")",
            })
        return obs_list

smap_client = SmapClient()

