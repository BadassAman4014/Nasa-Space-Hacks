
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
