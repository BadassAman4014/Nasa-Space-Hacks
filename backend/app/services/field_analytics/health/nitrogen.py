"""
Farmer inputs and an *estimate* of the nitrogen requirement following the structure of
the German Fertiliser Ordinance (DüV 2020, § 4 and Anlage 4).

This is not an official Düngebedarfsermittlung. The legal value must come from the
farm's own calculation (in Brandenburg typically BESyD) with its measured Nmin.
Red-zone (nitrate area) status is not known to FieldShift, so the 20 % reduction for
those areas is not applied and the user is told so.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.services.field_analytics.health.common import DERIVED, FARMER_INPUT, unavailable

DB = Path(__file__).resolve().parents[3] / "data" / "field_analytics.db"

#: crop -> (N requirement kg N/ha at reference yield, reference yield, yield unit,
#:          step size for the yield correction, +kg per step above, -kg per step below, max increase)
#: Values follow DüV Anlage 4 Tabelle 2 and the yield corrections of § 4 / Anlage 4 Tabelle 3.
CROPS: Dict[str, Dict[str, Any]] = {
    "winter_wheat": {"label": "Winter wheat (A/B)", "n_ref": 230, "y_ref": 80, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "winter_barley": {"label": "Winter barley", "n_ref": 180, "y_ref": 70, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "winter_rye": {"label": "Winter rye", "n_ref": 170, "y_ref": 70, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "winter_triticale": {"label": "Winter triticale", "n_ref": 190, "y_ref": 70, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "spring_barley": {"label": "Spring barley", "n_ref": 140, "y_ref": 50, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "winter_rapeseed": {"label": "Winter oilseed rape", "n_ref": 200, "y_ref": 40, "unit": "dt/ha", "step": 5, "up": 10, "down": 15, "max_up": 40},
    "silage_maize": {"label": "Silage maize", "n_ref": 200, "y_ref": 450, "unit": "dt FM/ha", "step": 50, "up": 10, "down": 15, "max_up": 40},
    "grain_maize": {"label": "Grain maize", "n_ref": 200, "y_ref": 90, "unit": "dt/ha", "step": 10, "up": 10, "down": 15, "max_up": 40},
    "sugar_beet": {"label": "Sugar beet", "n_ref": 170, "y_ref": 650, "unit": "dt/ha", "step": 100, "up": 10, "down": 15, "max_up": 40},
}

#: Previous-crop deduction, kg N/ha (DüV Anlage 4 Tabelle 7, main cases).
PREVIOUS_CROP: Dict[str, Dict[str, Any]] = {
    "cereals": {"label": "Cereals", "kg": 0},
    "maize": {"label": "Maize", "kg": 0},
    "rapeseed": {"label": "Oilseed rape", "kg": 10},
    "grain_legumes": {"label": "Grain legumes (peas, beans, lupins)", "kg": 10},
    "sugar_beet_leaves_left": {"label": "Sugar beet, leaves left on field", "kg": 10},
    "grass_clover": {"label": "Grass/clover ley", "kg": 20},
    "other": {"label": "Other / none", "kg": 0},
}


@contextmanager
def _conn():
    c = sqlite3.connect(str(DB), timeout=30.0)
    c.row_factory = sqlite3.Row
    try:
        c.execute(
            "CREATE TABLE IF NOT EXISTS field_farmer_inputs (field_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        yield c
        c.commit()
    finally:
        c.close()


INPUT_FIELDS = (
    "crop", "yield_target", "previous_crop", "nmin_kg_ha", "organic_n_last_year_kg_ha",
    "last_n_application_date", "last_n_application_kg_ha",
)


def get_inputs(field_id: str) -> Dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT payload_json, updated_at FROM field_farmer_inputs WHERE field_id = ?", (field_id,)).fetchone()
    if not row:
        return {"field_id": field_id, "updated_at": None, **{k: None for k in INPUT_FIELDS}}
    return {"field_id": field_id, "updated_at": row["updated_at"], **json.loads(row["payload_json"])}


def save_inputs(field_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    clean = {k: data.get(k) for k in INPUT_FIELDS}
    if clean["crop"] is not None and clean["crop"] not in CROPS:
        raise ValueError(f"Unknown crop '{clean['crop']}'.")
    if clean["previous_crop"] is not None and clean["previous_crop"] not in PREVIOUS_CROP:
        raise ValueError(f"Unknown previous crop '{clean['previous_crop']}'.")
    for k in ("yield_target", "nmin_kg_ha", "organic_n_last_year_kg_ha", "last_n_application_kg_ha"):
        if clean[k] is not None:
            v = float(clean[k])
            if v < 0 or v > 2000:
                raise ValueError(f"{k} is out of range.")
            clean[k] = v
    if clean["last_n_application_date"]:
        datetime.strptime(clean["last_n_application_date"], "%Y-%m-%d")
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO field_farmer_inputs VALUES (?, ?, ?)", (field_id, json.dumps(clean), now)
        )
    return get_inputs(field_id)


def nitrogen_estimate(field_id: str, humus_pct: Optional[float]) -> Dict[str, Any]:
    inputs = get_inputs(field_id)
    crop_key = inputs.get("crop")
    missing = [k for k in ("crop", "yield_target", "nmin_kg_ha") if inputs.get(k) is None]
    base = {
        "options": {
            "crops": {k: v["label"] for k, v in CROPS.items()},
            "previous_crops": {k: v["label"] for k, v in PREVIOUS_CROP.items()},
        },
        "inputs": inputs,
    }
    if missing:
        return {**unavailable("Enter crop, yield target and spring Nmin to estimate the nitrogen requirement.", missing_inputs=missing), **base}

    crop = CROPS[crop_key]
    y = float(inputs["yield_target"])
    diff_steps = (y - crop["y_ref"]) / crop["step"]
    if diff_steps >= 0:
        yield_adj = min(crop["max_up"], int(diff_steps) * crop["up"])
    else:
        yield_adj = -int(-diff_steps) * crop["down"]
    lines = [
        {"label": f"Requirement value for {crop['label']} at {crop['y_ref']} {crop['unit']}", "kg_n_ha": crop["n_ref"]},
        {"label": f"Yield correction for {y:g} {crop['unit']}", "kg_n_ha": yield_adj},
        {"label": "Spring Nmin (0-90 cm), farmer input", "kg_n_ha": -float(inputs["nmin_kg_ha"])},
    ]
    if humus_pct is not None and humus_pct > 4.5:
        lines.append({"label": f"Humus {humus_pct:.1f} % (> 4.5 %)", "kg_n_ha": -20})
    prev = inputs.get("previous_crop")
    if prev and PREVIOUS_CROP[prev]["kg"]:
        lines.append({"label": f"Previous crop: {PREVIOUS_CROP[prev]['label']}", "kg_n_ha": -PREVIOUS_CROP[prev]["kg"]})
    if inputs.get("organic_n_last_year_kg_ha"):
        lines.append({"label": "10 % of organic N applied last year", "kg_n_ha": -round(0.1 * float(inputs["organic_n_last_year_kg_ha"]))})

    total = max(0, round(sum(l["kg_n_ha"] for l in lines)))
    applied = inputs.get("last_n_application_kg_ha")
    return {
        "available": True,
        "provenance": DERIVED,
        "estimate_kg_n_ha": total,
        "applied_kg_n_ha": applied,
        "remaining_kg_n_ha": None if applied is None else max(0, round(total - float(applied))),
        "lines": lines,
        "humus_pct_used": None if humus_pct is None else round(humus_pct, 1),
        "inputs_provenance": FARMER_INPUT,
        "warnings": [
            "Estimate following DüV § 4 / Anlage 4, not an official Düngebedarfsermittlung. Use your BESyD or advisor calculation for the legal limit.",
            "Red-zone (nitrate area) status is not known to FieldShift. In a red zone the requirement must be reduced by 20 %.",
        ],
        **base,
    }
