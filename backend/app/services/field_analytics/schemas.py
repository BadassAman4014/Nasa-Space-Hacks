"""
Pydantic schemas for Field Analytics & Historical Satellite Report pipeline.
Inspired by OneSoil Yield analytics, powered by real Sentinel-2, NASA POWER,
Copernicus DEM, and SoilGrids datasets.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class PlantingDateUpdate(BaseModel):
    planting_date: str = Field(..., description="Planting date in YYYY-MM-DD format")
    harvest_date: Optional[str] = Field(None, description="Expected or actual harvest date in YYYY-MM-DD format")

class CurrentWeather(BaseModel):
    temperature_c: float
    feels_like_c: float
    precipitation_mm: float
    wind_speed_kmh: float
    humidity_percent: float
    condition: str
    is_forecast: bool = False
    observation_date: str
    station_or_provider: str

class FieldStatusSummary(BaseModel):
    field_id: str
    name: str
    farm_id: str
    farm_name: str
    area_ha: float
    current_crop: Optional[str] = None
    planting_date: Optional[str] = None
    harvest_date: Optional[str] = None
    days_since_planting: Optional[int] = None
    location: str
    boundary_source: str
    analysis_status: str
    current_weather: Optional[CurrentWeather] = None
    geometry: Optional[Dict[str, Any]] = None
    bounds: Optional[List[float]] = None

class SatelliteObservation(BaseModel):
    id: str
    scene_id: str
    acquisition_date: str
    sensor: str = "Sentinel-2 L2A"
    cloud_cover_percent: float = 0.0
    mean_ndvi: Optional[float] = None
    median_ndvi: Optional[float] = None
    min_ndvi: Optional[float] = None
    max_ndvi: Optional[float] = None
    std_ndvi: Optional[float] = None
    valid_pixel_percent: float = 100.0
    valid_pixel_count: int = 0
    is_included: bool = True
    season: str = ""
    rgb_preview_url: Optional[str] = None
    ndvi_preview_url: Optional[str] = None

class NDVITimeSeriesResponse(BaseModel):
    field_id: str
    field_name: str
    area_ha: float
    observations: List[SatelliteObservation]
    latest_ndvi: Optional[float] = None
    latest_date: Optional[str] = None
    previous_ndvi: Optional[float] = None
    previous_date: Optional[str] = None
    change_percent: Optional[float] = None
    data_source: str = "Copernicus Sentinel-2 L2A (10m Surface Reflectance)"
    resolution: str = "10 meters"
    unavailable_note: Optional[str] = None
    total_count: int = 0
    has_more: bool = False
    batch_offset: int = 0
    batch_limit: Optional[int] = None

class DailyPrecipitation(BaseModel):
    date: str
    daily_mm: float
    accumulated_mm: float

class PrecipitationTimeSeriesResponse(BaseModel):
    field_id: str
    start_date: str
    end_date: str
    total_accumulated_mm: float
    daily_records: List[DailyPrecipitation]
    data_source: str = "NASA POWER Daily API (GPM/MERRA-2 PRECTOTCORR)"
    resolution: str = "0.5° × 0.5°"
    last_updated: str

class DailyGDD(BaseModel):
    date: str
    tmin_c: float
    tmax_c: float
    daily_gdd: float
    accumulated_gdd: float

class GDDTimeSeriesResponse(BaseModel):
    field_id: str
    crop: str
    base_temperature_c: float
    start_date: str
    end_date: str
    total_accumulated_gdd: float
    valid_days: int
    daily_records: List[DailyGDD]
    data_source: str = "NASA POWER Daily API (T2M_MIN, T2M_MAX)"
    formula: str = "GDD = max(0, ((Tmax + Tmin)/2) - Tbase)"

class ProductivityZone(BaseModel):
    zone_id: str
    label: str # "High", "Medium", "Low"
    color: str # Hex color (#1fa35b, #eab308, #ef4444)
    area_ha: float
    area_percent: float
    mean_ndvi: Optional[float] = None

class ProductivityReportResponse(BaseModel):
    field_id: str
    seasons_included: List[str]
    total_seasons_analyzed: int
    zones: List[ProductivityZone]
    stable_area_ha: float
    stable_area_percent: float
    stability_rating: str # "High", "Moderate", "Variable"
    methodology: str
    min_observations_met: bool
    status_note: str
    raster_geojson: Optional[Dict[str, Any]] = None
    productivity_map_url: Optional[str] = None

class SoilBrightnessResponse(BaseModel):
    field_id: str
    observation_date: str
    sensor: str = "Sentinel-2 L2A"
    mean_brightness: float
    min_brightness: float
    max_brightness: float
    unit: str = "Surface Reflectance Brightness Index"
    methodology: str
    is_available: bool
    status_note: str
    raster_geojson: Optional[Dict[str, Any]] = None
    map_url: Optional[str] = None

class ElevationResponse(BaseModel):
    field_id: str
    data_source: str = "Copernicus DEM GLO-30 / SRTM 30m"
    min_elevation_m: Optional[float] = None
    max_elevation_m: Optional[float] = None
    mean_elevation_m: Optional[float] = None
    elevation_range_m: Optional[float] = None
    mean_slope_deg: Optional[float] = None
    is_available: bool = True
    status_note: Optional[str] = None
    raster_geojson: Optional[Dict[str, Any]] = None
    map_url: Optional[str] = None

class CorrelationMetric(BaseModel):
    layer_a: str
    layer_b: str
    pearson_r: float
    pearson_p_value: float
    spearman_rho: float
    spearman_p_value: float
    sample_count: int
    interpretation: str

class CorrelationResponse(BaseModel):
    field_id: str
    grid_resolution_m: float = 10.0
    sample_pixel_count: int = 0
    effective_sample_size: Optional[int] = None
    lag1_autocorrelation: Optional[float] = None
    productivity_vs_elevation: Optional[CorrelationMetric] = None
    productivity_vs_brightness: Optional[CorrelationMetric] = None
    spatial_autocorrelation_note: str
    scientific_disclaimer: str

class ObservationToggleRequest(BaseModel):
    is_included: bool

class FullFieldReportResponse(BaseModel):
    field_id: str
    field_summary: FieldStatusSummary
    productivity: ProductivityReportResponse
    soil_brightness: SoilBrightnessResponse
    elevation: ElevationResponse
    correlation: CorrelationResponse
    historical_observations: List[SatelliteObservation]
    soil_profile: Optional[Dict[str, Any]] = None
    generated_at: str
