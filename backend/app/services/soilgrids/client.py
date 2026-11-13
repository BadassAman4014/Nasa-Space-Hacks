"""
Client for official ISRIC SoilGrids data acquisition and local raster caching.
Downloads and manages official 250m SoilGrids GeoTIFF tiles from files.isric.org.
"""

import os
import time
from pathlib import Path
from typing import Any, Optional
import requests
from app.services.soilgrids.schemas import SoilVariableKey, SoilDepthKey, VariableMetadata

BASE_URL = "https://files.isric.org/soilgrids/latest/data"
DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "soilgrids"
TILES_CACHE_DIR = DATA_DIR / "tiles"

# Official SoilGrids v2.0 Properties Metadata
SOILGRIDS_VARIABLES: dict[str, dict[str, Any]] = {
    "phh2o": {
        "name": "Soil pH in H2O",
        "mapped_unit": "pH*10",
        "conventional_unit": "pH",
        "scale_factor": 0.1,
        "description": "Soil pH measured in water solution (scale 0.1)",
    },
    "soc": {
        "name": "Soil Organic Carbon",
        "mapped_unit": "dg/kg",
        "conventional_unit": "g/kg",
        "scale_factor": 0.1,
        "description": "Soil organic carbon content in fine earth (< 2mm) (10 dg/kg = 1 g/kg)",
    },
    "clay": {
        "name": "Clay Content",
        "mapped_unit": "g/kg",
        "conventional_unit": "%",
        "scale_factor": 0.1,
        "description": "Proportion of clay particles (< 0.002 mm) (10 g/kg = 1%)",
    },
    "sand": {
        "name": "Sand Content",
        "mapped_unit": "g/kg",
        "conventional_unit": "%",
        "scale_factor": 0.1,
        "description": "Proportion of sand particles (0.05 - 2.0 mm) (10 g/kg = 1%)",
    },
    "silt": {
        "name": "Silt Content",
        "mapped_unit": "g/kg",
        "conventional_unit": "%",
        "scale_factor": 0.1,
        "description": "Proportion of silt particles (0.002 - 0.05 mm) (10 g/kg = 1%)",
    },
    "bdod": {
        "name": "Bulk Density",
        "mapped_unit": "cg/cm³",
        "conventional_unit": "g/cm³",
        "scale_factor": 0.01,
        "description": "Bulk density of the fine earth fraction (100 cg/cm³ = 1 g/cm³)",
    },
    "cec": {
        "name": "Cation Exchange Capacity",
        "mapped_unit": "mmol(c)/kg",
        "conventional_unit": "mmol(c)/kg",
        "scale_factor": 1.0,
        "description": "Cation exchange capacity of soil at pH 7",
    },
    "nitrogen": {
        "name": "Total Nitrogen",
        "mapped_unit": "cg/kg",
        "conventional_unit": "g/kg",
        "scale_factor": 0.01,
        "description": "Total nitrogen in fine earth (100 cg/kg = 1 g/kg)",
    },
}

SUPPORTED_DEPTHS: list[str] = [
    "0-5cm",
    "5-15cm",
    "15-30cm",
    "30-60cm",
    "60-100cm",
    "100-200cm",
]

# Standard Brandenburg Homolosine Tile Definitions from official VRT
# Pixel size = 250m, Tile size = 600 x 600 pixels = 150km x 150km
# X_origin = -19949750 + xOff * 250, Y_origin = 8361000 - yOff * 250
BRANDENBURG_TILES: list[dict[str, Any]] = [
    {
        "tile_id": "tileSG-006-049_1-1",
        "subpath": "tileSG-006-049/tileSG-006-049_1-1.tif",
        "x_off": 87849.0,
        "y_off": 9841.0,
        "x_min": 2012500.0,
        "x_max": 2162500.0,
        "y_min": 5750750.0,
        "y_max": 5900750.0,
        "description": "North Potsdam, Berlin, Havelland, Barnim (North-Central Brandenburg)",
    },
    {
        "tile_id": "tileSG-006-049_2-1",
        "subpath": "tileSG-006-049/tileSG-006-049_2-1.tif",
        "x_off": 87849.0,
        "y_off": 10291.0,
        "x_min": 2012500.0,
        "x_max": 2162500.0,
        "y_min": 5675750.0,
        "y_max": 5788250.0,
        "description": "Potsdam, Teltow-Fläming, Dahme-Spreewald (Central-South Brandenburg)",
    },
    {
        "tile_id": "tileSG-006-048_1-3",
        "subpath": "tileSG-006-048/tileSG-006-048_1-3.tif",
        "x_off": 87249.0,
        "y_off": 9841.0,
        "x_min": 1862500.0,
        "x_max": 2012500.0,
        "y_min": 5750750.0,
        "y_max": 5900750.0,
        "description": "Brandenburg an der Havel, West Havelland (West Brandenburg)",
    },
    {
        "tile_id": "tileSG-006-049_1-2",
        "subpath": "tileSG-006-049/tileSG-006-049_1-2.tif",
        "x_off": 88449.0,
        "y_off": 9841.0,
        "x_min": 2162500.0,
        "x_max": 2312500.0,
        "y_min": 5750750.0,
        "y_max": 5900750.0,
        "description": "Frankfurt (Oder), Oder-Spree, Märkisch-Oderland (East Brandenburg)",
    },
    {
        "tile_id": "tileSG-006-049_2-2",
        "subpath": "tileSG-006-049/tileSG-006-049_2-2.tif",
        "x_off": 88449.0,
        "y_off": 10441.0,
        "x_min": 2162500.0,
        "x_max": 2312500.0,
        "y_min": 5600750.0,
        "y_max": 5750750.0,
        "description": "Cottbus, Spree-Neiße, Oberspreewald-Lausitz (Southeast Brandenburg)",
    },
    {
        "tile_id": "tileSG-006-048_2-3",
        "subpath": "tileSG-006-048/tileSG-006-048_2-3.tif",
        "x_off": 87249.0,
        "y_off": 10441.0,
        "x_min": 1862500.0,
        "x_max": 2012500.0,
        "y_min": 5600750.0,
        "y_max": 5750750.0,
        "description": "Elbe-Elster, Fläming (Southwest Brandenburg)",
    },
    {
        "tile_id": "tileSG-005-049_3-1",
        "subpath": "tileSG-005-049/tileSG-005-049_3-1.tif",
        "x_off": 87849.0,
        "y_off": 9241.0,
        "x_min": 2012500.0,
        "x_max": 2162500.0,
        "y_min": 5900750.0,
        "y_max": 6050750.0,
        "description": "Oberhavel, Uckermark (North-Central Brandenburg)",
    },
    {
        "tile_id": "tileSG-005-048_3-3",
        "subpath": "tileSG-005-048/tileSG-005-048_3-3.tif",
        "x_off": 87249.0,
        "y_off": 9241.0,
        "x_min": 1862500.0,
        "x_max": 2012500.0,
        "y_min": 5900750.0,
        "y_max": 6050750.0,
        "description": "Prignitz, Ostprignitz-Ruppin (Northwest Brandenburg)",
    },
    {
        "tile_id": "tileSG-005-049_3-2",
        "subpath": "tileSG-005-049/tileSG-005-049_3-2.tif",
        "x_off": 88449.0,
        "y_off": 9241.0,
        "x_min": 2162500.0,
        "x_max": 2312500.0,
        "y_min": 5900750.0,
        "y_max": 6050750.0,
        "description": "Uckermark Northeast (Northeast Brandenburg)",
    },
]

