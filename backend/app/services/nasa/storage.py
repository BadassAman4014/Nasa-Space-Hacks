"""
SQLite database repository for NASA Earth Observation datasets, observations, and temporal summaries.
Persists records in backend/data/user_farms_fields.db alongside user fields.
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional
from app.services.nasa.schemas import (
    EnvironmentalDatasetInfo,
    EnvironmentalObservationItem,
    EnvironmentalSummaryItem,
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
DB_PATH = DATA_DIR / "user_farms_fields.db"

# Seed definitions for official NASA products
DEFAULT_DATASETS = [
    {
        "id": "smap_soil_moisture",
        "source": "NASA SMAP",
        "product_id": "SPL3SMP_E.006",
        "product_version": "006",
        "variable_name": "soil_moisture",
        "native_unit": "m³/m³",
        "spatial_resolution": "9 km",
        "temporal_resolution": "Daily",
        "description": "SMAP Enhanced L3 Radiometer Global Daily 9 km EASE-Grid Surface Soil Moisture (volumetric water content)",
        "is_coarse_resolution": 1,
        "effective_resolution_note": "At ~9 km spatial resolution, values represent regional volumetric soil moisture encompassing the field centroid.",
    },
    {
        "id": "gpm_precipitation",
        "source": "NASA GPM",
        "product_id": "GPM_3IMERGDF.07",
        "product_version": "V07B",
        "variable_name": "precipitation",
        "native_unit": "mm",
        "spatial_resolution": "10 km (0.1°)",
        "temporal_resolution": "Daily accumulation",
        "description": "GPM IMERG Final Run V07B daily accumulated precipitation",
        "is_coarse_resolution": 1,
        "effective_resolution_note": "At ~10 km (0.1°) spatial resolution, values represent regional satellite radar/radiometer precipitation estimates covering the field area.",
    },
    {
        "id": "modis_vegetation",
        "source": "NASA MODIS",
        "product_id": "MOD13Q1.061",
        "product_version": "061",
        "variable_name": "ndvi_evi",
        "native_unit": "index (-0.2 to 1.0)",
        "spatial_resolution": "250 m",
        "temporal_resolution": "16-Day composite",
        "description": "MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m SIN Grid (NDVI and EVI with quality filtering)",
        "is_coarse_resolution": 0,
        "effective_resolution_note": "250 m pixel resolution. Quality-filtered for cloud, shadow, and snow masking.",
    },
]

class NasaStorageRepository:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        """Create tables for NASA environmental datasets, observations, and temporal summaries."""
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS environmental_datasets (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    product_version TEXT NOT NULL,
                    variable_name TEXT NOT NULL,
                    native_unit TEXT NOT NULL,
                    spatial_resolution TEXT NOT NULL,
                    temporal_resolution TEXT NOT NULL,
                    description TEXT NOT NULL,
                    is_coarse_resolution INTEGER NOT NULL DEFAULT 0,
                    effective_resolution_note TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_environmental_observations (
                    id TEXT PRIMARY KEY,
                    field_id TEXT NOT NULL,
                    dataset_id TEXT NOT NULL,
                    observation_date TEXT NOT NULL,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    mean_value REAL NOT NULL,
                    minimum_value REAL NOT NULL,
                    maximum_value REAL NOT NULL,
                    standard_deviation REAL NOT NULL DEFAULT 0.0,
                    unit TEXT NOT NULL,
                    valid_pixel_count INTEGER NOT NULL DEFAULT 0,
                    coverage_percentage REAL NOT NULL DEFAULT 0.0,
                    quality_status TEXT NOT NULL,
                    source_granule TEXT NOT NULL,
                    metadata_json TEXT DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (field_id) REFERENCES user_fields (id) ON DELETE CASCADE,
                    FOREIGN KEY (dataset_id) REFERENCES environmental_datasets (id) ON DELETE CASCADE,
                    UNIQUE (field_id, dataset_id, observation_date, period_start)
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_environmental_summaries (
                    id TEXT PRIMARY KEY,
                    field_id TEXT NOT NULL,
                    dataset_id TEXT NOT NULL,
                    aggregation_type TEXT NOT NULL,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    coverage_percentage REAL NOT NULL DEFAULT 100.0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (field_id) REFERENCES user_fields (id) ON DELETE CASCADE,
                    FOREIGN KEY (dataset_id) REFERENCES environmental_datasets (id) ON DELETE CASCADE
                );
            """)

            # Indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_env_obs_field ON field_environmental_observations(field_id, dataset_id, observation_date);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_env_obs_date ON field_environmental_observations(observation_date);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_env_sum_field ON field_environmental_summaries(field_id, dataset_id, period_start, period_end);")

            # Seed datasets if empty
            for ds in DEFAULT_DATASETS:
                conn.execute("""
                    INSERT OR IGNORE INTO environmental_datasets (
                        id, source, product_id, product_version, variable_name,
                        native_unit, spatial_resolution, temporal_resolution,
                        description, is_coarse_resolution, effective_resolution_note, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    ds["id"], ds["source"], ds["product_id"], ds["product_version"],
                    ds["variable_name"], ds["native_unit"], ds["spatial_resolution"],
                    ds["temporal_resolution"], ds["description"], ds["is_coarse_resolution"],
                    ds["effective_resolution_note"], datetime.now(timezone.utc).isoformat()
                ))

    def list_datasets(self) -> list[EnvironmentalDatasetInfo]:
        """List all supported NASA environmental datasets."""
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM environmental_datasets ORDER BY source;")
            rows = cur.fetchall()
            return [
                EnvironmentalDatasetInfo(
                    id=row["id"],
                    source=row["source"],
                    product_id=row["product_id"],
                    product_version=row["product_version"],
                    variable_name=row["variable_name"],
                    native_unit=row["native_unit"],
                    spatial_resolution=row["spatial_resolution"],
                    temporal_resolution=row["temporal_resolution"],
                    description=row["description"],
                    is_coarse_resolution=bool(row["is_coarse_resolution"]),
                    effective_resolution_note=row["effective_resolution_note"],
                )
                for row in rows
            ]

    def get_dataset(self, dataset_id: str) -> Optional[EnvironmentalDatasetInfo]:
        """Get dataset metadata by ID."""
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM environmental_datasets WHERE id = ?;", (dataset_id,))
            row = cur.fetchone()
            if not row:
                return None
            return EnvironmentalDatasetInfo(
                id=row["id"],
                source=row["source"],
                product_id=row["product_id"],
                product_version=row["product_version"],
                variable_name=row["variable_name"],
                native_unit=row["native_unit"],
                spatial_resolution=row["spatial_resolution"],
                temporal_resolution=row["temporal_resolution"],
                description=row["description"],
                is_coarse_resolution=bool(row["is_coarse_resolution"]),
                effective_resolution_note=row["effective_resolution_note"],
            )

    def save_observation(self, obs: dict[str, Any]) -> str:
        """
        Atomically insert or update an environmental observation.
        Prevents duplicate observations for same field, dataset, date, and period_start.
        """
        obs_id = obs.get("id") or f"env-{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()
        meta_json = json.dumps(obs.get("metadata", {}))

        with self._connection() as conn:
            conn.execute("""
                INSERT INTO field_environmental_observations (
                    id, field_id, dataset_id, observation_date, period_start, period_end,
                    mean_value, minimum_value, maximum_value, standard_deviation, unit,
                    valid_pixel_count, coverage_percentage, quality_status, source_granule,
                    metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(field_id, dataset_id, observation_date, period_start) DO UPDATE SET
                    mean_value=excluded.mean_value,
                    minimum_value=excluded.minimum_value,
                    maximum_value=excluded.maximum_value,
                    standard_deviation=excluded.standard_deviation,
                    valid_pixel_count=excluded.valid_pixel_count,
                    coverage_percentage=excluded.coverage_percentage,
                    quality_status=excluded.quality_status,
                    source_granule=excluded.source_granule,
                    metadata_json=excluded.metadata_json;
            """, (
                obs_id,
                obs["field_id"],
                obs["dataset_id"],
                obs["observation_date"],
                obs["period_start"],
                obs["period_end"],
                obs["mean_value"],
                obs["minimum_value"],
                obs["maximum_value"],
                obs.get("standard_deviation", 0.0),
                obs["unit"],
                obs.get("valid_pixel_count", 1),
                obs.get("coverage_percentage", 100.0),
                obs.get("quality_status", "good"),
                obs.get("source_granule", "unknown"),
                meta_json,
                now,
            ))
        return obs_id

    def get_field_observations(
        self,
        field_id: str,
        dataset_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> list[EnvironmentalObservationItem]:
        """Query observations for a field with optional dataset and date range filtering."""
        query = """
            SELECT o.*, d.source, d.variable_name, d.is_coarse_resolution, d.effective_resolution_note
            FROM field_environmental_observations o
            JOIN environmental_datasets d ON o.dataset_id = d.id
            WHERE o.field_id = ?
        """
        params: list[Any] = [field_id]

        if dataset_id:
            query += " AND o.dataset_id = ?"
            params.append(dataset_id)
        if start_date:
            query += " AND o.observation_date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND o.observation_date <= ?"
            params.append(end_date)

        query += " ORDER BY o.observation_date ASC;"

        with self._connection() as conn:
            cur = conn.execute(query, params)
            rows = cur.fetchall()
            items = []
            for r in rows:
                meta = {}
                try:
                    meta = json.loads(r["metadata_json"] or "{}")
                except Exception:
                    pass

                items.append(
                    EnvironmentalObservationItem(
                        id=r["id"],
                        field_id=r["field_id"],
                        dataset_id=r["dataset_id"],
                        source=r["source"],
                        variable_name=r["variable_name"],
                        observation_date=r["observation_date"],
                        period_start=r["period_start"],
                        period_end=r["period_end"],
                        mean_value=r["mean_value"],
                        minimum_value=r["minimum_value"],
                        maximum_value=r["maximum_value"],
                        standard_deviation=r["standard_deviation"],
                        unit=r["unit"],
                        valid_pixel_count=r["valid_pixel_count"],
                        coverage_percentage=r["coverage_percentage"],
                        quality_status=r["quality_status"],
                        source_granule=r["source_granule"],
                        is_coarse_resolution=bool(r["is_coarse_resolution"]),
                        resolution_limitation=r["effective_resolution_note"] if bool(r["is_coarse_resolution"]) else None,
                        metadata=meta,
                        created_at=r["created_at"],
                    )
                )
            return items

    def save_summaries(self, field_id: str, dataset_id: str, summaries: list[dict[str, Any]]):
        """Save temporal summaries (weekly, monthly, seasonal, counts)."""
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            # Delete previous summaries for this field and dataset to avoid duplicates
            conn.execute(
                "DELETE FROM field_environmental_summaries WHERE field_id = ? AND dataset_id = ?;",
                (field_id, dataset_id),
            )
            for s in summaries:
                s_id = f"sum-{uuid.uuid4().hex[:10]}"
                conn.execute("""
                    INSERT INTO field_environmental_summaries (
                        id, field_id, dataset_id, aggregation_type, period_start, period_end,
                        metric_name, metric_value, unit, coverage_percentage, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    s_id,
                    field_id,
                    dataset_id,
                    s["aggregation_type"],
                    s["period_start"],
                    s["period_end"],
                    s["metric_name"],
                    s["metric_value"],
                    s["unit"],
                    s.get("coverage_percentage", 100.0),
                    now,
                ))

    def get_field_summaries(
        self,
        field_id: str,
        dataset_id: Optional[str] = None,
    ) -> list[EnvironmentalSummaryItem]:
        """Retrieve stored temporal summaries for a field."""
        query = "SELECT * FROM field_environmental_summaries WHERE field_id = ?"
        params: list[Any] = [field_id]
        if dataset_id:
            query += " AND dataset_id = ?"
            params.append(dataset_id)
        query += " ORDER BY period_start ASC, metric_name ASC;"

        with self._connection() as conn:
            cur = conn.execute(query, params)
            rows = cur.fetchall()
            return [
                EnvironmentalSummaryItem(
                    id=r["id"],
                    field_id=r["field_id"],
                    dataset_id=r["dataset_id"],
                    aggregation_type=r["aggregation_type"],
                    period_start=r["period_start"],
                    period_end=r["period_end"],
                    metric_name=r["metric_name"],
                    metric_value=r["metric_value"],
                    unit=r["unit"],
                    coverage_percentage=r["coverage_percentage"],
                )
                for r in rows
            ]

nasa_storage = NasaStorageRepository()
