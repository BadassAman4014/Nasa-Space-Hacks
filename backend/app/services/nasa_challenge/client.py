"""NASA Challenge catalogue queries backed only by live source responses.

This client deliberately fails closed. Catalogue metadata may be returned when a
source can be searched but its science values are not extracted here. It never
substitutes demonstration measurements, synthetic granules, regional profiles,
or default field coordinates.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from pyproj import Transformer
from shapely.geometry import shape

from app.services.nasa_challenge.catalog import NASA_CHALLENGE_CATALOG
from app.services.nasa_challenge.schemas import (
    ChallengeDatasetInfo,
    DatasetQueryResponse,
    FieldMultiQueryResponse,
)
from app.services.user_farms_repository import user_farms_repo

logger = logging.getLogger(__name__)

# WGS84 to USA Contiguous Albers Equal Area (EPSG:5070) for USDA CDL.
_wgs84_to_albers = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)

_CONUS_DATASETS = {
    "cropscape_cdl",
    "web_soil_survey",
    "prism_climate",
    "naip_imagery",
    "usgs_nlcd",
    "cocorahs",
    "usgs_nwis",
    "usda_ams_market_news",
    "usda_nass_quickstats",
    "openet",
    "usfs_landfire",
}

_CMR_PRODUCTS = {
    "smap": "SPL3SMP_E",
    "gpm_imerg": "GPM_3IMERGDF",
    "landsat_modis_viirs": "MOD13Q1",
    "srtm": "SRTMGL1",
    "ecostress": "ECO2LSTE",
    "nldas_gldas": "GLDAS_NOAH025_3H",
    "gedi_lidar": "GEDI04_A",
}


class SourceUnavailable(RuntimeError):
    """Raised when an upstream source does not provide a usable live response."""


class NasaChallengeDataClient:
    def __init__(self, timeout: float = 12.0):
        self.timeout = timeout

    def get_catalog(self) -> dict[str, ChallengeDatasetInfo]:
        return NASA_CHALLENGE_CATALOG

    def get_dataset_info(self, dataset_id: str) -> Optional[ChallengeDatasetInfo]:
        return NASA_CHALLENGE_CATALOG.get(dataset_id)

    @staticmethod
    def _in_conus(lat: float, lon: float) -> bool:
        return 24.0 <= lat <= 50.0 and -125.0 <= lon <= -66.0

    @staticmethod
    def _valid_number(value: Any) -> Optional[float]:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return None if number < -900 else number

    def query_cropscape_cdl(self, lat: float, lon: float, year: int) -> dict[str, Any]:
        """Query the live USDA CropScape point service for a CONUS coordinate."""
        if not self._in_conus(lat, lon):
            raise SourceUnavailable("USDA Cropland Data Layer covers the contiguous United States only.")

        x, y = _wgs84_to_albers.transform(lon, lat)
        url = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue"
        params = {"year": str(year), "x": str(round(x, 2)), "y": str(round(y, 2))}
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get(url, params=params)
            response.raise_for_status()

        value_match = re.search(r"value:\s*(\d+)", response.text)
        category_match = re.search(r'category:\s*"([^"]+)"', response.text)
        colour_match = re.search(r'color:\s*"([^"]+)"', response.text)
        if not value_match or not category_match:
            raise SourceUnavailable("CropScape returned no classification for this coordinate and year.")

        return {
            "year": year,
            "crop_code": int(value_match.group(1)),
            "crop_category": category_match.group(1),
            "color_hex": colour_match.group(1) if colour_match else None,
            "projected_coordinates": {"albers_x": round(x, 2), "albers_y": round(y, 2)},
            "source": "USDA NASS CropScape Service (GMU CSISS)",
        }

    def query_web_soil_survey(self, lat: float, lon: float) -> dict[str, Any]:
        """Query USDA Soil Data Access without filling absent columns."""
        if not self._in_conus(lat, lon):
            raise SourceUnavailable("USDA SSURGO/Web Soil Survey does not cover this location.")

        url = "https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest"
        sql = f"""
        SELECT TOP 1
            mu.mukey, mu.muname, c.compname, c.comppct_r, c.drainagecl, c.hydgrp, c.taxclname
        FROM mapunit mu
        LEFT JOIN component c ON mu.mukey = c.mukey
        WHERE mu.mukey IN (
            SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_Wkt(
                'POINT({lon:.6f} {lat:.6f})'
            )
        )
        ORDER BY c.comppct_r DESC;
        """
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(url, json={"query": sql, "format": "json"})
            response.raise_for_status()
        rows = response.json().get("Table", [])
        if not rows:
            raise SourceUnavailable("USDA Soil Data Access returned no map unit at this coordinate.")
        row = rows[0]
        columns = (
            "mukey",
            "map_unit_name",
            "major_component",
            "component_pct",
            "drainage_class",
            "hydrologic_group",
            "taxonomic_classification",
        )
        return {**{key: row[index] if index < len(row) else None for index, key in enumerate(columns)},
                "source": "USDA NRCS Soil Data Access (SDA)"}

    def query_nasa_power(
        self,
        lat: float,
        lon: float,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch and derive metrics from a live NASA POWER daily response."""
        now = datetime.now(timezone.utc)
        end_date = end_date or (now - timedelta(days=5)).strftime("%Y-%m-%d")
        start_date = start_date or (now - timedelta(days=12)).strftime("%Y-%m-%d")
        params = {
            "parameters": "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M",
            "community": "AG",
            "longitude": f"{lon:.4f}",
            "latitude": f"{lat:.4f}",
            "start": start_date.replace("-", ""),
            "end": end_date.replace("-", ""),
            "format": "JSON",
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get("https://power.larc.nasa.gov/api/temporal/daily/point", params=params)
            response.raise_for_status()
        properties = response.json().get("properties", {}).get("parameter", {})

        def clean_series(name: str) -> dict[str, float]:
            return {
                day: number
                for day, value in properties.get(name, {}).items()
                if (number := self._valid_number(value)) is not None
            }

        temperatures = clean_series("T2M")
        precipitation = clean_series("PRECTOTCORR")
        solar = clean_series("ALLSKY_SFC_SW_DWN")
        humidity = clean_series("RH2M")
        wind = clean_series("WS2M")
        tmax = clean_series("T2M_MAX")
        tmin = clean_series("T2M_MIN")
        if not temperatures:
            raise SourceUnavailable("NASA POWER returned no valid T2M observations for the requested period.")

        gdd = sum(
            max(0.0, ((tmax[day] + tmin[day]) / 2.0) - 10.0)
            for day in sorted(set(tmax) & set(tmin))
        )
        dates = sorted(temperatures)
        return {
            "period_start": start_date,
            "period_end": end_date,
            "observations_count": len(temperatures),
            "mean_temperature_c": round(sum(temperatures.values()) / len(temperatures), 2),
            "accumulated_precipitation_mm": round(sum(precipitation.values()), 2) if precipitation else None,
            "growing_degree_days_base10": round(gdd, 2) if tmax and tmin else None,
            "mean_all_sky_solar_irradiance_mj_m2": round(sum(solar.values()) / len(solar), 2) if solar else None,
            "daily_timeseries": {
                "dates": dates,
                "temp_mean_c": [temperatures.get(day) for day in dates],
                "precip_mm": [precipitation.get(day) for day in dates],
                "solar_mj_m2": [solar.get(day) for day in dates],
                "relative_humidity_pct": [humidity.get(day) for day in dates],
                "wind_speed_m_s": [wind.get(day) for day in dates],
            },
            "source": "NASA POWER Daily API",
        }

    def query_era5_reanalysis(
        self,
        lat: float,
        lon: float,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch ERA5 reanalysis values through Open-Meteo's archive API."""
        now = datetime.now(timezone.utc)
        end_date = end_date or (now - timedelta(days=7)).strftime("%Y-%m-%d")
        start_date = start_date or (now - timedelta(days=21)).strftime("%Y-%m-%d")
        params = {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "start_date": start_date,
            "end_date": end_date,
            "daily": "temperature_2m_mean,precipitation_sum,wind_speed_10m_max,soil_temperature_0_to_7cm_mean",
            "timezone": "UTC",
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get("https://archive-api.open-meteo.com/v1/era5", params=params)
            response.raise_for_status()
        payload = response.json()
        daily = payload.get("daily", {})
        dates = daily.get("time") or []
        temperatures = daily.get("temperature_2m_mean") or []
        precipitation = daily.get("precipitation_sum") or []
        valid_temperatures = [float(value) for value in temperatures if value is not None]
        valid_precipitation = [float(value) for value in precipitation if value is not None]
        if not dates or not valid_temperatures:
            raise SourceUnavailable("ERA5 returned no valid daily temperature records for the requested period.")
        return {
            "start_date": start_date,
            "end_date": end_date,
            "observations_count": len(dates),
            "mean_temperature_2m_c": round(sum(valid_temperatures) / len(valid_temperatures), 2),
            "total_precipitation_mm": round(sum(valid_precipitation), 2) if valid_precipitation else None,
            "elevation_asl_m": payload.get("elevation"),
            "time_series": {
                "dates": dates,
                "temperature_2m_c": temperatures,
                "precipitation_mm": precipitation,
                "wind_speed_10m_max_kmh": daily.get("wind_speed_10m_max") or [],
                "soil_temp_0_7cm_c": daily.get("soil_temperature_0_to_7cm_mean") or [],
            },
            "source": "Copernicus ERA5 via Open-Meteo Archive API",
        }

    def query_usgs_nwis(self, lat: float, lon: float) -> dict[str, Any]:
        """Fetch current USGS gauge values near a coordinate in US coverage."""
        if not self._in_conus(lat, lon):
            raise SourceUnavailable("USGS NWIS field query is available for United States locations only.")
        radius = 0.3
        params = {
            "format": "json",
            "bBox": f"{lon-radius:.4f},{lat-radius:.4f},{lon+radius:.4f},{lat+radius:.4f}",
            "parameterCd": "00065,00060,72019",
            "siteStatus": "active",
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get("https://waterservices.usgs.gov/nwis/iv/", params=params)
            response.raise_for_status()
        stations = []
        for series in response.json().get("value", {}).get("timeSeries", [])[:5]:
            values = series.get("values", [{}])[0].get("value", [])
            if not values:
                continue
            source = series.get("sourceInfo", {})
            variable = series.get("variable", {})
            latest = values[-1]
            stations.append({
                "station_name": source.get("siteName"),
                "station_id": (source.get("siteCode") or [{}])[0].get("value"),
                "parameter": variable.get("variableDescription"),
                "unit": variable.get("unit", {}).get("unitCode"),
                "current_value": latest.get("value"),
                "observation_time": latest.get("dateTime"),
            })
        if not stations:
            raise SourceUnavailable("USGS NWIS returned no active gauges in the search area.")
        return {"active_stations_found": len(stations), "nearest_gauges": stations,
                "source": "USGS National Water Information System (NWIS)"}

    def query_nasa_cmr_granules(
        self, short_name: str, lat: float, lon: float, days_back: int = 30
    ) -> dict[str, Any]:
        """Search NASA CMR and return actual catalogue records, not science values."""
        start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")
        delta = 0.25
        bbox = f"{lon-delta:.3f},{lat-delta:.3f},{lon+delta:.3f},{lat+delta:.3f}"
        params = {
            "short_name": short_name,
            "bounding_box": bbox,
            "temporal": f"{start},",
            "sort_key[]": "-start_date",
            "page_size": 3,
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.get("https://cmr.earthdata.nasa.gov/search/granules.json", params=params)
            response.raise_for_status()
        granules = []
        for entry in response.json().get("feed", {}).get("entry", []):
            links = [link.get("href") for link in entry.get("links", []) if link.get("href")]
            granules.append({
                "granule_id": entry.get("title"),
                "acquisition_time": entry.get("time_start"),
                "updated": entry.get("updated"),
                "data_links": links[:5],
            })
        return {
            "short_name": short_name,
            "granules_count": len(granules),
            "latest_granules": granules,
            "bounding_box": bbox,
            "source": "NASA Common Metadata Repository (CMR)",
            "note": "Catalogue metadata only; no science measurement was extracted.",
        }

    def query_sentinel2_catalog(self, lat: float, lon: float) -> dict[str, Any]:
        """Search the public Element84 STAC catalogue for real Sentinel-2 scenes."""
        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=30)
        payload = {
            "collections": ["sentinel-2-l2a"],
            "intersects": {"type": "Point", "coordinates": [lon, lat]},
            "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
            "limit": 5,
            "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        }
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post("https://earth-search.aws.element84.com/v1/search", json=payload)
            response.raise_for_status()
        scenes = []
        for feature in response.json().get("features", []):
            properties = feature.get("properties", {})
            scenes.append({
                "scene_id": feature.get("id"),
                "acquisition_time": properties.get("datetime"),
                "cloud_cover_pct": properties.get("eo:cloud_cover"),
                "platform": properties.get("platform"),
            })
        return {
            "scenes_count": len(scenes),
            "latest_scenes": scenes,
            "source": "Element84 Earth Search STAC, Sentinel-2 L2A",
            "note": "Catalogue metadata only; field indices require raster processing.",
        }

    def _make_response(
        self,
        info: ChallengeDatasetInfo,
        lat: float,
        lon: float,
        status: str,
        data: dict[str, Any],
        summary: str,
    ) -> DatasetQueryResponse:
        return DatasetQueryResponse(
            dataset_id=info.id,
            name=info.name,
            agency=info.agency,
            category=info.category,
            query_timestamp=datetime.now(timezone.utc).isoformat(),
            location={"lat": round(lat, 6), "lon": round(lon, 6)},
            status=status,
            data=data,
            summary=summary,
            source_url=info.official_url,
            metadata={
                "spatial_resolution": info.spatial_resolution,
                "temporal_cadence": info.temporal_cadence,
                "api_endpoint": info.api_endpoint,
            },
        )

    def query_dataset(
        self,
        dataset_id: str,
        lat: float,
        lon: float,
        year: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        extra_params: Optional[dict[str, Any]] = None,
    ) -> DatasetQueryResponse:
        """Query a source; report metadata-only and unavailable states explicitly."""
        del extra_params  # Reserved for future source-specific, validated parameters.
        info = NASA_CHALLENGE_CATALOG.get(dataset_id)
        if not info:
            raise ValueError(f"Unknown NASA Challenge dataset ID: '{dataset_id}'")

        if dataset_id in _CONUS_DATASETS and not self._in_conus(lat, lon):
            return self._make_response(
                info, lat, lon, "out_of_coverage", {},
                f"{info.name} does not cover this field location.",
            )

        try:
            if dataset_id == "cropscape_cdl":
                data = self.query_cropscape_cdl(lat, lon, year or datetime.now(timezone.utc).year)
                return self._make_response(info, lat, lon, "success", data,
                                           f"CropScape classified this point as {data['crop_category']} in {data['year']}.")
            if dataset_id == "web_soil_survey":
                data = self.query_web_soil_survey(lat, lon)
                return self._make_response(info, lat, lon, "success", data,
                                           f"USDA Soil Data Access returned map unit {data.get('map_unit_name') or data.get('mukey')}.")
            if dataset_id == "nasa_power":
                data = self.query_nasa_power(lat, lon, start_date, end_date)
                return self._make_response(info, lat, lon, "success", data,
                                           f"NASA POWER returned {data['observations_count']} valid daily observations.")
            if dataset_id == "era5_reanalysis":
                data = self.query_era5_reanalysis(lat, lon, start_date, end_date)
                return self._make_response(info, lat, lon, "success", data,
                                           f"ERA5 returned {data['observations_count']} daily records.")
            if dataset_id == "usgs_nwis":
                data = self.query_usgs_nwis(lat, lon)
                return self._make_response(info, lat, lon, "success", data,
                                           f"USGS NWIS returned {data['active_stations_found']} active series.")
            if dataset_id in _CMR_PRODUCTS:
                data = self.query_nasa_cmr_granules(_CMR_PRODUCTS[dataset_id], lat, lon)
                status = "metadata_only" if data["granules_count"] else "no_data"
                return self._make_response(
                    info, lat, lon, status, data,
                    f"NASA CMR returned {data['granules_count']} matching granules. Science values were not extracted.",
                )
            if dataset_id == "copernicus_sentinel2":
                data = self.query_sentinel2_catalog(lat, lon)
                status = "metadata_only" if data["scenes_count"] else "no_data"
                return self._make_response(
                    info, lat, lon, status, data,
                    f"Earth Search returned {data['scenes_count']} Sentinel-2 scenes. Indices were not calculated by this catalogue query.",
                )

            return self._make_response(
                info, lat, lon, "unavailable", {},
                "No live field-value connector is implemented for this catalogue source.",
            )
        except (httpx.HTTPError, ValueError, KeyError, SourceUnavailable) as exc:
            logger.warning("Live %s query unavailable: %s", dataset_id, exc)
            return self._make_response(info, lat, lon, "unavailable", {}, str(exc))

    def query_field_challenge_datasets(
        self,
        field_id: str,
        dataset_ids: Optional[list[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        year: Optional[int] = None,
    ) -> FieldMultiQueryResponse:
        """Query sources at a saved field's actual geometry-derived centroid."""
        field = user_farms_repo.get_field(field_id)
        if not field:
            raise ValueError(f"Field not found: {field_id}")
        geometry = field.get("geometry")
        if not geometry:
            raise ValueError(f"Field has no geometry: {field_id}")
        polygon = shape(geometry)
        if polygon.is_empty:
            raise ValueError(f"Field geometry is empty: {field_id}")
        centroid = polygon.centroid
        min_lon, min_lat, max_lon, max_lat = polygon.bounds
        lat, lon = centroid.y, centroid.x

        target_ids = dataset_ids or [
            "smap",
            "gpm_imerg",
            "landsat_modis_viirs",
            "nasa_power",
            "srtm",
            "ecostress",
            "web_soil_survey",
            "cropscape_cdl",
            "era5_reanalysis",
            "copernicus_sentinel2",
        ]
        results = {
            dataset_id: self.query_dataset(
                dataset_id,
                lat=lat,
                lon=lon,
                year=year,
                start_date=start_date,
                end_date=end_date,
            )
            for dataset_id in target_ids
            if dataset_id in NASA_CHALLENGE_CATALOG
        }
        return FieldMultiQueryResponse(
            field_id=field_id,
            field_name=field.get("name") or "Unnamed field",
            farm_name=field.get("farm_name") or "Unassigned farm",
            area_ha=float(field.get("area_hectares") or 0.0),
            centroid={"lat": round(lat, 6), "lon": round(lon, 6)},
            bbox=[round(min_lon, 5), round(min_lat, 5), round(max_lon, 5), round(max_lat, 5)],
            queried_at=datetime.now(timezone.utc).isoformat(),
            results=results,
        )


nasa_challenge_client = NasaChallengeDataClient()
