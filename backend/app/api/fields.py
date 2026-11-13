"""
FastAPI endpoints for farmer field management, boundary imports, updates, and geometry editing.
Fully backed by persistent SQLite database storage.
"""

from typing import Optional, Any
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from app.services.field_boundaries.boundary_provider import boundary_provider
from app.services.user_farms_repository import user_farms_repo

router = APIRouter(tags=["fields"])

class CreateFieldRequest(BaseModel):
    farm_id: str = Field(..., description="Target farm ID")
    name: str = Field(..., min_length=1, description="Field name")
    geometry: dict[str, Any] = Field(..., description="GeoJSON geometry object")
    current_crop: Optional[str] = Field(default="", description="Optional current crop")
    source_boundary_id: Optional[str] = Field(default=None, description="Optional DFBK boundary ID")
    boundary_source: Optional[str] = Field(default="DFBK")
    land_use_category: Optional[str] = Field(default="")
    area_hectares: Optional[float] = Field(default=None, ge=0)

class UpdateFieldRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    farm_id: Optional[str] = Field(default=None)
    current_crop: Optional[str] = Field(default=None)
    geometry: Optional[dict[str, Any]] = Field(default=None)

class ImportBoundariesRequest(BaseModel):
    farm_id: str = Field(..., description="Target farm ID")
    boundary_ids: list[str] = Field(..., min_length=1, description="List of official boundary IDs to import")
    custom_names: Optional[dict[str, str]] = Field(default=None, description="Optional custom names per boundary ID")
    current_crop: Optional[str] = Field(default="", description="Optional default crop")

class EditGeometryRequest(BaseModel):
    geometry: dict[str, Any] = Field(..., description="GeoJSON geometry object (Polygon or MultiPolygon)")

@router.post("/fields", status_code=201)
def create_field(payload: CreateFieldRequest):
    """Save an individual field directly to persistent farm records."""
    try:
        field = user_farms_repo.create_field(
            farm_id=payload.farm_id,
            name=payload.name,
            geometry=payload.geometry,
            current_crop=payload.current_crop or "",
            source_boundary_id=payload.source_boundary_id,
            boundary_source=payload.boundary_source or "DFBK",
            land_use_category=payload.land_use_category or "",
            area_hectares=payload.area_hectares
        )
        return {"status": "success", "field": field}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create field: {e}")

@router.get("/fields")
def list_all_fields(farm_id: Optional[str] = Query(None, description="Optional farm ID filter")):
    """List all saved user fields, optionally filtered by farm ID."""
    return user_farms_repo.list_fields(farm_id=farm_id)

@router.get("/fields/{field_id}")
def get_field(field_id: str = Path(..., description="Field identifier")):
    """Retrieve an individual saved field by ID."""
    field = user_farms_repo.get_field(field_id)
    if not field:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return field

@router.patch("/fields/{field_id}")
@router.put("/fields/{field_id}")
def update_field(field_id: str, payload: UpdateFieldRequest):
    """Update field name, farm association, crop, or geometry."""
    try:
        updated = user_farms_repo.update_field(
            field_id=field_id,
            name=payload.name,
            farm_id=payload.farm_id,
            current_crop=payload.current_crop,
            geometry=payload.geometry
        )
        if not updated:
            raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
        return {"status": "success", "field": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update field: {e}")

@router.delete("/fields/{field_id}")
def delete_field(field_id: str):
    """Delete a user-saved field. Does not affect official reference data."""
    deleted = user_farms_repo.delete_field(field_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Field '{field_id}' not found.")
    return {"status": "success", "message": f"Field '{field_id}' removed from farm."}

@router.post("/fields/import-boundaries")
def import_boundaries(payload: ImportBoundariesRequest):
    """
    Import multiple selected agricultural boundaries into a farmer's farm.
    Preserves official geometry reference and calculates net agricultural area.
    """
    try:
        imported = boundary_provider.import_boundaries_to_farm(
            farm_id=payload.farm_id,
            boundary_ids=payload.boundary_ids,
            custom_names=payload.custom_names,
            current_crop=payload.current_crop or ""
        )
        if not imported:
            raise HTTPException(status_code=404, detail="None of the specified boundary IDs were found.")
        return {
            "status": "success",
            "imported_count": len(imported),
            "farm_id": payload.farm_id,
            "fields": imported
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import boundaries: {e}")

@router.post("/fields/{field_id}/geometry")
def save_field_geometry(
    field_id: str = Path(..., description="Field identifier"),
    payload: EditGeometryRequest = ...
):
    """
    Save farmer-edited geometry.
    Maintains original official boundary and records the updated farmer geometry.
    """
    try:
        updated = boundary_provider.save_field_geometry(field_id, payload.geometry)
        return {
            "status": "success",
            "field": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save field geometry: {e}")

@router.get("/farms/{farm_id}/fields")
def get_farm_fields(farm_id: str = Path(..., description="Target farm ID")):
    """Return all persistent fields for a given farm."""
    fields = boundary_provider.get_farm_fields(farm_id)
    return {
        "farm_id": farm_id,
        "count": len(fields),
        "fields": fields
    }

@router.post("/fields/{field_id}/history")
def save_history(field_id: str, payload: dict):
    return {"field_id": field_id, "history": payload.get("history", []), "status": "accepted"}
