"""
Loader and validator for the sourced crop table (data/crop_profiles.json), the policy rules
(data/policy_rules.json) and the scoring parameters (data/scoring_weights.json).

The files are reference constants. Every crop attribute carries a source key, a reference note and a
verify flag. `validate_profiles` fails loudly if a value has no source, so unsourced numbers cannot
slip into the table.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
PROFILES_PATH = DATA_DIR / "crop_profiles.json"
POLICY_PATH = DATA_DIR / "policy_rules.json"
WEIGHTS_PATH = DATA_DIR / "scoring_weights.json"

#: Crop attributes the four-axis scorer needs. A crop missing any of them is not offered as a recommendation.
REQUIRED_FOR_SCORING = ("botanical_family", "ecocrop", "calendar", "rooting_depth_m")


class ProfileError(ValueError):
    pass


def _load(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def validate_profiles(doc: Dict[str, Any]) -> None:
    """Every attribute needs a registered source and a reference note."""
    sources = doc.get("sources", {})
    if not doc.get("retrieved"):
        raise ProfileError("crop table has no retrieval date")
    for cid, crop in doc.get("crops", {}).items():
        for name, attr in crop.get("attributes", {}).items():
            if not isinstance(attr, dict) or "source" not in attr or "ref" not in attr:
                raise ProfileError(f"{cid}.{name}: missing source/ref")
            if attr["source"] not in sources:
                raise ProfileError(f"{cid}.{name}: unknown source '{attr['source']}'")
            if "verify" not in attr:
                raise ProfileError(f"{cid}.{name}: missing verify flag")
        scoring = crop.get("scoring", {})
        needed = [k for k in REQUIRED_FOR_SCORING if k not in crop.get("attributes", {})]
        if scoring.get("eligible") and needed:
            raise ProfileError(f"{cid}: marked eligible but lacks {needed}")


@lru_cache(maxsize=1)
def load_profiles() -> Dict[str, Any]:
    doc = _load(PROFILES_PATH)
    validate_profiles(doc)
    return doc


@lru_cache(maxsize=1)
def load_policy() -> Dict[str, Any]:
    return _load(POLICY_PATH)


@lru_cache(maxsize=1)
def load_weights() -> Dict[str, Any]:
    return _load(WEIGHTS_PATH)


def crop_ids() -> List[str]:
    return list(load_profiles()["crops"].keys())


def eligible_crop_ids() -> List[str]:
    return [cid for cid, c in load_profiles()["crops"].items() if c["scoring"]["eligible"]]


def get_crop(crop_id: str) -> Dict[str, Any]:
    try:
        return load_profiles()["crops"][crop_id]
    except KeyError as exc:
        raise ProfileError(f"Unknown crop '{crop_id}'") from exc


def attr(crop_id: str, name: str) -> Optional[Any]:
    """Value of one attribute or None when the crop table has no sourced value."""
    crop = load_profiles()["crops"].get(crop_id)
    if crop is None:
        return None
    a = crop["attributes"].get(name)
    return None if a is None else a.get("value")


def attr_source(crop_id: str, name: str) -> Optional[Dict[str, Any]]:
    crop = load_profiles()["crops"].get(crop_id)
    a = None if crop is None else crop["attributes"].get(name)
    if a is None:
        return None
    src = load_profiles()["sources"][a["source"]]
    return {"key": a["source"], "name": src["name"], "url": src["url"], "ref": a["ref"], "verify": a["verify"], "retrieved": load_profiles()["retrieved"]}


def is_legume(crop_id: str) -> bool:
    return bool(attr(crop_id, "grain_legume"))


def family(crop_id: str) -> Optional[str]:
    return attr(crop_id, "botanical_family")


def calendar(crop_id: str) -> Optional[Dict[str, Any]]:
    return attr(crop_id, "calendar")


HISTORY_ONLY_LABELS = {"fallow_or_grass": ("Fallow / grass / perennial", "Brache / Gras / mehrjährig"), "other": ("Other crop", "Andere Kultur")}


def label(crop_id: str, lang: str = "en") -> str:
    c = load_profiles()["crops"].get(crop_id)
    if c is None:
        pair = HISTORY_ONLY_LABELS.get(crop_id)
        return (pair[1] if lang == "de" else pair[0]) if pair else crop_id
    return c["label_de"] if lang == "de" else c["label_en"]


def public_table() -> Dict[str, Any]:
    """The crop table as served to the UI: every attribute with its source expanded."""
    doc = load_profiles()
    out = []
    for cid, crop in doc["crops"].items():
        attrs = {}
        for name, a in crop["attributes"].items():
            src = doc["sources"][a["source"]]
            attrs[name] = {
                "value": a["value"], "ref": a["ref"], "verify": a["verify"], "note": a.get("note"),
                "source": {"key": a["source"], "name": src["name"], "url": src["url"]},
            }
        out.append({"id": cid, "label_en": crop["label_en"], "label_de": crop["label_de"],
                    "scoring": crop["scoring"], "attributes": attrs})
    return {"retrieved": doc["retrieved"], "generated_by": doc["generated_by"], "crops": out,
            "sources": {k: {"name": v["name"], "url": v["url"], "note": v.get("note")} for k, v in doc["sources"].items()}}
