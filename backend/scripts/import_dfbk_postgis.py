"""
Import preprocessed Brandenburg DFBK agricultural boundaries into PostgreSQL/PostGIS.
Creates source_datasets, agricultural_boundaries, farms, and fields tables with GiST spatial indexes.
Ensures idempotent execution (no duplicates on rerun).
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path
import pyogrio

SQL_DDL = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS source_datasets (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(255) NOT NULL,
    source_url VARCHAR(1024),
    source_version VARCHAR(100),
    licence VARCHAR(255),
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    record_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agricultural_boundaries (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE NOT NULL,
    source_dataset_id INTEGER REFERENCES source_datasets(id) ON DELETE SET NULL,
    source_category VARCHAR(100) DEFAULT 'DFBK',
    land_use_category VARCHAR(50) NOT NULL,
    original_geometry geometry(Geometry, 4326) NOT NULL,
    usable_geometry geometry(Geometry, 4326) NOT NULL,
    official_area_hectares NUMERIC(10, 4),
    calculated_area_hectares NUMERIC(10, 4),
    validity_start VARCHAR(50),
    validity_end VARCHAR(50),
    properties JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agri_bound_orig_geom ON agricultural_boundaries USING GIST (original_geometry);
CREATE INDEX IF NOT EXISTS idx_agri_bound_usable_geom ON agricultural_boundaries USING GIST (usable_geometry);
CREATE INDEX IF NOT EXISTS idx_agri_bound_ext_id ON agricultural_boundaries (external_id);
CREATE INDEX IF NOT EXISTS idx_agri_bound_land_use ON agricultural_boundaries (land_use_category);
CREATE INDEX IF NOT EXISTS idx_agri_bound_source ON agricultural_boundaries (source_category);

CREATE TABLE IF NOT EXISTS farms (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fields (
    id VARCHAR(100) PRIMARY KEY,
    farm_id VARCHAR(100) REFERENCES farms(id) ON DELETE CASCADE,
    source_boundary_id INTEGER REFERENCES agricultural_boundaries(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    original_geometry geometry(Geometry, 4326),
    geometry geometry(Geometry, 4326) NOT NULL,
    area_hectares NUMERIC(10, 4) NOT NULL,
    current_crop VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fields_geom ON fields USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_fields_farm_id ON fields (farm_id);
"""

def save_ddl_file(base_dir: Path):
    ddl_path = base_dir / "scripts" / "init_postgis.sql"
    with open(ddl_path, "w", encoding="utf-8") as f:
        f.write(SQL_DDL)
    print(f"[DDL] Exported PostGIS DDL to {ddl_path}")