class SoilGridsClient:
    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or TILES_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def check_availability(self) -> dict[str, Any]:
        """Test official SoilGrids WebDAV service availability."""
        url = f"{BASE_URL}/README.md"
        try:
            r = requests.head(url, timeout=5)
            available = r.status_code == 200
            return {
                "status": "ready" if available else "degraded",
                "available": available,
                "url": BASE_URL,
                "dataset_version": "2.0.0",
                "attribution": "ISRIC - World Soil Information, CC-BY 4.0",
            }
        except Exception as e:
            return {
                "status": "offline",
                "available": False,
                "url": BASE_URL,
                "error": str(e),
                "dataset_version": "2.0.0",
                "attribution": "ISRIC - World Soil Information, CC-BY 4.0",
            }

    def get_supported_variables(self) -> list[VariableMetadata]:
        """Return list of supported soil variables with metadata."""
        return [
            VariableMetadata(
                key=k,
                name=v["name"],
                mapped_unit=v["mapped_unit"],
                conventional_unit=v["conventional_unit"],
                scale_factor=v["scale_factor"],
                description=v["description"],
            )
            for k, v in SOILGRIDS_VARIABLES.items()
        ]

    def find_intersecting_tiles(self, min_x: float, min_y: float, max_x: float, max_y: float) -> list[dict[str, Any]]:
        """
        Find Brandenburg tiles intersecting a bounding box in Homolosine projection (meters).
        """
        matched = []
        for t in BRANDENBURG_TILES:
            # Check overlap between [min_x, max_x] and [t.x_min, t.x_max], and [min_y, max_y] and [t.y_min, t.y_max]
            overlap_x = max(min_x, t["x_min"]) <= min(max_x, t["x_max"])
            overlap_y = max(min_y, t["y_min"]) <= min(max_y, t["y_max"])
            if overlap_x and overlap_y:
                matched.append(t)
        return matched

    def get_tile_file(
        self,
        property_name: str,
        depth: str,
        tile_info: dict[str, Any],
        max_retries: int = 2,
        timeout: int = 25,
    ) -> Optional[Path]:
        """
        Get path to cached GeoTIFF tile, downloading it if not yet locally cached.
        """
        prop_dir = self.cache_dir / property_name
        prop_dir.mkdir(parents=True, exist_ok=True)

        tile_filename = f"{property_name}_{depth}_{tile_info['tile_id']}.tif"
        cached_path = prop_dir / tile_filename

        if cached_path.exists() and cached_path.stat().st_size > 1000:
            return cached_path

        # URL construction: e.g. https://files.isric.org/soilgrids/latest/data/phh2o/phh2o_0-5cm_mean/tileSG-006-049/tileSG-006-049_1-1.tif
        url = f"{BASE_URL}/{property_name}/{property_name}_{depth}_mean/{tile_info['subpath']}"

        for attempt in range(max_retries + 1):
            try:
                r = requests.get(url, timeout=timeout)
                if r.status_code == 200 and len(r.content) > 1000:
                    with open(cached_path, "wb") as f:
                        f.write(r.content)
                    return cached_path
            except Exception:
                if attempt < max_retries:
                    time.sleep(1.0)
                else:
                    break

        return None if not cached_path.exists() else cached_path

soilgrids_client = SoilGridsClient()
