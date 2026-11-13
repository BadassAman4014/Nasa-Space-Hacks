"""
Durable SQLite persistence for Field Analytics & Historical Satellite Report.
Stores planting dates, satellite observation time series, weather statistics,
and computed productivity reports.
"""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DATA_DIR / "field_analytics.db"

class FieldAnalyticsRepository:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
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
        """Create necessary tables and indices."""
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_planting_dates (
                    field_id TEXT PRIMARY KEY,
                    planting_date TEXT NOT NULL,
                    harvest_date TEXT,
                    crop TEXT,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_satellite_observations (
                    id TEXT PRIMARY KEY,
                    field_id TEXT NOT NULL,
                    scene_id TEXT NOT NULL,
                    acquisition_date TEXT NOT NULL,
                    sensor TEXT NOT NULL,
                    cloud_cover REAL NOT NULL,
                    mean_ndvi REAL NOT NULL,
                    median_ndvi REAL NOT NULL,
                    min_ndvi REAL NOT NULL,
                    max_ndvi REAL NOT NULL,
                    std_ndvi REAL NOT NULL,
                    valid_pixel_percent REAL NOT NULL,
                    valid_pixel_count INTEGER NOT NULL,
                    is_included INTEGER NOT NULL DEFAULT 1,
                    season TEXT NOT NULL,
                    preview_json TEXT,
                    created_at TEXT NOT NULL
                );
            """)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_fso_field_date ON field_satellite_observations(field_id, acquisition_date);")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_weather_cache (
                    field_id TEXT PRIMARY KEY,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS field_report_cache (
                    field_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

    # -------------------------------------------------------------
    # Planting Date
    # -------------------------------------------------------------
    def get_planting_date(self, field_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT field_id, planting_date, harvest_date, crop, updated_at FROM field_planting_dates WHERE field_id = ?",
                (field_id,)
            ).fetchone()
            return dict(row) if row else None

    def upsert_planting_date(self, field_id: str, planting_date: str, harvest_date: Optional[str] = None, crop: Optional[str] = None) -> Dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute("""
                INSERT INTO field_planting_dates (field_id, planting_date, harvest_date, crop, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(field_id) DO UPDATE SET
                    planting_date = excluded.planting_date,
                    harvest_date = excluded.harvest_date,
                    crop = COALESCE(excluded.crop, field_planting_dates.crop),
                    updated_at = excluded.updated_at
            """, (field_id, planting_date, harvest_date, crop, now))
        return self.get_planting_date(field_id) or {"field_id": field_id, "planting_date": planting_date, "harvest_date": harvest_date}

    # -------------------------------------------------------------
    # Satellite Observations
    # -------------------------------------------------------------
    def save_observations(self, field_id: str, observations: List[Dict[str, Any]]):
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            for obs in observations:
                preview = json.dumps({
                    "rgb_preview_url": obs.get("rgb_preview_url"),
                    "ndvi_preview_url": obs.get("ndvi_preview_url"),
                    "ndvi_grid": obs.get("ndvi_grid")
                })
                conn.execute("""
                    INSERT OR REPLACE INTO field_satellite_observations (
                        id, field_id, scene_id, acquisition_date, sensor, cloud_cover,
                        mean_ndvi, median_ndvi, min_ndvi, max_ndvi, std_ndvi,
                        valid_pixel_percent, valid_pixel_count, is_included, season,
                        preview_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    obs["id"], field_id, obs.get("scene_id") or "S2", obs["acquisition_date"],
                    obs.get("sensor") or "Sentinel-2 L2A", float(obs.get("cloud_cover_percent") if obs.get("cloud_cover_percent") is not None else 0.0),
                    float(obs.get("mean_ndvi") if obs.get("mean_ndvi") is not None else 0.0),
                    float(obs.get("median_ndvi") if obs.get("median_ndvi") is not None else 0.0),
                    float(obs.get("min_ndvi") if obs.get("min_ndvi") is not None else 0.0),
                    float(obs.get("max_ndvi") if obs.get("max_ndvi") is not None else 0.0),
                    float(obs.get("std_ndvi") if obs.get("std_ndvi") is not None else 0.0),
                    float(obs.get("valid_pixel_percent") if obs.get("valid_pixel_percent") is not None else 100.0),
                    int(obs.get("valid_pixel_count") if obs.get("valid_pixel_count") is not None else 100),
                    1 if obs.get("is_included", True) else 0,
                    obs.get("season") or "2024", preview, now
                ))

    def count_observations(self, field_id: str, season: Optional[str] = None) -> int:
        with self._connection() as conn:
            query = "SELECT COUNT(*) FROM field_satellite_observations WHERE field_id = ?"
            params: List[Any] = [field_id]
            if season:
                query += " AND season = ?"
                params.append(season)
            row = conn.execute(query, tuple(params)).fetchone()
            return int(row[0]) if row else 0

    def get_observations(
        self,
        field_id: str,
        season: Optional[str] = None,
        order: str = "asc",
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        with self._connection() as conn:
            query = "SELECT * FROM field_satellite_observations WHERE field_id = ?"
            params: List[Any] = [field_id]
            if season:
                query += " AND season = ?"
                params.append(season)

            sort_order = "DESC" if order.lower() == "desc" else "ASC"
            query += f" ORDER BY acquisition_date {sort_order}"

            if limit is not None:
                query += " LIMIT ? OFFSET ?"
                params.extend([limit, offset])

            rows = conn.execute(query, tuple(params)).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["is_included"] = bool(d["is_included"])
                if d.get("preview_json"):
                    try:
                        p = json.loads(d["preview_json"])
                        d["rgb_preview_url"] = p.get("rgb_preview_url")
                        d["ndvi_preview_url"] = p.get("ndvi_preview_url")
                        d["ndvi_grid"] = p.get("ndvi_grid")
                    except Exception:
                        pass
                results.append(d)
            return results

    def toggle_observation(self, field_id: str, observation_id: str, is_included: bool) -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE field_satellite_observations SET is_included = ? WHERE field_id = ? AND id = ?",
                (1 if is_included else 0, field_id, observation_id)
            )
            return cursor.rowcount > 0

    # -------------------------------------------------------------
    # Cache
    # -------------------------------------------------------------
    def get_weather_cache(self, field_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            row = conn.execute("SELECT payload_json FROM field_weather_cache WHERE field_id = ?", (field_id,)).fetchone()
            if row:
                try:
                    return json.loads(row["payload_json"])
                except Exception:
                    pass
        return None

    def set_weather_cache(self, field_id: str, start_date: str, end_date: str, payload: Dict[str, Any]):
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO field_weather_cache (field_id, start_date, end_date, payload_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """, (field_id, start_date, end_date, json.dumps(payload), now))

    def get_report_cache(self, field_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            row = conn.execute("SELECT payload_json FROM field_report_cache WHERE field_id = ?", (field_id,)).fetchone()
            if row:
                try:
                    return json.loads(row["payload_json"])
                except Exception:
                    pass
        return None

    def set_report_cache(self, field_id: str, payload: Dict[str, Any]):
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO field_report_cache (field_id, payload_json, updated_at)
                VALUES (?, ?, ?)
            """, (field_id, json.dumps(payload), now))

    def invalidate_report_cache(self, field_id: str):
        with self._connection() as conn:
            conn.execute("DELETE FROM field_report_cache WHERE field_id = ?", (field_id,))

analytics_repo = FieldAnalyticsRepository()
