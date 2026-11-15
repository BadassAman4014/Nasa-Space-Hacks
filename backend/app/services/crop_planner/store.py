"""SQLite storage for the crop planner: farmer inputs, cached NASA POWER daily weather, cached signals, saved recommendations."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "crop_planner.db"

SOIL_TEXTURES = ("sandboden", "lehmboden", "tonboden", "moorboden")
PRIORITIES = ("save_water", "reduce_nitrogen", "prevent_erosion", "break_pest_cycles")
IRRIGATION = ("rainfed", "irrigated")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PlannerStore:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
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

    def _init(self) -> None:
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS planner_inputs (
                    field_id TEXT PRIMARY KEY,
                    history_json TEXT NOT NULL,
                    soil_texture TEXT,
                    priority TEXT,
                    irrigation TEXT,
                    updated_at TEXT NOT NULL
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS power_daily (
                    point_key TEXT NOT NULL,
                    day TEXT NOT NULL,
                    t2m REAL, tmax REAL, tmin REAL, precip REAL, evland REAL,
                    PRIMARY KEY (point_key, day)
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS power_years (
                    point_key TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    n_days INTEGER NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (point_key, year)
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS signal_cache (
                    field_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (field_id, name)
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS recommendations (
                    id TEXT PRIMARY KEY,
                    field_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )"""
            )

    # ---- farmer inputs ------------------------------------------------------------------------
    def get_inputs(self, field_id: str) -> Dict[str, Any]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM planner_inputs WHERE field_id = ?", (field_id,)).fetchone()
        if not row:
            return {"field_id": field_id, "history": [], "soil_texture": None, "priority": None, "irrigation": None, "updated_at": None}
        return {
            "field_id": field_id,
            "history": json.loads(row["history_json"]),
            "soil_texture": row["soil_texture"],
            "priority": row["priority"],
            "irrigation": row["irrigation"],
            "updated_at": row["updated_at"],
        }

    def save_inputs(self, field_id: str, history: List[Dict[str, Any]], soil_texture: Optional[str], priority: Optional[str], irrigation: Optional[str]) -> Dict[str, Any]:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO planner_inputs VALUES (?, ?, ?, ?, ?, ?)",
                (field_id, json.dumps(history), soil_texture, priority, irrigation, _now()),
            )
        return self.get_inputs(field_id)

    # ---- POWER daily weather ------------------------------------------------------------------
    def power_years_cached(self, key: str) -> Dict[int, int]:
        with self._conn() as c:
            rows = c.execute("SELECT year, n_days FROM power_years WHERE point_key = ?", (key,)).fetchall()
        return {r["year"]: r["n_days"] for r in rows}

    def save_power_year(self, key: str, year: int, rows: Iterable[Tuple[str, Optional[float], Optional[float], Optional[float], Optional[float], Optional[float]]]) -> int:
        rows = list(rows)
        with self._conn() as c:
            c.executemany(
                "INSERT OR REPLACE INTO power_daily (point_key, day, t2m, tmax, tmin, precip, evland) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(key, *r) for r in rows],
            )
            c.execute("INSERT OR REPLACE INTO power_years VALUES (?, ?, ?, ?)", (key, year, len(rows), _now()))
        return len(rows)

    def power_range(self, key: str, start: str, end: str) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT day, t2m, tmax, tmin, precip, evland FROM power_daily WHERE point_key = ? AND day BETWEEN ? AND ? ORDER BY day",
                (key, start, end),
            ).fetchall()
        return [dict(r) for r in rows]

    def power_fetched_at(self, key: str) -> Optional[str]:
        with self._conn() as c:
            row = c.execute("SELECT MAX(fetched_at) FROM power_years WHERE point_key = ?", (key,)).fetchone()
        return row[0] if row else None

    # ---- generic signal cache -----------------------------------------------------------------
    def put_signal(self, field_id: str, name: str, payload: Dict[str, Any]) -> None:
        with self._conn() as c:
            c.execute("INSERT OR REPLACE INTO signal_cache VALUES (?, ?, ?, ?)", (field_id, name, json.dumps(payload), _now()))

    def get_signal(self, field_id: str, name: str) -> Optional[Dict[str, Any]]:
        with self._conn() as c:
            row = c.execute("SELECT payload_json, fetched_at FROM signal_cache WHERE field_id = ? AND name = ?", (field_id, name)).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload_json"])
        payload["_fetched_at"] = row["fetched_at"]
        return payload

    # ---- recommendations ----------------------------------------------------------------------
    def save_recommendation(self, field_id: str, payload: Dict[str, Any]) -> str:
        rid = f"rec-{uuid.uuid4().hex[:12]}"
        payload = {**payload, "id": rid}
        with self._conn() as c:
            c.execute("INSERT INTO recommendations VALUES (?, ?, ?, ?)", (rid, field_id, json.dumps(payload), _now()))
        return rid

    def get_recommendation(self, rid: str) -> Optional[Dict[str, Any]]:
        with self._conn() as c:
            row = c.execute("SELECT payload_json FROM recommendations WHERE id = ?", (rid,)).fetchone()
        return json.loads(row["payload_json"]) if row else None


planner_store = PlannerStore()
