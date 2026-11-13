"""
Synthetic-raster unit tests for Field Analytics pipeline.

These tests verify the pure computational modules (NDVI math, quality masking,
zonal statistics, multi-season productivity zoning, temporal stability and
spatial correlation) using synthetic rasters, exactly as permitted by the
project spec for unit tests. They never require network access, rasterio or
real satellite data.

Real-data validation is covered separately by ``test_field_analytics.py``,
which is gated on the availability of the raster stack and live APIs.
"""

import numpy as np
import pytest

from app.services.field_analytics.s2_raster import (
    compute_ndvi,
    ndvi_statistics,
    quality_mask,
)
from app.services.field_analytics.productivity_service import productivity_service
from app.services.field_analytics.correlation_service import (
    CorrelationService,
    CorrelationUnavailable,
    align_layers,
)
from app.services.field_analytics.weather_service import CROP_BASE_TEMPERATURES

correlation_service = CorrelationService()


# ---------------------------------------------------------------------------
# NDVI computation
# ---------------------------------------------------------------------------
def test_ndvi_formula():
    red = np.array([[1000.0, 3000.0], [2000.0, 5000.0]], dtype="float64")
    nir = np.array([[5000.0, 10000.0], [8000.0, 15000.0]], dtype="float64")
    valid = np.ones((2, 2), dtype=bool)

    ndvi = compute_ndvi(red, nir, valid)
    expected = (nir - red) / (nir + red)
    np.testing.assert_allclose(ndvi, expected)
    assert np.isfinite(ndvi).all()
    # NDVI is scale invariant.
    ndvi_scaled = compute_ndvi(red * 100.0, nir * 100.0, valid)
    np.testing.assert_allclose(ndvi_scaled, expected)


def test_ndvi_masks_invalid_pixels():
    red = np.array([[1000.0, 3000.0], [2000.0, 5000.0]], dtype="float64")
    red[0, 0] = np.nan
    nir = np.array([[5000.0, 10000.0], [8000.0, 15000.0]], dtype="float64")
    valid = np.ones((2, 2), dtype=bool)

    ndvi = compute_ndvi(red, nir, valid)
    assert np.isnan(ndvi[0, 0])
    assert np.isfinite(ndvi[0, 1])


def test_ndvi_clipped_to_unit_interval():
    # Extremely high NIR relative to RED must still land in [-1, 1].
    red = np.array([[1.0, 1.0]], dtype="float64")
    nir = np.array([[1e9, 1e9]], dtype="float64")
    valid = np.ones((1, 2), dtype=bool)
    ndvi = compute_ndvi(red, nir, valid)
    assert float(np.max(ndvi)) <= 1.0


# ---------------------------------------------------------------------------
# Quality masking
# ---------------------------------------------------------------------------
def test_quality_mask_excludes_cloud_and_nodata():
    red = np.array([[2000.0, 2000.0], [2000.0, 2000.0]], dtype="float64")
    nir = np.array([[6000.0, 6000.0], [6000.0, 6000.0]], dtype="float64")
    # SCL: 4 = vegetation, 8 = medium-prob cloud, 3 = cloud shadow,
    #      0 = no data, 6 = water.
    scl = np.array([[4, 8], [3, 0]], dtype="uint8")
    field_mask = np.ones((2, 2), dtype=bool)

    valid, counts = quality_mask(red, nir, scl, field_mask)

    assert bool(valid[0, 0]) is True   # vegetation
    assert bool(valid[0, 1]) is False  # cloud
    assert bool(valid[1, 0]) is False  # shadow
    assert bool(valid[1, 1]) is False  # no data
    assert counts["field_pixels"] == 4
    assert counts["cloud_pixels"] >= 1
    assert counts["nodata_pixels"] == 0  # reflectance is finite; class-based drop


def test_quality_mask_without_scl_degrades_to_reflectance_only():
    red = np.array([[2000.0, np.nan], [2000.0, 2000.0]], dtype="float64")
    nir = np.array([[6000.0, 6000.0], [6000.0, 6000.0]], dtype="float64")
    field_mask = np.ones((2, 2), dtype=bool)

    valid, counts = quality_mask(red, nir, None, field_mask)
    assert bool(valid[0, 0]) is True
    assert bool(valid[0, 1]) is False  # NaN reflectance
    assert counts["nodata_pixels"] == 1


# ---------------------------------------------------------------------------
# Zonal NDVI statistics
# ---------------------------------------------------------------------------
def test_ndvi_statistics():
    nv = np.array([[0.3, 0.5], [0.7, np.nan]], dtype="float64")
    mask = np.ones((2, 2), dtype=bool)

    stats = ndvi_statistics(nv, mask)
    assert stats["mean_ndvi"] == pytest.approx(0.5)
    assert stats["median_ndvi"] == pytest.approx(0.5)
    assert stats["min_ndvi"] == pytest.approx(0.3)
    assert stats["max_ndvi"] == pytest.approx(0.7)
    assert stats["valid_pixel_count"] == 3
    assert stats["valid_pixel_percent"] == pytest.approx(75.0)


