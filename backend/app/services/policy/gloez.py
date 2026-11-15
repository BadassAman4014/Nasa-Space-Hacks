"""
GLÖZ 7 (Fruchtwechsel) per-field check.

Rule (Landwirtschaftskammer NRW, status 10.09.2025, planning year 2026): on every arable parcel at least
two different main crops must be grown within three consecutive years. Winter and summer forms count as
different crops. Rye in self-succession is exempt. Perennial crops, fallow and grass are outside the rule.

The farm-level part (at least 33 % of the arable area with an annual change or a catch crop to 31 Dec) cannot
be judged for one field. The per-field output only says whether the crop changed in each year, so the farmer
can see which years would count against that quota.

The rule values come from data/policy_rules.json so they can be updated or turned into a soft warning.
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.services.crop_planner.profiles import load_policy

#: Entries that are outside the GLÖZ 7 crop-change rule (perennials, fallow, grass).
OUTSIDE_RULE = {"fallow_or_grass"}
#: Entry whose crop identity is not known, so a window containing it cannot be judged.
UNKNOWN = "other"


def validate_sequence(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    entries: [{"year": 2025, "crop": "winter_wheat"}, ...] in any order.
    Returns the verdict for every 3-year window and an overall status.
    """
    rule = load_policy()["gloez7"]
    n = int(rule["window_years"])
    need = int(rule["min_distinct_main_crops"])
    exempt = set(rule.get("self_succession_exempt_crops", []))

    by_year = {int(e["year"]): e["crop"] for e in entries}
    years = sorted(by_year)
    windows: List[Dict[str, Any]] = []
    violations: List[Dict[str, Any]] = []

    for i in range(len(years) - n + 1):
        ys = years[i : i + n]
        if ys[-1] - ys[0] != n - 1:
            continue  # gap in the years, not three consecutive years
        crops = [by_year[y] for y in ys]
        if any(c in OUTSIDE_RULE for c in crops):
            status, why = "outside_rule", "A fallow or grass year is in this window, which is outside the rotation rule."
        elif any(c == UNKNOWN for c in crops):
            status, why = "unknown", "A year with an unspecified crop is in this window, so it cannot be judged."
        elif len(set(crops)) >= need:
            status, why = "ok", None
        elif len(set(crops)) == 1 and crops[0] in exempt:
            status, why = "exempt", "Rye in self-succession is exempt from the rule."
        else:
            status, why = "violation", f"{crops[0]} was the only main crop in {ys[0]}-{ys[-1]}; at least {need} different main crops are required in {n} years."
        w = {"years": ys, "crops": crops, "status": status, "reason": why}
        windows.append(w)
        if status == "violation":
            violations.append(w)

    changes = []
    for a, b in zip(years, years[1:]):
        if b - a == 1:
            ca, cb = by_year[a], by_year[b]
            changes.append({"year": b, "crop": cb, "changed_from_previous": ca != cb})

    if violations:
        overall = "violation"
    elif any(w["status"] == "unknown" for w in windows):
        overall = "unknown"
    elif not windows:
        overall = "not_enough_years"
    else:
        overall = "compliant"

    src = rule["source"]
    return {
        "status": overall,
        "compliant": overall == "compliant",
        "violations": violations,
        "windows": windows,
        "annual_change": changes,
        "annual_change_note": "Farm-level rule: at least 33 % of the arable area needs a different main crop each year, or a catch crop / undersown crop kept to 31 December when the same crop is grown again. This is checked for the whole farm, not per field.",
        "exemption_note": rule["enforcement_note"],
        "rule": {"label": rule["label_en"], "enforcement": rule["enforcement"], "verify": rule["verify"],
                 "source_name": src["name"], "source_url": src["url"], "retrieved": src["retrieved"]},
    }
