"""
Preprocess official Brandenburg DFBK shapefiles into a cleaned, validated agricultural dataset.
Filters exclusively for active agricultural categories (AL, GL, DK, and agroforestry/solar variants),
repairs invalid geometries, calculates metric areas, converts to WGS84 for web map delivery,
and creates an indexed GeoPackage for ultra-fast spatial queries.

Attribution: © MLEUV, dl-de/by-2-0
"""

import sys
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import geopandas as gpd
import pyogrio
from shapely.validation import make_valid
from shapely.geometry import Polygon, MultiPolygon

# Standard agricultural category allowlist for Brandenburg DFBK
DEFAULT_AGRICULTURAL_ALLOWLIST = [
    "AL",         # Ackerland (Arable land)
    "GL",         # Dauergrünland (Permanent grassland)
    "DK",         # Dauerkulturen (Permanent crops)
    "AL-AF",      # Ackerland Agroforst (Arable agroforestry)
    "GL-AF",      # Grünland Agroforst (Grassland agroforestry)
    "DK-AF",      # Dauerkulturen Agroforst (Permanent crops agroforestry)
    "AL-APV",     # Agri-Photovoltaik Acker (Arable Agri-PV)
    "GL-APV",     # Agri-Photovoltaik Grünland (Grassland Agri-PV)
    "DK-APV",     # Agri-Photovoltaik Dauerkulturen (Permanent crops Agri-PV)
    "GL-ELP",     # Grünland mit Einzelflächenbezug
    "GL-ELP-AF",  # Grünland ELP Agroforst
    "GL-ELP-APV", # Grünland ELP Agri-PV
    "GL-MO",      # Grünland Moorboden
    "GL-MO-AF",   # Grünland Moorboden Agroforst
    "GL-MO-APV"   # Grünland Moorboden Agri-PV
]

# Explicitly excluded non-agricultural categories
EXCLUDED_CATEGORIES = ["HE", "34A", "34G"]

def preprocess_dfbk(
    allowlist: list[str] = DEFAULT_AGRICULTURAL_ALLOWLIST,
    output_gpkg: str = None
) -> Path:
    start_time = time.time()
    base_dir = Path(__file__).resolve().parent.parent
    raw_dir = base_dir / "data" / "raw"
    fb_shp = raw_dir / "DFBK_FB.shp"
    
    if not fb_shp.exists():
        raise FileNotFoundError(f"Source file {fb_shp} does not exist. Run download_dfbk.py first.")

    out_path = Path(output_gpkg) if output_gpkg else base_dir / "data" / "dfbk_agricultural.gpkg"
    meta_path = base_dir / "data" / "dfbk_metadata.json"

    print("==================================================================")
    print("      PREPROCESSING BRANDENBURG DFBK AGRICULTURAL DATASET")
    print("==================================================================")
    print(f"Reading {fb_shp}...")

    # Read records using pyogrio
    gdf = pyogrio.read_dataframe(
        fb_shp,
        columns=['FB_ID', 'HBN_KAT', 'FL_BRUTTO', 'FL_NETTO', 'FGUE_JAHR', 'GUELTVON_F', 'GUELTBIS_F']
    )
    raw_count = len(gdf)
    print(f"Loaded {raw_count:,} raw field block records.")

    # 1. Agricultural-only filtering
    allowset = set(allowlist)
    gdf = gdf[gdf['HBN_KAT'].isin(allowset)].copy()
    agri_count = len(gdf)
    excluded_count = raw_count - agri_count
    print(f"Filtered to {agri_count:,} qualifying agricultural fields (excluded {excluded_count:,} non-agricultural records).")

    # 2. Coordinate Reference System & Metric Area
    # Raw CRS is EPSG:25833 (UTM zone 33N, meters)
    print("Validating geometries and calculating metric area...")
    valid_geoms = []
    calc_areas = []

    for geom in gdf.geometry:
        if geom is None or geom.is_empty:
            valid_geoms.append(None)
            calc_areas.append(0.0)
            continue
        if not geom.is_valid:
            geom = make_valid(geom)
        
        # Calculate metric area in hectares from EPSG:25833 planar coordinates
        area_ha = round(geom.area / 10_000.0, 4)
        valid_geoms.append(geom)
        calc_areas.append(area_ha)

    gdf['geometry'] = valid_geoms
    gdf['calc_area_ha'] = calc_areas

    # Drop any degenerate or empty geometries
    gdf = gdf[gdf.geometry.notnull() & (~gdf.geometry.is_empty)].copy()

    # 3. Transform to EPSG:4326 for GeoJSON / Leaflet web map delivery
    print("Reprojecting geometries from EPSG:25833 to EPSG:4326 (WGS84)...")
    gdf_wgs84 = gdf.to_crs(epsg=4326)

    # 4. Compute Bounding Box Coordinates (minx, miny, maxx, maxy) for indexed fast lookup
    bounds = gdf_wgs84.bounds
    gdf_wgs84['minx'] = bounds['minx'].round(6)
    gdf_wgs84['miny'] = bounds['miny'].round(6)
    gdf_wgs84['maxx'] = bounds['maxx'].round(6)
    gdf_wgs84['maxy'] = bounds['maxy'].round(6)

    # Format column names for clarity
    gdf_wgs84.rename(columns={
        'FB_ID': 'external_id',
        'HBN_KAT': 'land_use_category',
        'FL_BRUTTO': 'official_gross_ha',
        'FL_NETTO': 'official_net_ha',
        'FGUE_JAHR': 'validity_year',
        'GUELTVON_F': 'validity_start',
        'GUELTBIS_F': 'validity_end'
    }, inplace=True)

    gdf_wgs84['source_name'] = 'DFBK'
    gdf_wgs84['attribution'] = '© MLEUV, dl-de/by-2-0'

    # 5. Save to GeoPackage with spatial index
    print(f"Writing {len(gdf_wgs84):,} agricultural boundaries to {out_path}...")
    if out_path.exists():
        out_path.unlink()
        
    pyogrio.write_dataframe(
        gdf_wgs84,
        out_path,
        layer="agricultural_boundaries",
        driver="GPKG",
        spatial_index=True
    )
    print(f"Saved GeoPackage successfully ({out_path.stat().st_size / 1_048_576:.1f} MB).")

    # 6. Write dataset metadata JSON
    meta = {
        "source_name": "Digitales Feldblockkataster (DFBK)",
        "source_url": "https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dfbk.zip",
        "documentation_url": "https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dok/Doku_DFBK_aktuell.html",
        "wfs_url": "https://isk.geobasis-bb.de/ows/geobroker_l_dfbk_wfs",
        "license": "dl-de/by-2-0",
        "attribution": "© MLEUV, dl-de/by-2-0",
        "attribution_modified": "© MLEUV, dl-de/by-2-0, Daten verändert",
        "version_year": int(gdf_wgs84['validity_year'].iloc[0]) if len(gdf_wgs84) > 0 else 2026,
        "record_count": len(gdf_wgs84),
        "total_agricultural_hectares": round(float(gdf_wgs84['official_net_ha'].sum()), 1),
        "categories_included": list(allowlist),
        "categories_excluded": EXCLUDED_CATEGORIES,
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.time() - start_time, 2)
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"Saved metadata to {meta_path}.")

    print("==================================================================")
    print(f"PREPROCESSING COMPLETE in {meta['elapsed_seconds']}s")
    print(f"Total Agricultural Polygons: {meta['record_count']:,}")
    print(f"Total Agricultural Area: {meta['total_agricultural_hectares']:,} ha")
    print("==================================================================")
    return out_path

if __name__ == "__main__":
    preprocess_dfbk()