# ---------------------------------------------------------------------------
# Multi-season productivity zoning
# ---------------------------------------------------------------------------
def _make_observation(year, grid):
    arr = np.asarray(grid, dtype="float64")
    return {
        "id": f"synthetic_{year}",
        "field_id": "f1",
        "scene_id": f"S2SIM_{year}",
        "acquisition_date": f"{year}-06-15",
        "season": str(year),
        "is_included": True,
        "ndvi_grid": grid,
        "mean_ndvi": float(arr.mean()),
        "median_ndvi": float(np.median(arr)),
        "min_ndvi": float(arr.min()),
        "max_ndvi": float(arr.max()),
        "std_ndvi": float(arr.std()),
        "valid_pixel_percent": 100.0,
        "valid_pixel_count": int(arr.size),
    }


def _synthetic_observations():
    """Three seasons with an identical spatial gradient (stable productivity)."""
    rng = np.random.default_rng(0)
    base = np.tile(np.linspace(0.25, 0.85, 20), (20, 1))
    grids = []
    for year in (2021, 2022, 2023):
        noise = rng.normal(0.0, 0.02, (20, 20))
        grid = np.clip(base + noise, 0.10, 0.95).round(4)
        grids.append(_make_observation(year, grid.tolist()))
    return grids


def test_productivity_zones_from_synthetic_raster():
    observations = _synthetic_observations()
    result = productivity_service.calculate_productivity_report("f1", 12.0, observations)

    assert result["available"] is True
    assert result["seasons_used"] == ["2021", "2022", "2023"]
    assert result["seasons_total"] == 3
    assert len(result["zones"]) == 3

    by_zone = {z["zone"]: z for z in result["zones"]}
    assert set(by_zone) == {"high", "medium", "low"}
    for zone in by_zone.values():
        # Each tertile should be a substantial fraction of the field.
        assert 25.0 < zone["percent_of_field"] < 42.0
        assert zone["area_ha"] > 0.0

    # Identical gradient across seasons => very stable classification.
    stability = result["stability"]
    assert stability["stable_percent_of_comparable"] > 90.0
    assert result["map_url"].startswith("data:image/png;base64,")


def test_productivity_insufficient_seasons_reports_unavailable():
    observations = _synthetic_observations()[:1]
    result = productivity_service.calculate_productivity_report("f1", 12.0, observations)

    assert result["available"] is False
    assert "Insufficient" in result["reason"]
    assert result["zones"] == []
    assert result["map_url"] is None


def test_productivity_many_validity_pixels_reports_unavailable():
    obs = _make_observation(2021, np.full((20, 20), 0.5).tolist())
    obs["valid_pixel_percent"] = 50.0
    observations = [
        obs,
        _make_observation(2022, np.full((20, 20), 0.5).tolist()),
        _make_observation(2023, np.full((20, 20), 0.5).tolist()),
    ]
    result = productivity_service.calculate_productivity_report("f1", 12.0, observations)
    assert result["available"] is False


# ---------------------------------------------------------------------------
# Spatial correlation
# ---------------------------------------------------------------------------
def test_spatial_correlation_aligned_layers():
    observations = _synthetic_observations()
    prod = productivity_service.calculate_productivity_report("f1", 12.0, observations)
    score = prod["score_grid"]
    mask = prod["mask"]

    rng = np.random.default_rng(1)
    brightness = (1.0 - np.asarray(score, dtype="float64") * 0.5 + rng.normal(0, 0.01, np.asarray(score).shape)).round(4).tolist()
    elevation = (50.0 + np.asarray(score, dtype="float64") * 10.0).round(2).tolist()

    response = correlation_service.compute_correlations(
        field_id="f1",
        productivity_grid=score,
        brightness_grid=brightness,
        elevation_grid=elevation,
        mask=mask,
    )

    assert response.sample_pixel_count > 0
    assert -1.0 <= response.productivity_vs_elevation.pearson_r <= 1.0
    assert -1.0 <= response.productivity_vs_brightness.pearson_r <= 1.0
    assert -1.0 <= response.productivity_vs_elevation.spearman_rho <= 1.0
    # Effective sample size must never exceed the raw count (spatial dependence).
    assert response.effective_sample_size <= response.sample_pixel_count
    assert response.effective_sample_size >= 2


def test_spatial_correlation_honors_common_mask():
    observations = _synthetic_observations()
    prod = productivity_service.calculate_productivity_report("f1", 12.0, observations)
    score = prod["score_grid"]
    mask = prod["mask"]

    response = correlation_service.compute_correlations(
        field_id="f1",
        productivity_grid=score,
        brightness_grid=None,
        elevation_grid=None,
        mask=mask,
    )
    assert response.productivity_vs_elevation is None
    assert response.productivity_vs_brightness is None


def test_spatial_correlation_rejects_mismatched_grids():
    with pytest.raises(CorrelationUnavailable):
        align_layers(
            [[1.0, 2.0], [3.0, 4.0]],
            [[1.0, 2.0, 3.0]],
            None,
        )


def test_spatial_correlation_rejects_empty_common_mask():
    with pytest.raises(CorrelationUnavailable):
        align_layers(
            [[1.0, 2.0], [3.0, 4.0]],
            None,
            None,
            productivity_mask=[[False, False], [False, False]],
        )


# ---------------------------------------------------------------------------
# Crop-specific GDD base temperatures
# ---------------------------------------------------------------------------
def test_crop_base_temperature_table():
    assert CROP_BASE_TEMPERATURES["winter wheat"] == 4.4
    assert CROP_BASE_TEMPERATURES["maize"] == 10.0
    assert CROP_BASE_TEMPERATURES["rapeseed"] == 5.0
    # A crop with no entry must not crash lookups.
    assert CROP_BASE_TEMPERATURES.get("unknown crop") is None
