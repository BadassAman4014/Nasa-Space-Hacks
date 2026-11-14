"""
Unified Boundary Provider for Brandenburg agricultural land.
Coordinates primary DFBK dataset and supplementary InVeKoS WFS,
and manages persistent user farm fields and edited geometries.
"""

from datetime import datetime, timezone
from typing import Any, Optional
import uuid
from shapely.geometry import shape
from app.services.field_boundaries.dfbk_service import dfbk_service
from app.services.field_boundaries.invekos_service import invekos_service
from app.services.field_boundaries.geometry_service import calculate_area_hectares
from app.services.user_farms_repository import user_farms_repo

class BoundaryProvider:
    def __init__(self):
        self.dfbk = dfbk_service
        self.invekos = invekos_service
        self.user_repo = user_farms_repo

    def get_status(self) -> dict[str, Any]:
        """Aggregate status across public providers and local dataset."""
        dfbk_meta = self.dfbk.get_metadata()
        invekos_status = self.invekos.check_availability()

        return {
            "providers": [
                {
                    "name": "DFBK",
                    "title": "Digitales Feldblockkataster Brandenburg",
                    "role": "primary",
                    "status": "ready" if self.dfbk.is_available() else "unavailable",
                    "record_count": dfbk_meta.get("record_count", 0),
                    "version_year": dfbk_meta.get("version_year", 2026),
                    "attribution": "© MLEUV, dl-de/by-2-0",
                    "wfs_status": "offline (HTTP 500 - using local cached spatial index)"
                },
                {
                    "name": "InVeKoS",
                    "title": "InVeKoS Agricultural Parcels WFS",
                    "role": "secondary",
                    "status": invekos_status.get("status", "unknown"),
                    "available": invekos_status.get("available", False),
                    "attribution": "© Land Brandenburg, dl-de/by-2-0"
                }
            ],
            "dataset_version": f"DFBK-{dfbk_meta.get('version_year', 2026)}.1",
            "active_records": dfbk_meta.get("record_count", 0),
            "total_agricultural_hectares": dfbk_meta.get("total_agricultural_hectares", 1327878.1),
            "primary_provider": "DFBK",
            "last_updated": dfbk_meta.get("processed_at", datetime.now(timezone.utc).isoformat())
        }

    def get_viewport_boundaries(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        source: str = "DFBK",
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 150,
        zoom: float = 14.0
    ) -> dict[str, Any]:
        """Fetch agricultural polygons intersecting map viewport."""
        if source.upper() == "INVEKOS":
            return self.invekos.get_boundaries_in_viewport(west, south, east, north, limit=limit)
        return self.dfbk.get_boundaries_in_viewport(
            west=west,
            south=south,
            east=east,
            north=north,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit,
            zoom=zoom
        )

    def get_nearby_boundaries(
        self,
        lat: float,
        lon: float,
        radius: float = 3000,
        source: str = "DFBK",
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 50
    ) -> dict[str, Any]:
        """Fetch agricultural polygons near a given coordinate."""
        if source.upper() == "INVEKOS":
            # Rough bounding box conversion
            d_deg = radius / 111320.0
            return self.invekos.get_boundaries_in_viewport(
                west=lon - d_deg,
                south=lat - d_deg,
                east=lon + d_deg,
                north=lat + d_deg,
                limit=limit
            )
        return self.dfbk.get_nearby_boundaries(
            lat=lat,
            lon=lon,
            radius_meters=radius,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit
        )

    def search_boundaries(
        self,
        location: Optional[str] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        radius: float = 3000,
        source: str = "DFBK",
        land_use_category: Optional[str] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        limit: int = 50
    ) -> dict[str, Any]:
        """Search agricultural field boundaries by municipality name or coordinates."""
        if source.upper() == "INVEKOS":
            if lat is not None and lon is not None:
                d_deg = radius / 111320.0
                return self.invekos.get_boundaries_in_viewport(
                    west=lon - d_deg,
                    south=lat - d_deg,
                    east=lon + d_deg,
                    north=lat + d_deg,
                    limit=limit
                )
            return {"type": "FeatureCollection", "features": []}

        return self.dfbk.search_boundaries(
            location=location,
            lat=lat,
            lon=lon,
            radius=radius,
            land_use_category=land_use_category,
            min_area=min_area,
            max_area=max_area,
            limit=limit
        )

    def get_boundary_by_id(self, boundary_id: str) -> Optional[dict[str, Any]]:
        """Fetch boundary by ID from DFBK local dataset."""
        return self.dfbk.get_boundary_by_id(boundary_id)

    # -------------------------------------------------------------------------
    # Farmer Persistent Fields Management (delegated to user_farms_repo)
    # -------------------------------------------------------------------------

    def import_boundaries_to_farm(
        self,
        farm_id: str,
        boundary_ids: list[str],
        custom_names: Optional[dict[str, str]] = None,
        current_crop: str = ""
    ) -> list[dict[str, Any]]:
        """
        Import multiple selected agricultural boundaries into a persistent farm.
        Requires explicit farmer action.
        """
        custom_names = custom_names or {}

        # Ensure target farm exists in database
        farm = self.user_repo.get_farm(farm_id)
        if not farm:
            farm = self.user_repo.create_farm(
                name=farm_id.replace("farm-", "Farm ").replace("-", " ").title(),
                location="Brandenburg, Germany",
                farm_id=farm_id
            )

        imported = []

        for b_id in boundary_ids:
            boundary = self.get_boundary_by_id(b_id)
            if not boundary:
                continue

            name = custom_names.get(b_id) or f"Field {boundary['external_id'][-4:]} · {boundary['land_use_category']}"
            crop = (current_crop or "").strip()

            field_record = self.user_repo.create_field(
                farm_id=farm_id,
                name=name,
                geometry=boundary["geometry"],
                current_crop=crop,
                source_boundary_id=boundary["id"],
                boundary_source="DFBK",
                land_use_category=boundary["land_use_category"],
                original_geometry=boundary["geometry"],
                area_hectares=boundary["official_net_ha"]
            )
            imported.append(field_record)

        return imported

    def save_field_geometry(
        self,
        field_id: str,
        new_geometry: dict[str, Any],
        farm_id: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Save farmer-edited or farmer-drawn geometry into persistent storage.
        Recalculates metric area in EPSG:25833.
        """
        existing = self.user_repo.get_field(field_id)
        if existing:
            updated = self.user_repo.update_field(field_id, geometry=new_geometry)
            return updated or existing

        # New user-drawn field
        if not farm_id:
            farms = self.user_repo.list_farms()
            if farms:
                farm_id = farms[0]["id"]
            else:
                new_farm = self.user_repo.create_farm(name="My First Farm", location="Brandenburg, Germany")
                farm_id = new_farm["id"]

        return self.user_repo.create_field(
            farm_id=farm_id,
            name=f"Custom Field {field_id[-4:]}",
            geometry=new_geometry,
            current_crop="",
            boundary_source="User-drawn",
            land_use_category="AL"
        )

    def get_farm_fields(self, farm_id: str) -> list[dict[str, Any]]:
        """Return all persistent fields for a specific farm."""
        return self.user_repo.list_fields(farm_id=farm_id)

    def list_all_imported_fields(self, farm_id: Optional[str] = None) -> list[dict[str, Any]]:
        """List all persistent saved user fields."""
        return self.user_repo.list_fields(farm_id=farm_id)

boundary_provider = BoundaryProvider()
