"""
SQLite database repository for field soil profiles and measurements.
Persists SoilGrids extraction data into user_farms_fields.db.
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional
from app.services.soilgrids.schemas import SoilMeasurement, TopsoilSummary, SoilProfileResponse

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
DB_PATH = DATA_DIR / "user_farms_fields.db"

class SoilRepository:
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
        """Create tables for soil profiles and depth measurements."""
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_soil_profiles (
                    id TEXT PRIMARY KEY,
                    field_id TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'ISRIC SoilGrids',
                    dataset_version TEXT NOT NULL DEFAULT '2.0.0',
                    spatial_resolution TEXT NOT NULL DEFAULT '250m',
                    extraction_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    coverage_percentage REAL NOT NULL DEFAULT 0.0,
                    is_subpixel INTEGER NOT NULL DEFAULT 0,
                    resolution_limitation TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (field_id) REFERENCES user_fields (id) ON DELETE CASCADE
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_soil_measurements (
                    id TEXT PRIMARY KEY,
                    soil_profile_id TEXT NOT NULL,
                    property_name TEXT NOT NULL,
                    depth_interval TEXT NOT NULL,
                    mean_value REAL NOT NULL,
                    minimum_value REAL NOT NULL,
                    maximum_value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    raw_mean REAL,
                    valid_pixel_count INTEGER NOT NULL DEFAULT 0,
                    coverage_percentage REAL NOT NULL DEFAULT 0.0,
                    FOREIGN KEY (soil_profile_id) REFERENCES field_soil_profiles (id) ON DELETE CASCADE
                );
            """)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_soil_profiles_field_id ON field_soil_profiles(field_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_soil_measurements_profile ON field_soil_measurements(soil_profile_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_soil_measurements_prop ON field_soil_measurements(property_name, depth_interval);")

    def save_soil_profile(
        self,
        field_id: str,
        status: str,
        coverage_percentage: float,
        is_subpixel: bool,
        resolution_limitation: Optional[str],
        measurements: list[SoilMeasurement],
        dataset_version: str = "2.0.0",
        source: str = "ISRIC SoilGrids",
    ) -> str:
        """
        Atomically save or update a field's soil profile and all depth measurements.
        Replaces any existing profile for this field to maintain a single current profile.
        """
        now = datetime.now(timezone.utc).isoformat()
        profile_id = f"soil-{uuid.uuid4().hex[:10]}"

        with self._connection() as conn:
            # Delete any existing soil profile for this field (cascades to measurements)
            conn.execute("DELETE FROM field_soil_profiles WHERE field_id = ?;", (field_id,))

            conn.execute(
                """
                INSERT INTO field_soil_profiles (
                    id, field_id, source, dataset_version, spatial_resolution,
                    extraction_date, status, coverage_percentage, is_subpixel,
                    resolution_limitation, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    profile_id,
                    field_id,
                    source,
                    dataset_version,
                    "250m",
                    now,
                    status,
                    coverage_percentage,
                    1 if is_subpixel else 0,
                    resolution_limitation,
                    now,
                    now,
                ),
            )

            for m in measurements:
                m_id = f"sm-{uuid.uuid4().hex[:10]}"
                conn.execute(
                    """
                    INSERT INTO field_soil_measurements (
                        id, soil_profile_id, property_name, depth_interval,
                        mean_value, minimum_value, maximum_value, unit,
                        raw_mean, valid_pixel_count, coverage_percentage
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        m_id,
                        profile_id,
                        m.property_name,
                        m.depth_interval,
                        m.mean_value,
                        m.minimum_value,
                        m.maximum_value,
                        m.unit,
                        m.raw_mean,
                        m.valid_pixel_count,
                        m.coverage_percentage,
                    ),
                )

        return profile_id

    def get_soil_profile(self, field_id: str) -> Optional[dict[str, Any]]:
        """
        Retrieve the latest persistent soil profile and measurements for a field.
        """
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM field_soil_profiles WHERE field_id = ? ORDER BY created_at DESC LIMIT 1;",
                (field_id,),
            )
            row = cur.fetchone()
            if not row:
                return None

            profile_dict = dict(row)
            profile_id = profile_dict["id"]

            cur_m = conn.execute(
                "SELECT * FROM field_soil_measurements WHERE soil_profile_id = ? ORDER BY property_name, depth_interval;",
                (profile_id,),
            )
            measurements = [dict(m_row) for m_row in cur_m.fetchall()]
            profile_dict["measurements"] = measurements

            return profile_dict

    def delete_soil_profile(self, field_id: str) -> bool:
        """Delete soil profile for a field."""
        with self._connection() as conn:
            cur = conn.execute("DELETE FROM field_soil_profiles WHERE field_id = ?;", (field_id,))
            return cur.rowcount > 0

soil_repository = SoilRepository()

