"""
Multi-season relative productivity zones and temporal stability.

This is an independent, transparent implementation of the concept of comparing
spatial NDVI patterns across growing seasons. It is NOT yield, and it must never
be described as measured yield.

Method
------
1. Season assembly - for each calendar year, included observations whose
   acquisition month lies inside the crop-specific OR crop-agnostic seasonal
   window are retained. Using a fixed development window avoids comparing, for
   example, an April crop with a July crop across seasons. When no crop history
   exists for a season, the window is labelled ``crop_agnostic``.

2. Seasonal composite - the per-pixel mean NDVI of the retained observations,
   computed only where every contributing pixel was valid. Partial-validity
   pixels are excluded rather than filled.

3. Relative standing - within each season composite, each field pixel is ranked
   as a percentile of that season's distribution. Ranking inside the field
   removes absolute NDVI offsets between seasons (different crops, different
   weather) and measures only spatial standing.

4. Productivity score - the mean percentile across the seasons for which the
   pixel was valid, penalised by the share of seasons with no valid data:

       score = mean_percentile * (seasons_valid / seasons_total)

5. Zones - percentiles are split at the configured thresholds (default tertiles)
   of the final score distribution over valid field pixels.

6. Stability - each season's own tertile classification is computed, and a
   pixel is "stable" when its class is identical in every season for which it
   had data and it had data in at least ``min_seasons`` seasons.

Minimum data requirement: ``MIN_SEASONS`` distinct seasons and
``MIN_VALID_PIXEL_PERCENT`` valid pixels per season. Below that the service
reports the analysis as unavailable instead of publishing a map.
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

MIN_SEASONS = 3
MIN_VALID_PIXEL_PERCENT = 60.0
MIN_SEASON_OBSERVATIONS = 1

DEFAULT_THRESHOLDS = (1.0 / 3.0, 2.0 / 3.0)

#: Crop-agnostic growing-season window (northern-hemisphere temperate).
DEFAULT_SEASONAL_WINDOW = ((5, 1), (8, 31))

#: Crop-specific windows, keyed by lower-case crop name.
CROP_SEASONAL_WINDOWS: Dict[str, Tuple[Tuple[int, int], Tuple[int, int]]] = {
    "winter wheat": ((4, 15), (7, 15)),
    "wheat": ((4, 15), (7, 15)),
    "winter barley": ((4, 1), (6, 30)),
    "barley": ((4, 1), (6, 30)),
    "winter rye": ((4, 15), (7, 15)),
    "rye": ((4, 15), (7, 15)),
    "rapeseed": ((4, 1), (6, 30)),
    "canola": ((4, 1), (6, 30)),
    "maize": ((6, 1), (8, 31)),
    "corn": ((6, 1), (8, 31)),
    "sunflower": ((6, 1), (8, 31)),
    "soybean": ((6, 15), (8, 31)),
    "soybeans": ((6, 15), (8, 31)),
    "potato": ((6, 1), (8, 15)),
    "sugar beet": ((6, 15), (9, 15)),
    "oats": ((5, 1), (7, 15)),
    "peas": ((5, 1), (7, 15)),
    "grassland": ((4, 15), (8, 31)),
    "grassland pasture": ((4, 15), (8, 31)),
}

UNSUPPORTED_MESSAGE = (
    "Insufficient historical satellite observations to calculate reliable "
    "productivity zones."
)


def seasonal_window_for(crop: Optional[str]):
    """Return (window, label) for the crop, or the agnostic default."""
    if crop:
        key = crop.strip().lower()
        if key in CROP_SEASONAL_WINDOWS:
            return CROP_SEASONAL_WINDOWS[key], f"crop_specific:{key}"
    return DEFAULT_SEASONAL_WINDOW, "crop_agnostic"


def _in_window(iso_date: str, window) -> bool:
    try:
        month = int(iso_date[5:7])
        day = int(iso_date[8:10])
    except (ValueError, IndexError):
        return False
    (m0, d0), (m1, d1) = window
    return (m0, d0) <= (month, day) <= (m1, d1)


def _zone_colour(zone: str) -> Tuple[int, int, int]:
    return {
        "high": (26, 122, 62),
        "medium": (219, 168, 40),
        "low": (176, 58, 46),
    }.get(zone, (120, 120, 120))


class ProductivityService:
    """Relative multi-season productivity zoning from real NDVI grids."""

    def calculate_productivity_report(
        self,
        field_id: str,
        area_ha: float,
        observations: List[Dict[str, Any]],
        crop: Optional[str] = None,
        thresholds: Tuple[float, float] = DEFAULT_THRESHOLDS,
        min_seasons: int = MIN_SEASONS,
    ) -> Dict[str, Any]:
        """
        Build productivity zones from included observations that carry a real
        ``ndvi_grid``. Returns ``available = False`` with an explicit reason
        when the minimum data requirement is not met.
        """
        window, window_label = seasonal_window_for(crop)

        included = [
            o
            for o in observations
            if o.get("is_included")
            and o.get("ndvi_grid")
            and o.get("mean_ndvi") is not None
            and (o.get("valid_pixel_percent") or 0) >= MIN_VALID_PIXEL_PERCENT
            and _in_window(o.get("acquisition_date", ""), window)
        ]

        by_season: Dict[str, List[Dict[str, Any]]] = {}
        for observation in included:
            season = observation.get("season") or observation.get("acquisition_date", "")[:4]
            by_season.setdefault(season, []).append(observation)

        eligible = {
            season: obs
            for season, obs in by_season.items()
            if len(obs) >= MIN_SEASON_OBSERVATIONS
        }

        if len(eligible) < min_seasons:
            return {
                "field_id": field_id,
                "available": False,
                "reason": UNSUPPORTED_MESSAGE,
                "detail": (
                    f"Found {len(eligible)} qualifying season(s); at least "
                    f"{min_seasons} are required. Each season needs a "
                    f"Sentinel-2 observation inside the {window_label} window "
                    f"with >= {MIN_VALID_PIXEL_PERCENT}% valid field pixels."
                ),
                "seasons_used": sorted(eligible.keys()),
                "season_window": window_label,
                "min_seasons_required": min_seasons,
                "zones": [],
                "stability": None,
                "map_url": None,
            }

        masks: List[np.ndarray] = []
        grids: List[np.ndarray] = []
        for season in sorted(eligible):
            stack = np.stack(
                [
                    np.array(o["ndvi_grid"], dtype="float64")
                    for o in eligible[season]
                ],
                axis=0,
            )
            pixel_valid = np.all(stack > -1.0, axis=0)
            composite = np.where(
                pixel_valid, np.nanmean(np.where(stack > -1.0, stack, np.nan), axis=0), np.nan
            )
            grids.append(composite)
            masks.append(pixel_valid & np.isfinite(composite))

        common_mask = masks[0].copy()
        for mask in masks[1:]:
            common_mask &= mask

        seasons_total = len(grids)
        percentile_stack = np.zeros_like(grids[0], dtype="float64")
        valid_season_count = np.zeros_like(grids[0], dtype="float64")

        for grid, _mask in zip(grids, masks):
            flat = grid[np.isfinite(grid)]
            if flat.size < 10:
                continue
            ranks = np.full(grid.shape, np.nan)
            order = np.argsort(np.argsort(grid[np.isfinite(grid)]))
            ranks[np.isfinite(grid)] = order / max(1, flat.size - 1)
            percentile_stack += np.where(np.isfinite(ranks), ranks, 0.0)
            valid_season_count += np.where(np.isfinite(ranks), 1.0, 0.0)

        usable = valid_season_count > 0
        if not usable.any():
            return {
                "field_id": field_id,
                "available": False,
                "reason": UNSUPPORTED_MESSAGE,
                "detail": "No field pixels were valid across the qualifying seasons.",
                "seasons_used": sorted(eligible.keys()),
                "season_window": window_label,
                "min_seasons_required": min_seasons,
                "zones": [],
                "stability": None,
                "map_url": None,
            }

        score = np.full(grids[0].shape, np.nan)
        score[usable] = (
            percentile_stack[usable]
            / valid_season_count[usable]
            * (valid_season_count[usable] / seasons_total)
        )

        low_cut, high_cut = thresholds
        low_thr, high_thr = np.quantile(score[usable], [low_cut, high_cut])

        zones = np.full(score.shape, "", dtype=object)
        zones[usable & (score <= low_thr)] = "low"
        zones[usable & (score > low_thr) & (score <= high_thr)] = "medium"
        zones[usable & (score > high_thr)] = "high"

        pixel_area_ha = _pixel_area_ha(grids[0].shape, area_ha, int(usable.sum()))
        zone_stats = []
        for name in ("high", "medium", "low"):
            count = int(np.count_nonzero(zones == name))
            zone_stats.append(
                {
                    "zone": name,
                    "pixel_count": count,
                    "area_ha": round(count * pixel_area_ha, 3),
                    "percent_of_field": round(
                        100.0 * count / max(1, int(usable.sum())), 2
                    ),
                }
            )

        stability = self._stability(grids, masks, seasons_total, pixel_area_ha)

        return {
            "field_id": field_id,
            "available": True,
            "reason": None,
            "detail": None,
            "method": (
                "Relative standing within the field per season, mean across "
                "seasons, scaled by season coverage, then split at the "
                "configured percentile thresholds."
            ),
            "season_window": window_label,
            "seasonal_window_months": [list(window[0]), list(window[1])],
            "seasons_used": sorted(eligible.keys()),
            "seasons_total": seasons_total,
            "observations_used": int(sum(len(v) for v in eligible.values())),
            "thresholds": {
                "low_max_percentile": low_cut,
                "medium_max_percentile": high_cut,
                "score_cut_low": round(float(low_thr), 4),
                "score_cut_high": round(float(high_thr), 4),
            },
            "min_seasons_required": min_seasons,
            "zones": zone_stats,
            "stability": stability,
            "pixel_area_ha": round(pixel_area_ha, 6),
            "usable_pixel_count": int(usable.sum()),
            "mask": usable.tolist(),
            "score_grid": np.where(usable, score, -1.0).round(5).tolist(),
            "map_url": _render_zones(zones, usable),
            "legend": [
                {"zone": "high", "label": "High relative productivity"},
                {"zone": "medium", "label": "Medium relative productivity"},
                {"zone": "low", "label": "Low relative productivity"},
            ],
            "caveat": (
                "Relative vegetation/productivity indicator derived from "
                "satellite NDVI history. Not a measured yield, and not by "
                "itself a basis for variable-rate application."
            ),
            "data_source": "Copernicus Sentinel-2 L2A NDVI",
        }

    def _stability(
        self,
        grids: List[np.ndarray],
        masks: List[np.ndarray],
        seasons_total: int,
        pixel_area_ha: float,
    ) -> Dict[str, Any]:
        """Per-season tertile agreement across the seasons with data."""
        per_season_class: List[np.ndarray] = []
        for grid in grids:
            finite = np.isfinite(grid)
            classes = np.full(grid.shape, -1, dtype="int8")
            if int(np.count_nonzero(finite)) < 10:
                per_season_class.append(classes)
                continue
            cut_low, cut_high = np.quantile(grid[finite], [1.0 / 3.0, 2.0 / 3.0])
            classes[finite & (grid <= cut_low)] = 0
            classes[finite & (grid > cut_low) & (grid <= cut_high)] = 1
            classes[finite & (grid > cut_high)] = 2
            per_season_class.append(classes)

        stack = np.stack(per_season_class, axis=0)
        has_data = stack >= 0
        data_seasons = has_data.sum(axis=0)

        stable = data_seasons >= min(2, seasons_total)
        agreement = np.where(stable, np.all(stack == stack[0], axis=0) & stable, False)

        names = {0: "low", 1: "medium", 2: "high"}
        breakdown = []
        for code, name in names.items():
            count = int(np.count_nonzero(agreement & (stack[0] == code)))
            breakdown.append(
                {
                    "zone": name,
                    "stable_pixel_count": count,
                    "stable_area_ha": round(count * pixel_area_ha, 3),
                }
            )

        stable_pixels = int(np.count_nonzero(agreement))
        comparable_pixels = int(np.count_nonzero(stable))
        return {
            "seasons_compared": seasons_total,
            "comparable_pixel_count": comparable_pixels,
            "stable_pixel_count": stable_pixels,
            "stable_area_ha": round(stable_pixels * pixel_area_ha, 3),
            "stable_percent_of_comparable": round(
                100.0 * stable_pixels / max(1, comparable_pixels), 2
            ),
            "per_zone": breakdown,
            "method": (
                "A pixel is stable when its per-season tertile class is "
                "identical in every season that had valid data."
            ),
        }


def _pixel_area_ha(shape, area_ha: float, usable_pixels: int) -> float:
    """Distribute the field's real surveyed area across usable raster cells."""
    return float(area_ha) / max(1, usable_pixels) if usable_pixels else 0.0


def _render_zones(zones: np.ndarray, usable: np.ndarray) -> str:
    height, width = zones.shape
    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    for row in range(height):
        for col in range(width):
            if not usable[row, col]:
                continue
            red, green, blue = _zone_colour(str(zones[row, col]))
            canvas[row, col] = (red, green, blue, 255)
    image = Image.fromarray(canvas, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


productivity_service = ProductivityService()
