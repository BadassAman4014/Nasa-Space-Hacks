"""
NASA GPM IMERG client for CMR granule searching, Earthdata downloading, and local caching.
Supports GPM_3IMERGDF.07 (IMERG Final Run V07B daily accumulated precipitation).
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import requests
from app.services.nasa.earthdata_auth import earthdata_auth
from app.services.nasa.common import BRANDENBURG_BBOX

CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "nasa" / "gpm"

class GpmClient:
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
        Search official NASA CMR for GPM IMERG V07B Final Run daily granules.
        """
        params = {
            "short_name": "GPM_3IMERGDF",
            "version": "07",
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
                        if (href.endswith(".nc4") or href.endswith(".HDF5")) and ("gesdisc" in href or "data" in href):
                            download_url = href
                            break
                    granules.append({
                        "granule_id": e.get("title", ""),
                        "time_start": e.get("time_start", ""),
                        "download_url": download_url,
                        "dataset_id": "GPM_3IMERGDF.07",
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
        """Check if GPM NetCDF4/HDF5 is cached locally; if not, download via Earthdata session."""
        target_file = self.cache_dir / f"{granule_id}.nc4"
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

    def fetch_open_gpm_daily(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real GPM IMERG Late Run daily precipitation (GPM_3IMERGDL.07) for the 0.1° cell
        containing the point, read as a one-cell subset from NASA cloud OPeNDAP.
        """
        from app.services.nasa.real.imerg import ImergUnavailable, daily_precipitation

        try:
            series = daily_precipitation(lat, lon, start_date, end_date)
        except ImergUnavailable:
            return []
        obs_list = []
        for d in series["days"]:
            if d["precip_mm"] is None:
                continue
            iso_date = d["date"]
            obs_list.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": d["precip_mm"],
                "minimum_value": d["precip_mm"],
                "maximum_value": d["precip_mm"],
                "unit": "mm",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "satellite estimate (IMERG Late, not gauge-corrected)",
                "source_granule": d["granule"],
            })
        return obs_list

gpm_client = GpmClient()

