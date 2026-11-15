"""SoilGrids topsoil access and the 0-100 soil health score."""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.services.soilgrids.service import soilgrids_service
from app.services.field_analytics.health.common import DERIVED, unavailable


def topsoil(field_id: str, fetch_if_missing: bool = True) -> Optional[Any]:
    profile = soilgrids_service.get_field_soil_profile(field_id)
    if (not profile or not profile.topsoil_summary) and fetch_if_missing:
        try:
            profile = soilgrids_service.extract_field_soil(field_id, force_refresh=False)
        except Exception:
            profile = None
    return profile.topsoil_summary if profile and profile.topsoil_summary else None


def _linear(value: float, zero: float, full: float) -> float:
    """0 at `zero`, 100 at `full`, clamped (works for rising or falling scales)."""
    if full == zero:
        return 100.0
    t = (value - zero) / (full - zero)
    return round(100.0 * max(0.0, min(1.0, t)), 1)


def soil_health_score(field_id: str) -> Dict[str, Any]:
    top = topsoil(field_id)
    if top is None:
        return unavailable("SoilGrids topsoil data is not available for this field.")

    ph = float(top.ph)
    if ph < 6.0:
        ph_score = _linear(ph, 4.5, 6.0)
    elif ph > 7.2:
        ph_score = _linear(ph, 8.5, 7.2)
    else:
        ph_score = 100.0
    components = [
        {"name": "Soil reaction (pH)", "value": round(ph, 1), "unit": "pH", "score": ph_score,
         "rule": "100 between pH 6.0 and 7.2; falls to 0 at 4.5 and 8.5"},
        {"name": "Organic carbon", "value": round(float(top.organic_carbon_pct), 2), "unit": "%",
         "score": _linear(float(top.organic_carbon_pct), 0.5, 2.0),
         "rule": "0 at 0.5 %, 100 at 2.0 % and above"},
        {"name": "Nutrient holding (CEC)", "value": round(float(top.cec_mmol_kg), 0), "unit": "mmol(c)/kg",
         "score": _linear(float(top.cec_mmol_kg), 30.0, 150.0),
         "rule": "0 at 30, 100 at 150 mmol(c)/kg and above"},
        {"name": "Compaction (bulk density)", "value": round(float(top.bulk_density_g_cm3), 2), "unit": "g/cm³",
         "score": _linear(float(top.bulk_density_g_cm3), 1.75, 1.40),
         "rule": "100 at 1.40 g/cm³ and below, 0 at 1.75"},
    ]
    score = round(sum(c["score"] for c in components) / len(components))
    label = "good" if score >= 70 else "fair" if score >= 45 else "poor"
    weakest = min(components, key=lambda c: c["score"])
    return {
        "available": True,
        "score": score,
        "label": label,
        "components": components,
        "weakest": weakest["name"],
        "texture": top.texture_class,
        "sand_pct": round(float(top.sand_pct), 1),
        "clay_pct": round(float(top.clay_pct), 1),
        "silt_pct": round(float(top.silt_pct), 1),
        "provenance": DERIVED,
        "source": "ISRIC SoilGrids v2.0, 0-30 cm, 250 m",
        "method": "Equal-weight mean of four component scores. A FieldShift indicator, not an official soil index.",
    }
