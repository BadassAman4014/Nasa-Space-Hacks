"""SQLite cache for real NASA point values, AppEEARS tasks and IMERG cells."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

DB_PATH = Path(__file__).resolve().parents[3] / "data" / "nasa_real_data.db"


def point_key(lat: float, lon: float) -> str:
    """Stable key for a location (4 decimals ~ 11 m, far finer than any product used here)."""
    return f"{lat:.4f}_{lon:.4f}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RealDataStore:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
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
                """CREATE TABLE IF NOT EXISTS point_values (
                    point_key TEXT NOT NULL,
                    product TEXT NOT NULL,
                    variable TEXT NOT NULL,
                    obs_time TEXT NOT NULL,
                    value REAL,
                    qc REAL,
                    source_ref TEXT NOT NULL,
                    PRIMARY KEY (point_key, product, variable, obs_time)
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS appeears_tasks (
                    task_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    target_key TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT,
                    submitted_at TEXT NOT NULL,
                    checked_at TEXT,
                    completed_at TEXT
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS imerg_cells (
                    cell_key TEXT NOT NULL,
                    obs_date TEXT NOT NULL,
                    precip_mm REAL,
                    granule TEXT NOT NULL,
                    cell_lat REAL,
                    cell_lon REAL,
                    PRIMARY KEY (cell_key, obs_date)
                )"""
            )
            c.execute(
                """CREATE TABLE IF NOT EXISTS raster_products (
                    target_key TEXT NOT NULL,
                    product TEXT NOT NULL,
                    obs_date TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    source_ref TEXT NOT NULL,
                    PRIMARY KEY (target_key, product, obs_date)
                )"""
            )

    # ---- point values ------------------------------------------------
    def save_point_values(self, rows: Iterable[Tuple[str, str, str, str, Optional[float], Optional[float], str]]) -> int:
        rows = list(rows)
        with self._conn() as c:
            c.executemany(
                "INSERT OR REPLACE INTO point_values VALUES (?, ?, ?, ?, ?, ?, ?)", rows
            )
        return len(rows)

    def get_point_values(
        self, key: str, product: str, variable: str, start: str, end: str
    ) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT obs_time, value, qc, source_ref FROM point_values
                   WHERE point_key = ? AND product = ? AND variable = ?
                   AND substr(obs_time, 1, 10) BETWEEN ? AND ? ORDER BY obs_time""",
                (key, product, variable, start, end),
            ).fetchall()
        return [dict(r) for r in rows]

    def point_coverage(self, key: str, product: str) -> Tuple[Optional[str], Optional[str]]:
        with self._conn() as c:
            row = c.execute(
                "SELECT MIN(substr(obs_time,1,10)), MAX(substr(obs_time,1,10)) FROM point_values WHERE point_key = ? AND product = ?",
                (key, product),
            ).fetchone()
        return (row[0], row[1]) if row else (None, None)

    # ---- AppEEARS tasks ------------------------------------------------
    def add_task(self, task_id: str, kind: str, target_key: str, start: str, end: str, status: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO appeears_tasks (task_id, kind, target_key, start_date, end_date, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task_id, kind, target_key, start, end, status, _now()),
            )

    def update_task(self, task_id: str, status: str, detail: Optional[str] = None, completed: bool = False) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE appeears_tasks SET status = ?, detail = COALESCE(?, detail), checked_at = ?, completed_at = CASE WHEN ? THEN ? ELSE completed_at END WHERE task_id = ?",
                (status, detail, _now(), 1 if completed else 0, _now(), task_id),
            )

    def tasks_for(self, kind: str, target_key: str) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM appeears_tasks WHERE kind = ? AND target_key = ? ORDER BY submitted_at DESC",
                (kind, target_key),
            ).fetchall()
        return [dict(r) for r in rows]

    def open_tasks(self) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM appeears_tasks WHERE status NOT IN ('ingested', 'error', 'deleted') ORDER BY submitted_at"
            ).fetchall()
        return [dict(r) for r in rows]

    # ---- IMERG ----------------------------------------------------------
    def get_imerg(self, cell_key: str, start: str, end: str) -> Dict[str, Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM imerg_cells WHERE cell_key = ? AND obs_date BETWEEN ? AND ?",
                (cell_key, start, end),
            ).fetchall()
        return {r["obs_date"]: dict(r) for r in rows}

    def save_imerg(self, rows: Iterable[Tuple[str, str, Optional[float], str, float, float]]) -> None:
        with self._conn() as c:
            c.executemany("INSERT OR REPLACE INTO imerg_cells VALUES (?, ?, ?, ?, ?, ?)", list(rows))

    # ---- raster products (ECOSTRESS maps etc.) ----------------------------
    def save_raster(self, target_key: str, product: str, obs_date: str, payload: Dict[str, Any], source_ref: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO raster_products VALUES (?, ?, ?, ?, ?)",
                (target_key, product, obs_date, json.dumps(payload), source_ref),
            )

    def get_rasters(self, target_key: str, product: str) -> List[Dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT obs_date, payload_json, source_ref FROM raster_products WHERE target_key = ? AND product = ? ORDER BY obs_date DESC",
                (target_key, product),
            ).fetchall()
        out = []
        for r in rows:
            d = json.loads(r["payload_json"])
            d["obs_date"] = r["obs_date"]
            d["source_ref"] = r["source_ref"]
            out.append(d)
        return out


real_store = RealDataStore()
