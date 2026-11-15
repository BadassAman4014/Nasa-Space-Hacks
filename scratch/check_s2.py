"""Check whether real Sentinel-2 NDVI works for the Cottbus field, and what is stored."""
import sqlite3
import time
from pathlib import Path

from shapely.geometry import shape

from app.services.field_analytics import s2_raster
from app.services.user_farms_repository import user_farms_repo

f = user_farms_repo.list_fields()[0]
print("field:", f["id"], f["name"], round(f["area_hectares"], 2), "ha")
poly = shape(f["geometry"])

t0 = time.time()
scenes = s2_raster.search_scenes(poly, "2026-04-01", "2026-10-31", max_cloud=40) if "max_cloud" in s2_raster.search_scenes.__code__.co_varnames else s2_raster.search_scenes(poly, "2026-04-01", "2026-10-31")
print("real STAC scenes 2026-04..10:", len(scenes), round(time.time() - t0, 1), "s")
if scenes:
    print("  first:", {k: scenes[0][k] for k in list(scenes[0])[:6]})

db = Path("app/data/field_analytics.db")
con = sqlite3.connect(db)
tabs = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
print("tables:", tabs)
for t in tabs:
    cols = [c[1] for c in con.execute(f"pragma table_info({t})")]
    if "field_id" in cols:
        n = con.execute(f"select count(*) from {t} where field_id=?", (f["id"],)).fetchone()[0]
        extra = ""
        for flag in ("is_synthetic", "source", "data_source", "provenance", "scene_id"):
            if flag in cols:
                vals = con.execute(f"select {flag}, count(*) from {t} where field_id=? group by {flag} limit 6", (f["id"],)).fetchall()
                extra += f" | {flag}: {vals}"
        print(f"  {t}: {n} rows for field{extra}")
