"""
In-field map overlays from real imagery.

- Moisture gradient: ECOSTRESS Evaporative Stress Index (70 m) when a recent cloud-free
  overpass exists; otherwise Sentinel-2 NDMI (20 m), which measures plant water content.
- Nitrogen uptake zones: Sentinel-2 red-edge NDRE (20 m), relative within the field, only
  when the field has an active canopy (NDVI >= 0.4). On bare soil NDRE says nothing about N.

Rasters are resampled onto a north-up EPSG:4326 grid so Leaflet can place them exactly.
"""

from __future__ import annotations

import base64
import io
import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from PIL import Image
from shapely.geometry import shape

from app.services.field_analytics.s2_raster import STAC_SEARCH_URL, SCL_VALID_CLASSES
from app.services.field_analytics.health.common import OBSERVED, get_field, unavailable
from app.services.nasa.real.store import real_store

OVERLAY_RES_M = 20.0
MIN_VALID_SHARE = 0.7
LOOKBACK_DAYS = 60


class _Grid:
    def __init__(self, polygon, res_m: float = OVERLAY_RES_M):
        from rasterio.features import rasterize
        from rasterio.transform import from_origin

        minx, miny, maxx, maxy = polygon.bounds
        lat0 = (miny + maxy) / 2.0
        self.dy = res_m / 111_320.0
        self.dx = res_m / (111_320.0 * math.cos(math.radians(lat0)))
        self.width = max(2, int(math.ceil((maxx - minx) / self.dx)))
        self.height = max(2, int(math.ceil((maxy - miny) / self.dy)))
        self.transform = from_origin(minx, maxy, self.dx, self.dy)
        self.bounds = [[maxy - self.height * self.dy, minx], [maxy, minx + self.width * self.dx]]
        self.mask = rasterize([(polygon, 1)], out_shape=(self.height, self.width), transform=self.transform,
                              fill=0, all_touched=True, dtype="uint8").astype(bool)

    def read(self, href: str, nearest: bool = False) -> np.ndarray:
        import rasterio
        from rasterio.warp import Resampling, reproject

        dtype = "uint8" if nearest else "float32"
        dst = np.zeros((self.height, self.width), dtype=dtype) if nearest else np.full((self.height, self.width), np.nan, dtype=dtype)
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, 1), destination=dst, dst_transform=self.transform, dst_crs="EPSG:4326",
                resampling=Resampling.nearest if nearest else Resampling.bilinear,
                src_nodata=None if nearest else src.nodata, dst_nodata=None if nearest else np.nan,
            )
        return dst


def _search(polygon, days: int = LOOKBACK_DAYS, max_cloud: float = 60.0) -> List[Dict[str, Any]]:
    minx, miny, maxx, maxy = polygon.bounds
    end = date.today()
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": [minx, miny, maxx, maxy],
        "datetime": f"{(end - timedelta(days=days)).isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": 50,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
    }
    r = requests.post(STAC_SEARCH_URL, json=payload, timeout=30)
    r.raise_for_status()
    out = []
    for f in r.json().get("features", []):
        a = f.get("assets", {})
        if all(k in a for k in ("red", "nir", "nir08", "swir16", "rededge1", "scl")):
            out.append({"scene_id": f["id"], "date": f["properties"]["datetime"][:10],
                        "cloud": f["properties"].get("eo:cloud_cover"), "assets": {k: a[k]["href"] for k in ("red", "nir", "nir08", "swir16", "rededge1", "scl")}})
    return out


def _png(classes: np.ndarray, valid: np.ndarray, colours: Dict[int, Tuple[int, int, int]]) -> str:
    h, w = classes.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    for k, c in colours.items():
        sel = valid & (classes == k)
        rgba[sel, :3] = c
        rgba[sel, 3] = 190
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").resize((w * 6, h * 6), Image.NEAREST).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


RED, YELLOW, GREEN, BLUE = (200, 40, 40), (235, 180, 40), (60, 160, 80), (40, 110, 180)


