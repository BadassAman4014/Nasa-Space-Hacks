"""
Comprehensive tests for Field Analytics & Historical Satellite Report pipeline.
"""

import sys
from pathlib import Path
import pytest
from shapely.geometry import Polygon

# Ensure backend in path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.user_farms_repository import user_farms_repo
from app.services.field_analytics import s2_capability
from app.services.field_analytics.schemas import PlantingDateUpdate
from app.services.field_analytics.sentinel_service import sentinel_service
from app.services.field_analytics.weather_service import weather_service
from app.services.field_analytics.elevation_service import elevation_service
from app.services.field_analytics.soil_brightness_service import soil_brightness_service
from app.services.field_analytics.productivity_service import productivity_service
from app.services.field_analytics.correlation_service import correlation_service
from app.services.field_analytics.report_service import report_service

# The Sentinel-2 NDVI / productivity / correlation tests exercise the real
# raster pipeline and are therefore integration tests: they require the GDAL
# stack (rasterio + pyproj) plus network access to the Element84 STAC catalogue
# and NASA POWER. When those are unavailable the pipeline honestly reports an
# "unavailable" state instead of fabricating values, so the tests are skipped
# rather than asserting fake data.
REAL_RASTER_AVAILABLE = s2_capability.AVAILABLE
skip_without_raster = pytest.mark.skipif(
    not REAL_RASTER_AVAILABLE,
    reason="rasterio/pyproj not installed; real Sentinel-2 raster pipeline unavailable",
)

@pytest.fixture
def sample_field():
    fields = user_farms_repo.list_fields()
    if not fields:
        farm = user_farms_repo.create_farm("Analytics Test Farm", "Brandenburg, Germany")
        poly = {
            "type": "Polygon",
            "coordinates": [[[13.015, 52.450], [13.055, 52.470], [13.080, 52.430], [13.040, 52.410], [13.015, 52.450]]]
        }
        f = user_farms_repo.save_field(farm["id"], "Test Analytical Field", poly, current_crop="Winter wheat")
        return f
    return fields[0]

def test_field_status_summary(sample_field):
    summary = report_service.get_field_status_summary(sample_field["id"])
    assert summary.field_id == sample_field["id"]
    assert summary.area_ha > 0
    assert summary.analysis_status == "Verified Satellite Analytics"
    assert summary.current_weather is not None
    assert summary.current_weather.temperature_c != 0.0

def test_planting_date_update(sample_field):
    res = report_service.update_planting_date(sample_field["id"], PlantingDateUpdate(
        planting_date="2024-10-18",
        harvest_date="2025-08-05"
    ))
    assert res["planting_date"] == "2024-10-18"
    summary = report_service.get_field_status_summary(sample_field["id"])
    assert summary.planting_date == "2024-10-18"
    assert summary.days_since_planting is not None

@skip_without_raster
def test_sentinel_ndvi_timeseries(sample_field):
    ndvi_res = report_service.get_ndvi_time_series(sample_field["id"])
    assert len(ndvi_res.observations) >= 5
    for obs in ndvi_res.observations:
        assert 0.0 <= obs.mean_ndvi <= 1.0
        assert obs.cloud_cover_percent >= 0.0
        assert obs.rgb_preview_url.startswith("data:image/png;base64,")
        assert obs.ndvi_preview_url.startswith("data:image/png;base64,")

def test_weather_and_gdd(sample_field):
    precip = report_service.get_precipitation_series(sample_field["id"])
    assert precip.total_accumulated_mm > 0.0
    assert len(precip.daily_records) > 0

    gdd = report_service.get_gdd_series(sample_field["id"], base_temp=4.4)
    assert gdd.total_accumulated_gdd > 0.0
    assert gdd.base_temperature_c == 4.4
    assert len(gdd.daily_records) > 0

@skip_without_raster
def test_productivity_and_correlations(sample_field):
    report = report_service.get_full_report(sample_field["id"], force_refresh=True)
    assert report.productivity.total_seasons_analyzed >= 2
    assert len(report.productivity.zones) == 3
    assert report.productivity.stable_area_percent > 0.0

    # Test correlation metrics
    pe = report.correlation.productivity_vs_elevation
    pb = report.correlation.productivity_vs_brightness
    assert -1.0 <= pe.pearson_r <= 1.0
    assert -1.0 <= pb.pearson_r <= 1.0
    assert report.correlation.sample_pixel_count > 10

@skip_without_raster
def test_toggle_observation(sample_field):
    report = report_service.get_full_report(sample_field["id"])
    obs_id = report.historical_observations[0].id
    new_report = report_service.toggle_observation(sample_field["id"], obs_id, False)
    target = next((o for o in new_report.historical_observations if o.id == obs_id), None)
    assert target is not None
    assert target.is_included is False

    # Toggle back
    report_service.toggle_observation(sample_field["id"], obs_id, True)
