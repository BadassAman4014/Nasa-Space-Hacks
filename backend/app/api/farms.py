"""
FastAPI endpoints for managing user farms with persistent storage.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from app.services.user_farms_repository import user_farms_repo

router = APIRouter(prefix="/farms", tags=["farms"])

class CreateFarmRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Farm name")
    location: Optional[str] = Field(default="Brandenburg, Germany", description="Farm location")

class UpdateFarmRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    location: Optional[str] = Field(default=None)

@router.post("", status_code=201)
def create_farm(payload: CreateFarmRequest):
    """Create a new persistent user farm."""
    try:
        farm = user_farms_repo.create_farm(name=payload.name, location=payload.location or "Brandenburg, Germany")
        return farm
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create farm: {e}")

@router.get("")
def list_farms():
    """List all saved user farms with field statistics."""
    return user_farms_repo.list_farms()

@router.get("/{farm_id}")
def get_farm(farm_id: str = Path(..., description="Farm ID")):
    """Get farm details and summary stats."""
    farm = user_farms_repo.get_farm(farm_id)
    if not farm:
        raise HTTPException(status_code=404, detail=f"Farm '{farm_id}' not found.")
    return farm

@router.patch("/{farm_id}")
@router.put("/{farm_id}")
def update_farm(farm_id: str, payload: UpdateFarmRequest):
    """Update farm name or location."""
    updated = user_farms_repo.update_farm(farm_id, name=payload.name, location=payload.location)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Farm '{farm_id}' not found.")
    return updated

@router.delete("/{farm_id}")
def delete_farm(farm_id: str):
    """Delete a farm and its associated fields."""
    deleted = user_farms_repo.delete_farm(farm_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Farm '{farm_id}' not found.")
    return {"status": "success", "message": f"Farm '{farm_id}' deleted successfully."}
