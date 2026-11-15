"""
Pre-fetch real NASA and Sentinel-2 data for every registered field, so the app
serves it from cache during a demo.

Usage (from backend/):
    python scripts/prefetch_field_data.py submit      # queue AppEEARS + fetch IMERG
    python scripts/prefetch_field_data.py poll        # poll AppEEARS until all tasks finish
    python scripts/prefetch_field_data.py ndvi        # compute 3 years of Sentinel-2 NDVI
    python scripts/prefetch_field_data.py all
"""

import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shapely.geometry import mapping, shape  # noqa: E402

from app.services.nasa.real.appeears import appeears  # noqa: E402
from app.services.nasa.real.imerg import daily_precipitation  # noqa: E402
from app.services.nasa.real.store import real_store  # noqa: E402
from app.services.user_farms_repository import user_farms_repo  # noqa: E402

TODAY = date.today()
POINT_START = f"{TODAY.year - 3}-01-01"
AREA_START = (TODAY - timedelta(days=150)).isoformat()
RAIN_START = (TODAY - timedelta(days=400)).isoformat()


def centroid(field):
    c = shape(field["geometry"]).centroid
    return round(c.y, 5), round(c.x, 5)


def submit():
    for f in user_farms_repo.list_fields():
        lat, lon = centroid(f)
        from app.services.nasa.real.store import point_key

        key = point_key(lat, lon)
        if not any(t["status"] not in ("error", "deleted") for t in real_store.tasks_for("point", key)):
            tid = appeears.submit_point(lat, lon, POINT_START, TODAY.isoformat())
            print(f"[{f['name']}] point task {tid} ({POINT_START}..{TODAY})")
        else:
            print(f"[{f['name']}] point task already present")
        if not any(t["status"] not in ("error", "deleted") for t in real_store.tasks_for("area", f["id"])):
            geom = mapping(shape(f["geometry"]).buffer(0))
            tid = appeears.submit_area(f["id"], geom, AREA_START, TODAY.isoformat())
            print(f"[{f['name']}] ECOSTRESS area task {tid} ({AREA_START}..{TODAY})")
        else:
            print(f"[{f['name']}] area task already present")
        t0 = time.time()
        s = daily_precipitation(lat, lon, RAIN_START, (TODAY - timedelta(days=1)).isoformat())
        print(f"[{f['name']}] IMERG: {len(s['days'])} days cached, {len(s['missing_days'])} missing, {round(time.time() - t0)} s")


def poll(max_minutes: int = 90):
    deadline = time.time() + max_minutes * 60
    while time.time() < deadline:
        res = appeears.poll_once()
        print(time.strftime("%H:%M:%S"), [(r["kind"], r["target"][:14], r["status"]) for r in res])
        if not real_store.open_tasks():
            print("all AppEEARS tasks finished")
            return
        time.sleep(60)


def ndvi():
    from app.services.field_analytics.health.ndvi_history import ensure_ndvi_history

    for f in user_farms_repo.list_fields():
        t0 = time.time()
        res = ensure_ndvi_history(f["id"])
        print(f"[{f['name']}] NDVI history: {res} in {round(time.time() - t0)} s")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("submit", "all"):
        submit()
    if cmd in ("ndvi", "all"):
        ndvi()
    if cmd in ("poll", "all"):
        poll()
