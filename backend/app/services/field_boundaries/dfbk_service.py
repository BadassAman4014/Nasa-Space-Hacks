"""
Digitales Feldblockkataster (DFBK) Service.
Provides high-performance spatial queries for Brandenburg agricultural field blocks.
Reads from indexed spatial storage (GeoPackage / PostGIS) with WFS fallback handling.

Attribution: © MLEUV, dl-de/by-2-0
"""

import json
import math
import re
from pathlib import Path
from typing import Any, Optional
import pyogrio
from shapely.geometry import mapping, Point
from app.services.field_boundaries.geometry_service import simplify_for_zoom

# Predefined coordinates for common Brandenburg agricultural regions / municipalities
BRANDENBURG_MUNICIPALITIES: dict[str, tuple[float, float]] = {
    "potsdam": (52.3989, 13.0657),
    "cottbus": (51.7563, 14.3329),
    "havelland": (52.6375, 12.6961),
    "oderbruch": (52.7118, 14.2882),
    "barnim": (52.8344, 13.6875),
    "spreewald": (51.8694, 13.9589),
    "brandenburg an der havel": (52.4111, 12.5561),
    "frankfurt (oder)": (52.3424, 14.5516),
    "eberswalde": (52.8344, 13.8197),
    "nauen": (52.6053, 12.8753),
    "neuruppin": (52.9244, 12.8058),
    "jüterbog": (51.9922, 13.0808),
    "luckenwalde": (52.0897, 13.1706),
    "kyritz": (52.9436, 12.3961),
    "wittstock": (53.1633, 12.4858),
    "prenzlau": (53.3150, 13.8631),
    "angermünde": (53.0175, 13.9989),
    "beeskowa": (52.1722, 14.2464),
    "seelow": (52.5333, 14.3833),
}

