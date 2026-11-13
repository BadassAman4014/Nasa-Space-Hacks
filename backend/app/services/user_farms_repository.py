"""
Persistent SQLite repository for user farms and saved agricultural fields.
Provides fully durable, atomic database persistence independent of reference datasets (DFBK).
Guarantees records persist across backend restarts and system reboots without depending on external daemons.
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional
from shapely.geometry import shape, mapping
from app.services.field_boundaries.geometry_service import calculate_area_hectares, ensure_valid_polygon

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DB_PATH = DATA_DIR / "user_farms_fields.db"

class UserFarmsRepository:
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
        """Create tables and indexes if they do not exist."""
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_farms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    location TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_fields (
                    id TEXT PRIMARY KEY,
                    farm_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    source_boundary_id TEXT,
                    boundary_source TEXT DEFAULT 'DFBK',
                    land_use_category TEXT DEFAULT '',
                    original_geometry TEXT,
                    geometry TEXT NOT NULL,
                    area_hectares REAL NOT NULL,
                    current_crop TEXT DEFAULT '',
                    attribution TEXT DEFAULT '© MLEUV, dl-de/by-2-0',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (farm_id) REFERENCES user_farms (id) ON DELETE CASCADE
                );
            """)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_fields_farm_id ON user_fields(farm_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_fields_source_id ON user_fields(source_boundary_id);")

    # -------------------------------------------------------------
    # Farm Management
    # -------------------------------------------------------------

    def create_farm(self, name: str, location: str = "", farm_id: Optional[str] = None) -> dict[str, Any]:
        """Create a new farm."""
        now = datetime.now(timezone.utc).isoformat()
        fid = farm_id or f"farm-{uuid.uuid4().hex[:8]}"

        with self._connection() as conn:
            # If already exists, return existing
            existing = conn.execute("SELECT id FROM user_farms WHERE id = ?", (fid,)).fetchone()
            if existing:
                return self.get_farm(fid)

            conn.execute(
                "INSERT INTO user_farms (id, name, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (fid, name.strip(), location.strip(), now, now)
            )

        return self.get_farm(fid)

    def get_farm(self, farm_id: str) -> Optional[dict[str, Any]]:
        """Fetch farm by ID with aggregated field count and area."""
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM user_farms WHERE id = ?", (farm_id,)).fetchone()
            if not row:
                return None

            stats = conn.execute(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(area_hectares), 0.0) as total_area FROM user_fields WHERE farm_id = ?",
                (farm_id,)
            ).fetchone()

            return {
                "id": row["id"],
                "name": row["name"],
                "location": row["location"] or "Brandenburg, Germany",
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "field_count": stats["cnt"],
                "total_area_ha": round(stats["total_area"], 2)
            }

    def list_farms(self) -> list[dict[str, Any]]:
        """List all farms with field statistics."""
        with self._connection() as conn:
            rows = conn.execute("SELECT * FROM user_farms ORDER BY created_at ASC").fetchall()
            farms = []
            for r in rows:
                stats = conn.execute(
                    "SELECT COUNT(*) as cnt, COALESCE(SUM(area_hectares), 0.0) as total_area FROM user_fields WHERE farm_id = ?",
                    (r["id"],)
                ).fetchone()

                farms.append({
                    "id": r["id"],
                    "name": r["name"],
                    "location": r["location"] or "Brandenburg, Germany",
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "field_count": stats["cnt"],
                    "total_area_ha": round(stats["total_area"], 2)
                })
            return farms

    def update_farm(self, farm_id: str, name: Optional[str] = None, location: Optional[str] = None) -> Optional[dict[str, Any]]:
        """Update farm details."""
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            cur = conn.execute("SELECT id FROM user_farms WHERE id = ?", (farm_id,))
            if not cur.fetchone():
                return None

            updates = []
            params = []
            if name is not None:
                updates.append("name = ?")
                params.append(name.strip())
            if location is not None:
                updates.append("location = ?")
                params.append(location.strip())

            if updates:
                updates.append("updated_at = ?")
                params.append(now)
                params.append(farm_id)
                query = f"UPDATE user_farms SET {', '.join(updates)} WHERE id = ?"
                conn.execute(query, params)

        return self.get_farm(farm_id)

    def delete_farm(self, farm_id: str) -> bool:
        """Delete farm and all associated fields."""
        with self._connection() as conn:
            cur = conn.execute("DELETE FROM user_farms WHERE id = ?", (farm_id,))
            return cur.rowcount > 0

    # -------------------------------------------------------------
    # Field Management
    # -------------------------------------------------------------

    def create_field(
        self,
        farm_id: str,
        name: str,
        geometry: dict[str, Any],
        current_crop: str = "",
        source_boundary_id: Optional[str] = None,
        boundary_source: str = "DFBK",
        land_use_category: str = "",
        original_geometry: Optional[dict[str, Any]] = None,
        area_hectares: Optional[float] = None
    ) -> dict[str, Any]:
        """Validate and save a new user field."""
        farm = self.get_farm(farm_id)
        if not farm:
            farm = self.create_farm(name=farm_id.replace("farm-", "Farm ").title(), farm_id=farm_id)

        # Prevent duplicate saves of identical source boundary in the same farm
        if source_boundary_id:
            existing = self.find_by_source_boundary(farm_id, source_boundary_id)
            if existing:
                return existing

        # Validate geometry
        geom_obj = shape(geometry)
        valid_geom = ensure_valid_polygon(geom_obj)
        if not valid_geom or valid_geom.is_empty:
            raise ValueError("Invalid polygon geometry provided.")

        valid_geo_dict = mapping(valid_geom)

        if area_hectares is None or area_hectares <= 0:
            area_hectares = calculate_area_hectares(valid_geom, is_wgs84=True)

        now = datetime.now(timezone.utc).isoformat()
        field_id = f"field-{uuid.uuid4().hex[:10]}"

        orig_geo_str = json.dumps(original_geometry or valid_geo_dict)
        geom_str = json.dumps(valid_geo_dict)

        with self._connection() as conn:
            conn.execute("""
                INSERT INTO user_fields (
                    id, farm_id, name, source_boundary_id, boundary_source,
                    land_use_category, original_geometry, geometry, area_hectares,
                    current_crop, attribution, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                field_id, farm_id, name.strip(), source_boundary_id, boundary_source,
                land_use_category, orig_geo_str, geom_str, round(area_hectares, 3),
                current_crop.strip(), "© MLEUV, dl-de/by-2-0", now, now
            ))

        return self.get_field(field_id)

    def get_field(self, field_id: str) -> Optional[dict[str, Any]]:
        """Fetch field by ID."""
        with self._connection() as conn:
            row = conn.execute("""
                SELECT f.*, u.name as farm_name, u.location as farm_location
                FROM user_fields f
                JOIN user_farms u ON f.farm_id = u.id
                WHERE f.id = ?
            """, (field_id,)).fetchone()

            if not row:
                return None

            return self._row_to_field(row)

    def find_by_source_boundary(self, farm_id: str, source_boundary_id: str) -> Optional[dict[str, Any]]:
        """Check for existing field block in farm."""
        with self._connection() as conn:
            row = conn.execute("""
                SELECT f.*, u.name as farm_name, u.location as farm_location
                FROM user_fields f
                JOIN user_farms u ON f.farm_id = u.id
                WHERE f.farm_id = ? AND f.source_boundary_id = ?
            """, (farm_id, source_boundary_id)).fetchone()

            if not row:
                return None
            return self._row_to_field(row)

    def list_fields(self, farm_id: Optional[str] = None) -> list[dict[str, Any]]:
        """List fields, optionally filtered by farm ID."""
        with self._connection() as conn:
            if farm_id and farm_id.lower() != "all":
                rows = conn.execute("""
                    SELECT f.*, u.name as farm_name, u.location as farm_location
                    FROM user_fields f
                    JOIN user_farms u ON f.farm_id = u.id
                    WHERE f.farm_id = ?
                    ORDER BY f.created_at DESC
                """, (farm_id,)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT f.*, u.name as farm_name, u.location as farm_location
                    FROM user_fields f
                    JOIN user_farms u ON f.farm_id = u.id
                    ORDER BY f.created_at DESC
                """).fetchall()

            return [self._row_to_field(r) for r in rows]

    def update_field(
        self,
        field_id: str,
        name: Optional[str] = None,
        farm_id: Optional[str] = None,
        current_crop: Optional[str] = None,
        geometry: Optional[dict[str, Any]] = None
    ) -> Optional[dict[str, Any]]:
        """Update field properties or geometry."""
        now = datetime.now(timezone.utc).isoformat()

        with self._connection() as conn:
            cur = conn.execute("SELECT id FROM user_fields WHERE id = ?", (field_id,))
            if not cur.fetchone():
                return None

            updates = []
            params = []

            if name is not None:
                updates.append("name = ?")
                params.append(name.strip())

            if farm_id is not None:
                farm_chk = conn.execute("SELECT id FROM user_farms WHERE id = ?", (farm_id,)).fetchone()
                if not farm_chk:
                    raise ValueError(f"Target farm '{farm_id}' does not exist.")
                updates.append("farm_id = ?")
                params.append(farm_id)

            if current_crop is not None:
                updates.append("current_crop = ?")
                params.append(current_crop.strip())

            if geometry is not None:
                geom_obj = shape(geometry)
                valid_geom = ensure_valid_polygon(geom_obj)
                if not valid_geom or valid_geom.is_empty:
                    raise ValueError("Updated geometry is invalid.")
                valid_dict = mapping(valid_geom)
                area_ha = calculate_area_hectares(valid_geom, is_wgs84=True)

                updates.append("geometry = ?")
                params.append(json.dumps(valid_dict))
                updates.append("area_hectares = ?")
                params.append(round(area_ha, 3))
                updates.append("attribution = ?")
                params.append("© MLEUV, dl-de/by-2-0, Daten verändert")

            if updates:
                updates.append("updated_at = ?")
                params.append(now)
                params.append(field_id)
                query = f"UPDATE user_fields SET {', '.join(updates)} WHERE id = ?"
                conn.execute(query, params)

        return self.get_field(field_id)

    def delete_field(self, field_id: str) -> bool:
        """Delete a user field record (does NOT touch DFBK reference data)."""
        with self._connection() as conn:
            cur = conn.execute("DELETE FROM user_fields WHERE id = ?", (field_id,))
            return cur.rowcount > 0

    def _row_to_field(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "farm_id": row["farm_id"],
            "farm_name": row["farm_name"],
            "farm_location": row["farm_location"],
            "name": row["name"],
            "source_boundary_id": row["source_boundary_id"],
            "boundary_source": row["boundary_source"],
            "land_use_category": row["land_use_category"],
            "original_geometry": json.loads(row["original_geometry"]) if row["original_geometry"] else None,
            "geometry": json.loads(row["geometry"]),
            "area_hectares": float(row["area_hectares"]),
            "current_crop": row["current_crop"] or "",
            "attribution": row["attribution"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }

# Singleton instance
user_farms_repo = UserFarmsRepository()