def sentinel_indices(field_id: str, refresh: bool = False) -> Dict[str, Any]:
    """Latest clear Sentinel-2 scene within LOOKBACK_DAYS: NDVI, NDMI, NDRE maps on the field."""
    field = get_field(field_id)
    polygon = shape(field["geometry"])
    try:
        scenes = _search(polygon)
    except Exception as exc:
        return unavailable(f"Sentinel-2 catalogue unreachable ({type(exc).__name__}).")
    cached = {r["scene_id"]: r for r in real_store.get_rasters(field_id, "S2_INDICES")}
    grid = _Grid(polygon)
    tried = []
    for sc in scenes[:8]:
        if sc["scene_id"] in cached and not refresh:
            return cached[sc["scene_id"]]
        try:
            scl = grid.read(sc["assets"]["scl"], nearest=True)
            valid = grid.mask & np.isin(scl, SCL_VALID_CLASSES)
            share = valid.sum() / max(1, grid.mask.sum())
            if share < MIN_VALID_SHARE:
                tried.append(f"{sc['date']}: {round(100 * share)} % clear")
                continue
            b = {k: grid.read(sc["assets"][k]) for k in ("red", "nir", "nir08", "swir16", "rededge1")}
        except Exception as exc:
            tried.append(f"{sc['date']}: read failed ({type(exc).__name__})")
            continue
        with np.errstate(divide="ignore", invalid="ignore"):
            ndvi = (b["nir"] - b["red"]) / (b["nir"] + b["red"])
            ndmi = (b["nir08"] - b["swir16"]) / (b["nir08"] + b["swir16"])
            ndre = (b["nir08"] - b["rededge1"]) / (b["nir08"] + b["rededge1"])
        valid &= np.isfinite(ndvi) & np.isfinite(ndmi) & np.isfinite(ndre)
        if valid.sum() < 4:
            continue
        mean_ndvi = float(np.nanmean(ndvi[valid]))
        canopy = mean_ndvi >= 0.4

        ndmi_cls = np.where(ndmi < 0.0, 0, np.where(ndmi < 0.2, 1, 2))
        ndmi_layer = {
            "available": True, "kind": "ndmi", "provenance": OBSERVED,
            "title": "Plant water content (Sentinel-2 NDMI)",
            "png": _png(ndmi_cls, valid, {0: RED, 1: YELLOW, 2: GREEN}),
            "legend": [{"colour": "red", "label": "NDMI < 0: low plant water or bare soil"},
                       {"colour": "yellow", "label": "NDMI 0 to 0.2: moderate"},
                       {"colour": "green", "label": "NDMI >= 0.2: well supplied canopy"}],
            "mean": round(float(np.nanmean(ndmi[valid])), 3),
            "note": None if canopy else "Field is mostly bare or sparse (mean NDVI {:.2f}); NDMI then mostly reflects dry soil surface, not plant stress.".format(mean_ndvi),
        }
        if canopy:
            q1, q2 = np.quantile(ndre[valid], [1 / 3, 2 / 3])
            ndre_cls = np.where(ndre <= q1, 0, np.where(ndre <= q2, 1, 2))
            ndre_layer = {
                "available": True, "kind": "ndre", "provenance": OBSERVED,
                "title": "Nitrogen uptake signal (Sentinel-2 red-edge NDRE, relative)",
                "png": _png(ndre_cls, valid, {0: RED, 1: YELLOW, 2: GREEN}),
                "legend": [{"colour": "red", "label": "Lowest third of the field: weaker N uptake / chlorophyll"},
                           {"colour": "yellow", "label": "Middle third"},
                           {"colour": "green", "label": "Highest third"}],
                "breaks": [round(float(q1), 3), round(float(q2), 3)],
                "note": "Relative within the field on this date. Low areas need checking on the ground before changing N rates.",
            }
        else:
            ndre_layer = unavailable(
                f"No active crop canopy on {sc['date']} (mean NDVI {mean_ndvi:.2f} < 0.4). Red-edge nitrogen signals need a growing crop."
            )
        payload = {
            "available": True, "scene_id": sc["scene_id"], "date": sc["date"], "bounds": grid.bounds,
            "valid_share": round(float(share), 3), "mean_ndvi": round(mean_ndvi, 3), "canopy": canopy,
            "source": "Copernicus Sentinel-2 L2A (Earth Search), B04/B05/B08/B8A/B11, SCL mask, resampled to ~20 m",
            "ndmi": ndmi_layer, "ndre": ndre_layer,
        }
        real_store.save_raster(field_id, "S2_INDICES", sc["date"], payload, sc["scene_id"])
        return payload
    return unavailable(
        f"No Sentinel-2 scene in the last {LOOKBACK_DAYS} days with >= {int(MIN_VALID_SHARE * 100)} % cloud-free field pixels.",
        checked=tried,
    )


