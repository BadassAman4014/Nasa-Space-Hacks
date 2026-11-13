"""
Integration and unit tests for NASA Earth Observation data integration
(NASA SMAP, NASA GPM IMERG, NASA MODIS).
Tests HDF5/NetCDF reading, quality filtering, scale factors, polygon intersection,
coarse-resolution disclaimers, temporal aggregations, database persistence, and APIs.
"""

import os
import sys
import tempfile
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import h5py
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.nasa.common import (
    calculate_spatial_statistics,
    get_coarse_resolution_warning,
    reproject_geometry_to_ease,
    reproject_geometry_to_sinu,
)
from app.services.nasa.storage import NasaStorageRepository
from app.services.nasa.smap import smap_extractor, smap_processor
from app.services.nasa.gpm import gpm_extractor, gpm_processor
from app.services.nasa.modis import modis_extractor, modis_processor
from app.services.nasa.service import NasaEnvironmentalService
from app.services.user_farms_repository import UserFarmsRepository

@pytest.fixture
def temp_nasa_db(tmp_path):
    db_file = tmp_path / "test_nasa.db"
    storage = NasaStorageRepository(db_path=db_file)
    user_repo = UserFarmsRepository(db_path=db_file)
    return storage, user_repo, db_file

class TestNasaEnvironmentalPipeline:

    def test_smap_synthetic_hdf5_extraction_and_quality_filtering(self, tmp_path):
        """Test SMAP HDF5 parsing, nodata filtering, and quality flag handling."""
        h5_path = tmp_path / "test_smap.h5"
        with h5py.File(str(h5_path), "w") as f:
            grp = f.create_group("Soil_Moisture_Retrieval_Data_AM")
            # Create synthetic 1624 x 3856 raster matching EASE-Grid 2.0
            # Test small grid
            sm = np.full((1624, 3856), -9999.0, dtype=np.float32)
            qf = np.zeros((1624, 3856), dtype=np.uint16)

            # Central Brandenburg cell in EASE-Grid 2.0 (row ~167, col ~2067)
            sm[167, 2067] = 0.285 # Valid soil moisture ~28.5%
            qf[167, 2067] = 0     # Recommended retrieval

            sm[168, 2067] = 0.450 # Degraded cell
            qf[168, 2067] = 1     # Bit 0 set = NOT recommended

            grp.create_dataset("soil_moisture", data=sm)
            grp.create_dataset("retrieval_qual_flag", data=qf)

        potsdam_poly = {
            "type": "Polygon",
            "coordinates": [[
                [13.04, 52.41],
                [13.06, 52.41],
                [13.06, 52.43],
                [13.04, 52.43],
                [13.04, 52.41],
            ]]
        }

        res = smap_extractor.extract_from_hdf5(h5_path, potsdam_poly, field_area_ha=14.5)
        assert res is not None
        assert res["unit"] == "m³/m³"
        assert res["mean"] == pytest.approx(0.285, rel=1e-2)
        assert res["is_coarse_resolution"] is True
        assert "9 km" in res["resolution_limitation"]

    def test_gpm_imerg_rate_conversion_and_accumulation(self, tmp_path):
        """Test GPM IMERG 0.1° grid extraction and mm/hr to mm daily conversion."""
        nc_path = tmp_path / "test_gpm.nc4"
        with h5py.File(str(nc_path), "w") as f:
            grp = f.create_group("Grid")
            # IMERG standard shape (lon=3600, lat=1800)
            precip = np.full((3600, 1800), -9999.9, dtype=np.float32)
            # Potsdam cell: lon ~13.05 -> col ~1930, lat ~52.41 -> row ~1424
            precip[1930, 1424] = 0.5 # 0.5 mm/hr rate
            ds = grp.create_dataset("precipitationCal", data=precip)
            ds.attrs["units"] = "mm/hr"

        potsdam_poly = {
            "type": "Polygon",
            "coordinates": [[
                [13.04, 52.41],
                [13.06, 52.41],
                [13.06, 52.43],
                [13.04, 52.43],
                [13.04, 52.41],
            ]]
        }

        res = gpm_extractor.extract_from_hdf5_or_netcdf(nc_path, potsdam_poly, field_area_ha=14.5)
        assert res is not None
        assert res["unit"] == "mm"
        # 0.5 mm/hr * 24 hrs = 12.0 mm daily accumulation
        assert res["mean"] == pytest.approx(12.0, rel=1e-2)
        assert res["is_coarse_resolution"] is True
        assert "10 km" in res["resolution_limitation"]

    def test_modis_ndvi_evi_scaling_and_reliability_filtering(self, tmp_path):
        """Test MODIS 250m extraction, scale factor 0.0001, and cloud/snow masking."""
        hdf_path = tmp_path / "test_modis.hdf"
        with h5py.File(str(hdf_path), "w") as f:
            grp = f.create_group("MODIS_Grid_16DAY_250m_VI").create_group("Data Fields")
            ndvi = np.full((4800, 4800), -3000, dtype=np.int16)
            evi = np.full((4800, 4800), -3000, dtype=np.int16)
            qa = np.full((4800, 4800), -1, dtype=np.int8)

            # Central Potsdam pixel in Tile h18v03 (approx row 3638, col 3819)
            ndvi[3638, 3819] = 7250 # 0.7250 NDVI
            evi[3638, 3819] = 4850  # 0.4850 EVI
            qa[3638, 3819] = 0      # Good reliability

            # Adjacent cloudy pixel
            ndvi[3638, 3820] = 2000
            qa[3638, 3820] = 3      # Cloudy (must be filtered out)

            grp.create_dataset("250m 16 days NDVI", data=ndvi)
            grp.create_dataset("250m 16 days EVI", data=evi)
            grp.create_dataset("250m 16 days pixel reliability", data=qa)

        potsdam_poly = {
            "type": "Polygon",
            "coordinates": [[
                [13.04, 52.41],
                [13.06, 52.41],
                [13.06, 52.43],
                [13.04, 52.43],
                [13.04, 52.41],
            ]]
        }

        res = modis_extractor.extract_from_hdf_or_raster(hdf_path, potsdam_poly, field_area_ha=3.5)
        assert res is not None
        assert res["ndvi"]["mean"] == pytest.approx(0.7250, rel=1e-3)
        assert res["evi_mean"] == pytest.approx(0.4850, rel=1e-3)
        # Small field < 6.25 ha gets subpixel flag
        assert res["is_subpixel"] is True
        assert "smaller than the 250 m" in res["resolution_limitation"]

    def test_smap_processor_temporal_aggregation(self):
        """Test SMAP weekly, monthly, and seasonal aggregations."""
        observations = [
            {"observation_date": "2026-05-01", "mean_value": 0.25},
            {"observation_date": "2026-05-02", "mean_value": 0.27},
            {"observation_date": "2026-05-15", "mean_value": 0.30},
            {"observation_date": "2026-06-01", "mean_value": 0.22},
        ]
        monthly = smap_processor.calculate_monthly_means(observations)
        assert len(monthly) == 2
        may = next(m for m in monthly if m["month"] == "2026-05")
        assert may["mean_soil_moisture"] == pytest.approx((0.25 + 0.27 + 0.30) / 3, rel=1e-2)

        seasonal = smap_processor.calculate_seasonal_mean(observations)
        assert seasonal["seasonal_mean"] == pytest.approx((0.25 + 0.27 + 0.30 + 0.22) / 4, rel=1e-2)

    def test_gpm_processor_rainy_days_and_heavy_rain(self):
        """Test GPM precipitation accumulation and event counts."""
        observations = [
            {"observation_date": "2026-07-01", "mean_value": 0.2}, # Trace rain (< 1mm)
            {"observation_date": "2026-07-02", "mean_value": 5.4}, # Rainy day
            {"observation_date": "2026-07-03", "mean_value": 24.8}, # Heavy rain (> 20mm)
            {"observation_date": "2026-07-04", "mean_value": 0.0}, # Dry
        ]
        metrics = gpm_processor.calculate_summary_metrics(observations)
        assert metrics["total_accumulation_mm"] == pytest.approx(30.4, rel=1e-2)
        assert metrics["rainy_days_count"] == 2 # 5.4 and 24.8
        assert metrics["heavy_rain_events_count"] == 1 # 24.8

    def test_modis_processor_seasonal_max_and_trend(self):
        """Test MODIS seasonal maximum NDVI and monthly summaries."""
        observations = [
            {"observation_date": "2026-04-15", "mean_value": 0.45, "metadata": {"evi_mean": 0.30}},
            {"observation_date": "2026-05-01", "mean_value": 0.68, "metadata": {"evi_mean": 0.48}},
            {"observation_date": "2026-06-10", "mean_value": 0.82, "metadata": {"evi_mean": 0.58}}, # Peak
            {"observation_date": "2026-07-15", "mean_value": 0.60, "metadata": {"evi_mean": 0.40}},
        ]
        metrics = modis_processor.calculate_seasonal_metrics(observations)
        assert metrics["seasonal_max_ndvi"] == 0.82
        assert metrics["seasonal_mean_ndvi"] == pytest.approx((0.45 + 0.68 + 0.82 + 0.60) / 4, rel=1e-3)
        assert metrics["seasonal_mean_evi"] == pytest.approx((0.30 + 0.48 + 0.58 + 0.40) / 4, rel=1e-3)

    def test_database_persistence_and_duplicate_prevention(self, temp_nasa_db):
        """Verify observations are persistently stored in SQLite and duplicate records upsert cleanly."""
        storage, user_repo, _ = temp_nasa_db

        # Seed farm & field
        farm = user_repo.create_farm("Test Farm", "Potsdam")
        field = user_repo.create_field(
            farm_id=farm["id"],
            name="Field North",
            geometry={
                "type": "Polygon",
                "coordinates": [[[13.0, 52.4], [13.02, 52.4], [13.02, 52.42], [13.0, 52.42], [13.0, 52.4]]]
            },
            area_hectares=12.4,
        )

        obs = {
            "field_id": field["id"],
            "dataset_id": "smap_soil_moisture",
            "observation_date": "2026-06-01",
            "period_start": "2026-06-01T00:00:00Z",
            "period_end": "2026-06-01T23:59:59Z",
            "mean_value": 0.28,
            "minimum_value": 0.26,
            "maximum_value": 0.30,
            "unit": "m³/m³",
            "source_granule": "TEST_SMAP_GRANULE",
        }

        # First insert
        storage.save_observation(obs)
        res = storage.get_field_observations(field["id"])
        assert len(res) == 1
        assert res[0].mean_value == 0.28

        # Duplicate insert on same date/period_start should update, not create 2 rows
        obs_updated = {**obs, "mean_value": 0.31}
        storage.save_observation(obs_updated)

        res2 = storage.get_field_observations(field["id"])
        assert len(res2) == 1
        assert res2[0].mean_value == 0.31

    def test_multipolygon_geometry_support(self):
        """Verify MultiPolygon geometries are handled correctly without projection errors."""
        multi_poly = {
            "type": "MultiPolygon",
            "coordinates": [
                [[[13.0, 52.4], [13.01, 52.4], [13.01, 52.41], [13.0, 52.41], [13.0, 52.4]]],
                [[[13.02, 52.4], [13.03, 52.4], [13.03, 52.41], [13.02, 52.41], [13.02, 52.4]]],
            ]
        }
        ease_geom = reproject_geometry_to_ease(multi_poly)
        sinu_geom = reproject_geometry_to_sinu(multi_poly)
        assert ease_geom.is_valid
        assert sinu_geom.is_valid
        assert ease_geom.geom_type == "MultiPolygon"
        assert sinu_geom.geom_type == "MultiPolygon"

    def test_fastapi_nasa_datasets_metadata_api(self):
        """Test get_nasa_datasets endpoint returns all 3 datasets with resolutions."""
        from app.api.environment import get_nasa_datasets
        datasets = get_nasa_datasets()
        assert len(datasets) >= 3
        ids = [d.id for d in datasets]
        assert "smap_soil_moisture" in ids
        assert "gpm_precipitation" in ids
        assert "modis_vegetation" in ids

    def test_fastapi_environmental_extraction_and_retrieval(self, temp_nasa_db, monkeypatch):
        """Test full extraction workflow and retrieval via endpoint functions with mocked client calls."""
        storage, user_repo, _ = temp_nasa_db
        service = NasaEnvironmentalService(storage=storage)
        service.user_repo = user_repo

        # Mock client methods to return known observations without external network calls
        monkeypatch.setattr(service.smap_client, "fetch_open_smap_daily", lambda lat, lon, start_date, end_date: [
            {
                "observation_date": "2026-05-10",
                "period_start": "2026-05-10T00:00:00Z",
                "period_end": "2026-05-10T23:59:59Z",
                "mean_value": 0.265,
                "minimum_value": 0.24,
                "maximum_value": 0.29,
                "unit": "m³/m³",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "good",
                "source_granule": "MOCK_SMAP_GRANULE",
            }
        ])

        monkeypatch.setattr(service.gpm_client, "fetch_open_gpm_daily", lambda lat, lon, start_date, end_date: [
            {
                "observation_date": "2026-05-10",
                "period_start": "2026-05-10T00:00:00Z",
                "period_end": "2026-05-10T23:59:59Z",
                "mean_value": 14.5,
                "minimum_value": 14.5,
                "maximum_value": 14.5,
                "unit": "mm",
                "valid_pixel_count": 1,
                "coverage_percentage": 100.0,
                "quality_status": "good",
                "source_granule": "MOCK_GPM_GRANULE",
            }
        ])

        monkeypatch.setattr(service.modis_client, "fetch_open_modis_composites", lambda lat, lon, start_date, end_date: [
            {
                "observation_date": "2026-05-09",
                "period_start": "2026-05-09T00:00:00Z",
                "period_end": "2026-05-24T23:59:59Z",
                "mean_value": 0.72,
                "minimum_value": 0.68,
                "maximum_value": 0.76,
                "unit": "index (-0.2 to 1.0)",
                "valid_pixel_count": 4,
                "coverage_percentage": 100.0,
                "quality_status": "good",
                "source_granule": "MOCK_MODIS_GRANULE",
                "metadata": {"evi_mean": 0.49},
            }
        ])

        from app.api import environment
        monkeypatch.setattr(environment, "nasa_environmental_service", service)

        farm = user_repo.create_farm("Potsdam Farm", "Potsdam, Brandenburg")
        field = user_repo.create_field(
            farm_id=farm["id"],
            name="Wheat Parcel 1",
            geometry={
                "type": "Polygon",
                "coordinates": [[[13.04, 52.41], [13.06, 52.41], [13.06, 52.43], [13.04, 52.43], [13.04, 52.41]]]
            },
            area_hectares=15.2,
        )

        from app.api.environment import extract_field_environmental_data, get_field_environmental_data
        from app.services.nasa.schemas import EnvironmentalExtractionRequest

        # Trigger extraction
        post_res = extract_field_environmental_data(
            field_id=field["id"],
            request=EnvironmentalExtractionRequest(
                start_date="2026-05-01",
                end_date="2026-05-30",
                datasets=["smap", "gpm", "modis"],
            ),
        )
        assert post_res.field_id == field["id"]
        assert post_res.smap is not None
        assert post_res.gpm is not None
        assert post_res.modis is not None
        assert post_res.smap.latest_soil_moisture == 0.265
        assert post_res.gpm.latest_precipitation_mm == 14.5
        assert post_res.modis.latest_ndvi == 0.72

        # Retrieve stored data
        retrieved = get_field_environmental_data(
            field_id=field["id"],
            start_date="2026-05-01",
            end_date="2026-05-30",
        )
        assert retrieved.field_id == field["id"]
        assert len(retrieved.smap.observations) == 1
        assert len(retrieved.gpm.observations) == 1
        assert len(retrieved.modis.observations) == 1

    def test_soilgrids_remains_intact_alongside_nasa(self, temp_nasa_db):
        """Verify SoilGrids endpoints and functionality are unaffected by NASA environmental ingestion."""
        from app.api.soil import get_soilgrids_variables
        res = get_soilgrids_variables()
        assert res.source == "ISRIC SoilGrids"
        assert len(res.supported_properties) == 8
