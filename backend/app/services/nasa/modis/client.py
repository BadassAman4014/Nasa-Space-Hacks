"""
NASA MODIS client for CMR granule searching, Earthdata downloading, and local caching.
Supports MOD13Q1.061 (Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid, Tile h18v03).
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import numpy as np
import requests
from app.services.nasa.earthdata_auth import earthdata_auth
from app.services.nasa.common import BRANDENBURG_BBOX

CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "nasa" / "modis"

class ModisClient:
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
        Search official NASA CMR for MOD13Q1.061 16-day vegetation granules covering Brandenburg (Tile h18v03).
        """
        params = {
            "short_name": "MOD13Q1",
            "version": "061",
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
                        if (href.endswith(".hdf") or href.endswith(".h5")) and "lpdaac" in href:
                            download_url = href
                            break
                    granules.append({
                        "granule_id": e.get("title", ""),
                        "time_start": e.get("time_start", ""),
                        "download_url": download_url,
                        "dataset_id": "MOD13Q1.061",
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
        """Check if MODIS HDF is cached locally; if not, download via Earthdata session."""
        target_file = self.cache_dir / f"{granule_id}.hdf"
        if target_file.exists() and target_file.stat().st_size > 1000:
            return target_file

        if not download_url or not self.auth.is_configured:
            return None if not target_file.exists() else target_file

        session = self.auth.create_session()
        try:
            r = session.get(download_url, stream=True, timeout=40)
            if r.status_code == 200:
                with open(target_file, "wb") as f:
                    for chunk in r.iter_content(chunk_size=65536):
                        f.write(chunk)
                return target_file
        except Exception:
            pass

        return None if not target_file.exists() else target_file

    def fetch_open_modis_composites(
        self,
        lat: float,
        lon: float,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        """
        Real MODIS MOD13Q1.061 16-day NDVI at 250 m for the pixel containing the point,
        extracted by NASA AppEEARS together with the SMAP request. Composites with
        pixel reliability worse than "marginal" are dropped.
        """
        from app.services.nasa.real import series

        series.ensure_point_data(lat, lon, start_date, end_date)
        composites = []
        for row in series.modis_ndvi(lat, lon, start_date, end_date):
            if not row["used"]:
                continue
            iso_date = row["date"]
            composites.append({
                "observation_date": iso_date,
                "period_start": f"{iso_date}T00:00:00Z",
                "period_end": f"{iso_date}T23:59:59Z",
                "mean_value": row["ndvi"],
                "minimum_value": row["ndvi"],
                "maximum_value": row["ndvi"],
                "unit": "index (-0.2 to 1.0)",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "good" if row["reliability"] == 0 else "marginal",
                "source_granule": row["source_ref"],
                "metadata": {"product": "MOD13Q1.061", "pixel_reliability": row["reliability"]},
            })
        return composites

modis_client = ModisClient()