def ecostress_latest(field_id: str, min_share: float = 0.6, max_age_days: int = 120) -> Dict[str, Any]:
    rows = real_store.get_rasters(field_id, "ECO_L4T_ESI.002")
    tasks = real_store.tasks_for("area", field_id)
    pending = next((t for t in tasks if t["status"] not in ("ingested", "error", "deleted")), None)
    cutoff = (date.today() - timedelta(days=max_age_days)).isoformat()
    for r in rows:
        if r["obs_date"][:10] < cutoff:
            break
        if r["valid_pixels"] / max(1, r["total_pixels"]) >= min_share:
            return {
                "available": True, "kind": "ecostress_esi", "provenance": "satellite_estimate",
                "title": "Evaporative stress (NASA ECOSTRESS ESI, 70 m)",
                "date": r["obs_date"][:10], "overpass_utc": r["overpass_utc"], "bounds": r["bounds"], "png": r["png"],
                "mean": r["mean"], "source_ref": r["source_ref"],
                "legend": [{"colour": "red", "label": "ESI < 0.3: plants or soil evaporating far below potential (water stress)"},
                           {"colour": "yellow", "label": "ESI 0.3-0.6: moderate stress"},
                           {"colour": "green", "label": "ESI 0.6-0.85: low stress"},
                           {"colour": "blue", "label": "ESI >= 0.85: near potential evaporation (wet)"}],
                "note": "ESI is the ratio of actual to potential evapotranspiration. It tracks root-zone water availability but is not a soil moisture measurement.",
            }
    if pending:
        return unavailable("ECOSTRESS extraction is still running at NASA AppEEARS.", pending_task=pending["task_id"])
    return unavailable(f"No ECOSTRESS overpass in the last {max_age_days} days with >= {int(min_share * 100)} % cloud-free field pixels.")


def moisture_gradient(field_id: str) -> Dict[str, Any]:
    eco = ecostress_latest(field_id)
    s2 = sentinel_indices(field_id)
    primary = eco if eco.get("available") else (dict(s2["ndmi"], bounds=s2["bounds"], date=s2["date"]) if s2.get("available") else None)
    return {
        "available": primary is not None,
        "layer": primary,
        "ecostress": {k: v for k, v in eco.items() if k != "png"},
        "sentinel2": None if not s2.get("available") else {"date": s2["date"], "scene_id": s2["scene_id"]},
        "reason": None if primary else (eco.get("reason") or "") + " " + (s2.get("reason") or ""),
    }


def nitrogen_zones(field_id: str) -> Dict[str, Any]:
    s2 = sentinel_indices(field_id)
    if not s2.get("available"):
        return s2
    layer = s2["ndre"]
    if layer.get("available"):
        layer = dict(layer, bounds=s2["bounds"], date=s2["date"], scene_id=s2["scene_id"])
    return {"available": layer.get("available", False), "layer": layer, "reason": layer.get("reason")}
