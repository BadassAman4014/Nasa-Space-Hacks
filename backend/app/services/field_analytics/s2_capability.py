"""
Capability probe for the real Sentinel-2 raster stack.

Reads Cloud-Optimised GeoTIFF assets over HTTP range requests, so the GDAL
python bindings (``rasterio``) and ``pyproj`` must be importable. This module
reports that fact once, so services can return an explicit, honest
"unavailable" state instead of inventing reflectance values.
"""

from __future__ import annotations

import importlib

_required = ("rasterio", "pyproj")

_missing = []
for _name in _required:
    try:
        importlib.import_module(_name)
    except Exception:  # noqa: BLE001 - any import failure means unavailable
        _missing.append(_name)

AVAILABLE: bool = not _missing

if AVAILABLE:
    reason = "rasterio and pyproj are available; real Sentinel-2 reflectance can be read."
else:
    reason = (
        "Real Sentinel-2 reflectance requires {pkgs}. Install them with "
        "`pip install rasterio pyproj`, then restart the API. Until then the "
        "satellite, NDVI, soil-brightness and productivity layers report an "
        "unavailable state rather than fabricated values.".format(
            pkgs=" and ".join(_missing)
        )
    )

MISSING: tuple = tuple(_missing)