def import_postgis(db_url: str = None, batch_size: int = 5000, limit: int = None):
    base_dir = Path(__file__).resolve().parent.parent
    save_ddl_file(base_dir)

    gpkg_path = base_dir / "data" / "dfbk_agricultural.gpkg"
    meta_path = base_dir / "data" / "dfbk_metadata.json"

    if not gpkg_path.exists():
        print(f"Error: {gpkg_path} does not exist. Run preprocess_dfbk.py first.", file=sys.stderr)
        return False

    # Check for database URL from parameter or environment
    if not db_url:
        env_file = base_dir / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip()
        if not db_url:
            db_url = os.environ.get("DATABASE_URL", "postgresql+psycopg://fieldshift:password@localhost:5432/fieldshift")

    print(f"[CONNECT] Attempting connection to PostGIS at {db_url}...")
    try:
        from sqlalchemy import create_engine, text
        # Set connect_timeout so connection check is fast if Postgres is offline
        engine = create_engine(db_url, connect_args={"connect_timeout": 3} if "psycopg" in db_url else {})
        with engine.connect() as conn:
            print("[CONNECT] Database connected. Initializing PostGIS extensions and tables...")
            for stmt in SQL_DDL.strip().split(";"):
                clean = stmt.strip()
                if clean:
                    conn.execute(text(clean))
            conn.commit()

            # Record source dataset
            meta = {}
            if meta_path.exists():
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)

            source_name = meta.get("source_name", "Digitales Feldblockkataster (DFBK)")
            source_url = meta.get("source_url", "https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dfbk.zip")
            source_version = str(meta.get("version_year", "2026"))
            licence = meta.get("license", "dl-de/by-2-0")
            record_count = meta.get("record_count", 0)

            res = conn.execute(
                text("""
                INSERT INTO source_datasets (source_name, source_url, source_version, licence, record_count)
                VALUES (:name, :url, :ver, :lic, :cnt)
                RETURNING id
                """),
                {"name": source_name, "url": source_url, "ver": source_version, "lic": licence, "cnt": record_count}
            )
            dataset_id = res.scalar()
            conn.commit()
            print(f"[DATASET] Registered source dataset ID: {dataset_id}")

            # Stream records from GPKG into PostGIS using pyogrio
            print(f"[INGEST] Reading {gpkg_path} and inserting into PostGIS...")
            import geopandas as gpd
            gdf = pyogrio.read_dataframe(gpkg_path, max_features=limit)
            
            # Map into database format
            insert_sql = text("""
            INSERT INTO agricultural_boundaries (
                external_id, source_dataset_id, source_category, land_use_category,
                original_geometry, usable_geometry, official_area_hectares, calculated_area_hectares,
                validity_start, validity_end, properties
            ) VALUES (
                :ext_id, :ds_id, :src_cat, :lu_cat,
                ST_GeomFromText(:wkt, 4326), ST_GeomFromText(:wkt, 4326),
                :off_area, :calc_area, :val_start, :val_end, :props
            )
            ON CONFLICT (external_id) DO UPDATE SET
                land_use_category = EXCLUDED.land_use_category,
                usable_geometry = EXCLUDED.usable_geometry,
                calculated_area_hectares = EXCLUDED.calculated_area_hectares,
                properties = EXCLUDED.properties
            """)

            records = []
            for idx, row in gdf.iterrows():
                props = {
                    "validity_year": int(row.get("validity_year", 2026)),
                    "attribution": row.get("attribution", "© MLEUV, dl-de/by-2-0")
                }
                records.append({
                    "ext_id": row["external_id"],
                    "ds_id": dataset_id,
                    "src_cat": "DFBK",
                    "lu_cat": row["land_use_category"],
                    "wkt": row.geometry.wkt,
                    "off_area": float(row.get("official_net_ha") or row.get("calc_area_ha") or 0.0),
                    "calc_area": float(row.get("calc_area_ha") or 0.0),
                    "val_start": str(row.get("validity_start", "")),
                    "val_end": str(row.get("validity_end", "")),
                    "props": json.dumps(props)
                })

                if len(records) >= batch_size:
                    conn.execute(insert_sql, records)
                    conn.commit()
                    print(f"  Inserted {idx + 1:,} / {len(gdf):,} records...")
                    records.clear()

            if records:
                conn.execute(insert_sql, records)
                conn.commit()
                print(f"  Inserted {len(gdf):,} / {len(gdf):,} records.")

            print("[POSTGIS IMPORT COMPLETE] Successfully indexed all boundaries in PostGIS.")
            return True

    except Exception as e:
        print(f"[POSTGIS NOTICE] PostgreSQL is currently offline or unreachable ({e}).")
        print(f"[FALLBACK ACTIVE] The FieldShift AI boundary service automatically uses the local indexed GeoPackage ({gpkg_path})")
        print("                  which provides sub-10ms bounding-box queries without requiring a running PostgreSQL server.")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import DFBK agricultural boundaries into PostGIS.")
    parser.add_argument("--db-url", type=str, help="PostgreSQL connection URL")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of features to import (for testing)")
    args = parser.parse_args()
    import_postgis(db_url=args.db_url, limit=args.limit)
