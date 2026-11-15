"""Inspect stored NDVI observations and time one real Sentinel-2 read."""
import sqlite3
import time

from shapely.geometry import shape

from app.services.field_analytics import s2_raster
from app.services.field_analytics.sentinel_service import sentinel_service
from app.services.user_farms_repository import user_farms_repo

con = sqlite3.connect("app/data/field_analytics.db")
cols = [c[1] for c in con.execute("pragma table_info(field_satellite_observations)")]
print("obs columns:", cols)
for f in user_farms_repo.list_fields():
    rows = con.execute(
        "select scene_id, acquisition_date from field_satellite_observations where field_id=? order by acquisition_date",
        (f["id"],),
    ).fetchall()
    fake = [r for r in rows if (r[0] or "").startswith("S2B_MSIL2A_")]
    print(f["id"], f["name"], round(f["area_hectares"], 1), "ha | stored:", len(rows), "| canonical-fake IDs:", len(fake), "| sample:", rows[:2])

f = user_farms_repo.list_fields()[0]
poly = shape(f["geometry"])
scenes = s2_raster.search_scenes(poly, "2026-06-01", "2026-08-31", max_cloud_cover=20)
print("scenes:", len(scenes))
grid = s2_raster.build_field_grid(poly, 10.0)
print("grid:", grid.shape, grid.valid_pixel_count, "px")
t0 = time.time()
obs = sentinel_service.compute_observation(f["id"], f["geometry"], scenes[0], grid=grid)
print("one scene:", round(time.time() - t0, 1), "s | mean_ndvi", obs.get("mean_ndvi"), "| valid %", obs.get("valid_pixel_percent"), "| keys:", sorted(obs)[:40])
