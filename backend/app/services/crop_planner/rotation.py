"""
Rotation mechanics from the sourced crop calendar: which crop may follow which, how long a field is occupied,
and the rest periods that advisory sources require between the same crop.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from app.services.crop_planner import profiles

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MONTH_OF_DOY: List[int] = [m + 1 for m, n in enumerate(DAYS_IN_MONTH) for _ in range(n)]  # index doy-1
SUMMER_DOYS = range(152, 244)  # 1 Jun - 31 Aug, non-leap


def _cal(crop: str) -> Dict[str, Any]:
    c = profiles.calendar(crop)
    if not c:
        raise profiles.ProfileError(f"{crop} has no sourced calendar")
    return c


def feasible_succession(prev: str, nxt: str, min_gap_days: Optional[int] = None) -> Dict[str, Any]:
    """
    A crop can follow another if the predecessor's median harvest plus a seedbed gap falls before the
    successor's median sowing. Years are counted on an absolute day axis (crop-year = harvest year).
    """
    gap = int(profiles.load_weights()["feasibility"]["min_gap_days_between_harvest_and_sowing"]) if min_gap_days is None else min_gap_days
    cp, cn = _cal(prev), _cal(nxt)
    harvest_prev = cp["harvest_median_doy"]  # in year y
    sow_next = cn["sow_median_doy"] - (365 if cn["winter_sown"] else 0) + 365  # in year y if winter sown (autumn), else year y+1
    days = sow_next - harvest_prev
    return {"ok": days >= gap, "gap_days": round(days, 1), "required_gap_days": gap,
            "reason": None if days >= gap else f"{profiles.label(prev)} is harvested around day {round(harvest_prev)} of the year and {profiles.label(nxt)} is sown around day {round(cn['sow_median_doy'])}; the gap of {round(days)} days is shorter than the {gap} days needed to prepare the seedbed."}


def break_requirement(crop: str) -> Optional[Dict[str, Any]]:
    v = profiles.attr(crop, "rotation_break_years")
    return v if v else None


def break_violations(sequence: List[Tuple[int, str]]) -> List[Dict[str, Any]]:
    """Cases where a crop returns sooner than the sourced minimum number of years without it."""
    out = []
    last_seen: Dict[str, int] = {}
    for year, crop in sorted(sequence):
        if crop in profiles.crop_ids():
            req = break_requirement(crop)
            if req and crop in last_seen:
                gap = year - last_seen[crop] - 1  # years in between without this crop
                if gap < req["min"]:
                    a = profiles.get_crop(crop)["attributes"]["rotation_break_years"]
                    out.append({"crop": crop, "year": year, "years_without": gap, "required_min": req["min"], "required_max": req.get("max"),
                                "source": a["source"], "ref": a["ref"], "verify": a["verify"]})
        last_seen[crop] = year
    return out


def occupancy_year(crop: str, nxt: Optional[str], catch_crop: bool, min_gap: Optional[int] = None) -> List[bool]:
    """
    Occupied days (index doy-1) of one calendar year in which `crop` is harvested.
    A winter-sown successor occupies the field from its own sowing day. A catch crop covers the days from
    harvest + seedbed gap to 31 December (or to the successor's sowing) when that window is long enough.
    """
    w = profiles.load_weights()["feasibility"]
    gap = int(w["min_gap_days_between_harvest_and_sowing"]) if min_gap is None else min_gap
    c = _cal(crop)
    occ = [False] * 365
    h = int(round(c["harvest_median_doy"]))
    if c["winter_sown"]:
        for d in range(1, min(h, 365) + 1):
            occ[d - 1] = True
    else:
        for d in range(int(round(c["sow_median_doy"])), min(h, 365) + 1):
            occ[d - 1] = True
    successor_sow = None
    if nxt and profiles.calendar(nxt):
        cn = _cal(nxt)
        if cn["winter_sown"]:
            successor_sow = int(round(cn["sow_median_doy"]))
            for d in range(successor_sow, 366):
                occ[d - 1] = True
    if catch_crop:
        start = h + gap
        end = (successor_sow - 1) if successor_sow else 365
        if end - start + 1 >= int(w["min_catch_crop_window_days"]):
            for d in range(start, end + 1):
                if 1 <= d <= 365:
                    occ[d - 1] = True
    return occ


def catch_crop_window(crop: str, nxt: Optional[str]) -> int:
    """Length in days of the gap in which a catch crop could stand (0 when too short)."""
    w = profiles.load_weights()["feasibility"]
    base = occupancy_year(crop, nxt, False)
    with_cc = occupancy_year(crop, nxt, True)
    n = sum(1 for a, b in zip(base, with_cc) if b and not a)
    return n if n >= int(w["min_catch_crop_window_days"]) else 0


def month_shares(occ: List[bool]) -> Dict[int, float]:
    """Share of each month's days that are occupied by a crop."""
    out: Dict[int, float] = {}
    i = 0
    for m, n in enumerate(DAYS_IN_MONTH, start=1):
        out[m] = sum(1 for k in range(i, i + n) if occ[k]) / n
        i += n
    return out
