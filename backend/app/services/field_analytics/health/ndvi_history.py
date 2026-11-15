"""Three-year Sentinel-2 NDVI history and trend classification."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

import numpy as np

from app.services.field_analytics.repository import analytics_repo
from app.services.field_analytics.s2_raster import RasterUnavailable
from app.services.field_analytics.sentinel_service import DEFAULT_HISTORY_START, sentinel_service
from app.services.field_analytics.health.common import DERIVED, OBSERVED, get_field, unavailable

#: Peak-season window for arable crops in Brandenburg (most winter and spring crops peak here).
PEAK_MONTHS = (4, 5, 6, 7)
#: Minimum share of valid (cloud-free) field pixels for an observation to count.
MIN_VALID_PCT = 60.0
#: Trend thresholds on the slope of yearly peak NDVI (NDVI units per year).
STABLE_SLOPE = 0.02


def ensure_ndvi_history(field_id: str) -> Dict[str, Any]:
    """Compute and store any missing Sentinel-2 observations since DEFAULT_HISTORY_START."""
    field = get_field(field_id)
    existing = analytics_repo.get_observations(field_id)
    have = {o["scene_id"] for o in existing}
    try:
        new = sentinel_service.build_time_series(
            field_id, field["geometry"], start_date=DEFAULT_HISTORY_START, skip_scene_ids=have
        )
    except RasterUnavailable as exc:
        return {"stored": len(existing), "added": 0, "error": str(exc)}
    if new:
        analytics_repo.save_observations(field_id, new)
        analytics_repo.invalidate_report_cache(field_id)
    return {"stored": len(existing) + len(new), "added": len(new)}


def vegetation_trend(field_id: str) -> Dict[str, Any]:
    obs = [
        o for o in analytics_repo.get_observations(field_id)
        if o.get("is_included") and o.get("mean_ndvi") is not None
        and (o.get("valid_pixel_percent") or 0) >= MIN_VALID_PCT
        and o.get("acquisition_date", "") >= DEFAULT_HISTORY_START
    ]
    if not obs:
        return unavailable("No cloud-free Sentinel-2 observations stored for this field yet.")

    series = [
        {
            "date": o["acquisition_date"],
            "mean_ndvi": round(float(o["mean_ndvi"]), 3),
            "p10": None,
            "valid_pixel_percent": round(float(o.get("valid_pixel_percent") or 0), 1),
            "scene_id": o["scene_id"],
        }
        for o in sorted(obs, key=lambda x: x["acquisition_date"])
    ]

    seasons: Dict[str, List[float]] = {}
    for s in series:
        if int(s["date"][5:7]) in PEAK_MONTHS:
            seasons.setdefault(s["date"][:4], []).append(s["mean_ndvi"])
    peaks = [
        {"season": y, "peak_ndvi": round(max(v), 3), "observations": len(v)}
        for y, v in sorted(seasons.items())
    ]

    trend: Dict[str, Any] = {"available": False, "reason": "Fewer than 2 seasons with April-July observations."}
    if len(peaks) >= 2:
        years = np.array([int(p["season"]) for p in peaks], dtype=float)
        vals = np.array([p["peak_ndvi"] for p in peaks])
        slope = float(np.polyfit(years, vals, 1)[0])
        status = "improving" if slope > STABLE_SLOPE else "declining" if slope < -STABLE_SLOPE else "stable"
        first, last = peaks[0], peaks[-1]
        if status == "stable":
            text = f"Spring green-up is steady ({first['season']}-{last['season']})."
        elif status == "improving":
            text = f"Spring green-up is getting stronger ({first['season']}-{last['season']})."
        else:
            text = f"Spring green-up is weaker than in {first['season']}. Check crop, weather and soil."
        trend = {
            "available": True,
            "status": status,
            "slope_per_year": round(slope, 4),
            "explanation": text,
            "method": (
                "Field-mean NDVI from each cloud-free Sentinel-2 scene; per season, the highest value in April-July; "
                f"linear trend across seasons. |slope| <= {STABLE_SLOPE} NDVI/year is 'stable'."
            ),
            "provenance": DERIVED,
        }

    return {
        "available": True,
        "provenance": OBSERVED,
        "source": "Copernicus Sentinel-2 L2A (Element84 Earth Search), B04/B08, SCL cloud mask, 10 m",
        "period": [series[0]["date"], series[-1]["date"]],
        "observation_count": len(series),
        "series": series,
        "season_peaks": peaks,
        "trend": trend,
        "crop_note": "Different crops in different years change NDVI levels; the trend reflects the field and its crops together.",
        "as_of": date.today().isoformat(),
    }