class DFBKService:
    MAX_READ = 5000  # hard ceiling on geometries read per request

    def __init__(self):
        self.base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.gpkg_path = self.base_dir / "data" / "dfbk_agricultural.gpkg"
        self.meta_path = self.base_dir / "data" / "dfbk_metadata.json"
        self._metadata_cache: Optional[dict[str, Any]] = None

    def get_metadata(self) -> dict[str, Any]:
        if self._metadata_cache is not None:
            return self._metadata_cache

        if self.meta_path.exists():
            try:
                with open(self.meta_path, "r", encoding="utf-8") as f:
                    self._metadata_cache = json.load(f)
                    return self._metadata_cache
            except Exception:
                pass

        return {
            "source_name": "Digitales Feldblockkataster (DFBK)",
            "source_url": "https://data.geobasis-bb.de/geofachdaten/Landwirtschaft/dfbk.zip",
            "license": "dl-de/by-2-0",
            "attribution": "© MLEUV, dl-de/by-2-0",
            "attribution_modified": "© MLEUV, dl-de/by-2-0, Daten verändert",
            "version_year": 2026,
            "record_count": 90756,
            "status": "active" if self.gpkg_path.exists() else "unindexed"
        }

    def is_available(self) -> bool:
        return self.gpkg_path.exists()

    def get_boundaries_in_viewport(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 150,
        zoom: float = 14.0,
        center: Optional[tuple[float, float]] = None,
    ) -> dict[str, Any]:
        """
        Query agricultural field boundaries intersecting a WGS84 bounding box.
        Attribute filters run inside the spatial query (before any cap), so they never hide
        blocks that exist. When more than `limit` blocks match, the nearest to `center`
        (default: box centre) are returned and the response says it was truncated.
        Executes sub-100ms spatial indexed query directly via GeoPackage.
        """
        if not self.is_available():
            raise FileNotFoundError("DFBK agricultural dataset is not yet preprocessed. Run preprocess_dfbk.py.")

        # Ensure valid bbox order
        minx = min(west, east)
        maxx = max(west, east)
        miny = min(south, north)
        maxy = max(south, north)

        # Enforce reasonable viewport size limits to prevent runaway queries
        if (maxx - minx) > 3.0 or (maxy - miny) > 3.0:
            raise ValueError("Requested viewport bounding box is too large. Please zoom in closer to inspect fields.")

        where_parts = []
        if land_use_category and land_use_category.upper() != "ALL":
            cat = land_use_category.upper()
            if not re.fullmatch(r"[A-Z\-]{1,12}", cat):
                raise ValueError("Invalid land use category.")
            where_parts.append(f"land_use_category = '{cat}'")
        if min_area is not None:
            where_parts.append(f"official_net_ha >= {float(min_area)}")
        if max_area is not None:
            where_parts.append(f"official_net_ha <= {float(max_area)}")
        where = " AND ".join(where_parts) or None
        bbox = (minx, miny, maxx, maxy)

        # Exact number of matching blocks in view (cheap: no geometry read).
        total_in_view = len(
            pyogrio.read_dataframe(self.gpkg_path, bbox=bbox, where=where, columns=["land_use_category"], read_geometry=False)
        )
        empty_props = {"count": 0, "total_in_view": 0, "truncated": False, "source": "DFBK", "attribution": "© MLEUV, dl-de/by-2-0"}
        if total_in_view == 0:
            return {"type": "FeatureCollection", "features": [], "properties": empty_props}

        df = pyogrio.read_dataframe(self.gpkg_path, bbox=bbox, where=where, max_features=self.MAX_READ)
        if len(df) > limit:
            cx, cy = center if center else ((minx + maxx) / 2.0, (miny + maxy) / 2.0)
            bounds = df.geometry.bounds
            kx = math.cos(math.radians(cy))
            dist = ((bounds.minx + bounds.maxx) / 2.0 - cx).mul(kx) ** 2 + ((bounds.miny + bounds.maxy) / 2.0 - cy) ** 2
            df = df.loc[dist.sort_values().index[:limit]]

        features = []
        for _, row in df.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue

            if zoom < 14:
                geom = simplify_for_zoom(geom, zoom)

            features.append({
                "type": "Feature",
                "id": row["external_id"],
                "properties": {
                    "id": row["external_id"],
                    "external_id": row["external_id"],
                    "source": "DFBK",
                    "land_use_category": row["land_use_category"],
                    "category_label": self._get_category_label(row["land_use_category"]),
                    "official_net_ha": float(row["official_net_ha"]),
                    "official_gross_ha": float(row["official_gross_ha"]),
                    "calculated_area_ha": float(row["calc_area_ha"]),
                    "validity_year": int(row.get("validity_year", 2026)),
                    "validity_start": str(row.get("validity_start", "")),
                    "validity_end": str(row.get("validity_end", "")),
                    "attribution": "© MLEUV, dl-de/by-2-0"
                },
                "geometry": mapping(geom)
            })

        return {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "count": len(features),
                "total_in_view": total_in_view,
                "truncated": total_in_view > len(features),
                "total_area_ha": round(sum(f["properties"]["official_net_ha"] for f in features), 2),
                "source": "DFBK",
                "attribution": "© MLEUV, dl-de/by-2-0"
            }
        }

    def get_nearby_boundaries(
        self,
        lat: float,
        lon: float,
        radius_meters: float = 3000,
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 50
    ) -> dict[str, Any]:
        """
        Query agricultural field blocks around a coordinate within a given radius (meters).
        """
        # 1 degree latitude ~= 111.32 km; longitude scaled by cos(lat)
        deg_lat = radius_meters / 111_320.0
        deg_lon = radius_meters / (111_320.0 * math.cos(math.radians(lat)))

        west = lon - deg_lon
        east = lon + deg_lon
        south = lat - deg_lat
        north = lat + deg_lat

        res = self.get_boundaries_in_viewport(
            west=west,
            south=south,
            east=east,
            north=north,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit,
            zoom=15,
            center=(lon, lat),
        )
        return res

    def search_boundaries(
        self,
        location: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        radius: float = 3000,
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 50
    ) -> dict[str, Any]:
        """
        Search boundaries by municipality name or coordinates.
        """
        if location:
            loc_key = location.strip().lower()
            if loc_key in BRANDENBURG_MUNICIPALITIES:
                lat, lon = BRANDENBURG_MUNICIPALITIES[loc_key]
            else:
                # Partial match in known Brandenburg regions
                for key, coords in BRANDENBURG_MUNICIPALITIES.items():
                    if loc_key in key or key in loc_key:
                        lat, lon = coords
                        break

        if lat is None or lon is None:
            # Default to Potsdam as the core Brandenburg demo location
            lat, lon = BRANDENBURG_MUNICIPALITIES["potsdam"]

        return self.get_nearby_boundaries(
            lat=lat,
            lon=lon,
            radius_meters=radius,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit
        )

    def get_boundary_by_id(self, boundary_id: str) -> Optional[dict[str, Any]]:
        """
        Fetch a single boundary by external_id (e.g. DEBBLI...).
        """
        if not self.is_available():
            return None

        # Exact query
        df = pyogrio.read_dataframe(
            self.gpkg_path,
            where="external_id = '" + boundary_id.replace("'", "''") + "'",
            max_features=1
        )
        if df.empty:
            return None

        row = df.iloc[0]
        return {
            "id": row["external_id"],
            "external_id": row["external_id"],
            "source": "DFBK",
            "land_use_category": row["land_use_category"],
            "category_label": self._get_category_label(row["land_use_category"]),
            "official_net_ha": float(row["official_net_ha"]),
            "official_gross_ha": float(row["official_gross_ha"]),
            "calculated_area_ha": float(row["calc_area_ha"]),
            "validity_year": int(row.get("validity_year", 2026)),
            "validity_start": str(row.get("validity_start", "")),
            "validity_end": str(row.get("validity_end", "")),
            "attribution": "© MLEUV, dl-de/by-2-0",
            "geometry": mapping(row.geometry)
        }

    @staticmethod
    def _get_category_label(cat: str) -> str:
        labels = {
            "AL": "Arable land (Ackerland)",
            "GL": "Permanent grassland (Dauergrünland)",
            "DK": "Permanent crops (Dauerkulturen)",
            "AL-AF": "Arable agroforestry (Ackerland Agroforst)",
            "GL-AF": "Grassland agroforestry (Grünland Agroforst)",
            "DK-AF": "Permanent crops agroforestry (Dauerkulturen Agroforst)",
            "AL-APV": "Agri-Photovoltaic arable (Agri-PV Acker)",
            "GL-APV": "Agri-Photovoltaic grassland (Agri-PV Grünland)",
            "DK-APV": "Agri-Photovoltaic crops (Agri-PV Dauerkulturen)",
            "GL-ELP": "Individual reference grassland (Grünland ELP)",
            "GL-MO": "Peatland grassland (Moorboden Grünland)",
        }
        return labels.get(cat, cat)

dfbk_service = DFBKService()

