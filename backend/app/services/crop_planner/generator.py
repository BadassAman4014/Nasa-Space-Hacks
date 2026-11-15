"""
Rotation generator: Strategy A (the farmer's history carried forward), B (resilience and soil building)
and C (diversified), each over five years, under the legal and agronomic filters.

Hard filters: GLÖZ 7 (policy_rules.json), calendar feasibility between consecutive crops, and the sourced
minimum rest period for grain legumes. Soft: the sourced rest period for wheat (penalty).
Income is not part of the objective: no real price source is wired in.
"""

from __future__ import annotations

from itertools import product
from typing import Any, Dict, List, Optional, Tuple

from app.services.crop_planner import profiles, rotation, scoring
from app.services.policy import cap, dbe, gloez

N_YEARS = 5


class PlanInputError(ValueError):
    def __init__(self, problems: List[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


# ------------------------------------------------------------------------------------------ history
def validate_history(history: List[Dict[str, Any]]) -> List[Tuple[int, str]]:
    problems = []
    if len(history) < 2:
        problems.append("Enter the main crop of at least the last 2 years.")
    known = set(profiles.crop_ids()) | {"fallow_or_grass", "other"}
    seq = []
    for h in history:
        if h.get("crop") not in known:
            problems.append(f"Unknown crop '{h.get('crop')}' in {h.get('year')}.")
        else:
            seq.append((int(h["year"]), h["crop"]))
    seq.sort()
    years = [y for y, _ in seq]
    if years and years != list(range(years[0], years[-1] + 1)):
        problems.append("The crop history must cover consecutive years.")
    if problems:
        raise PlanInputError(problems)
    return seq


def extend_history(hist: List[Tuple[int, str]], n: int = N_YEARS) -> List[str]:
    """Strategy A: repeat the observed cycle forward."""
    crops = [c for _, c in hist]
    return [crops[i % len(crops)] for i in range(n)]


# ------------------------------------------------------------------------------------------ evaluation
class Evaluator:
    def __init__(self, ctx: Dict[str, Any], hist: List[Tuple[int, str]]):
        self.ctx = ctx
        self.hist = hist
        self.last_hist = hist[-1][1]
        self.start_year = hist[-1][0] + 1
        self._cache: Dict[Tuple[Optional[str], str, Optional[str], bool], Dict[str, Any]] = {}
        W = ctx["weights"]["rotation_terms"]
        self.t = W

    def year(self, prev: Optional[str], crop: str, nxt: Optional[str], catch: bool) -> Dict[str, Any]:
        k = (prev, crop, nxt, catch)
        if k not in self._cache:
            self._cache[k] = scoring.score_year(self.ctx, prev, crop, nxt, catch)
        return self._cache[k]

    def best_year(self, prev: Optional[str], crop: str, nxt: Optional[str], allow_catch: bool) -> Dict[str, Any]:
        base = self.year(prev, crop, nxt, False)
        if not allow_catch or rotation.catch_crop_window(crop, nxt) == 0:
            return base
        with_cc = self.year(prev, crop, nxt, True)
        if (with_cc["overall"] or -1) > (base["overall"] or -1):
            return with_cc
        return base

    def sequence(self, seq: List[str], allow_catch: bool) -> List[Dict[str, Any]]:
        out = []
        for i, c in enumerate(seq):
            prev = seq[i - 1] if i > 0 else self.last_hist
            nxt = seq[i + 1] if i + 1 < len(seq) else None
            out.append(self.best_year(prev, c, nxt, allow_catch) if c in profiles.eligible_crop_ids() else self.year(prev, c, nxt, False))
        return out

    # ---- rotation-level terms
    def rotation_terms(self, seq: List[str]) -> Dict[str, Any]:
        fams = {profiles.family(c) for c in seq if profiles.family(c)}
        diversity = len(fams) / len(seq)
        legumes = sum(1 for c in seq if c in profiles.crop_ids() and profiles.is_legume(c))
        full = [(self.start_year + i, c) for i, c in enumerate(seq)]
        viol = rotation.break_violations(self.hist + full)
        # only violations that happen inside the plan count against it
        viol = [v for v in viol if v["year"] >= self.start_year]
        dw = self.t["pest_priority_diversity_weight"] if self.ctx.get("priority") == "break_pest_cycles" else self.t["diversity_weight"]
        bonus = 100.0 * (dw * diversity + (self.t["legume_in_rotation_bonus"] if legumes else 0.0) - self.t["break_violation_penalty_per_case"] * len(viol))
        return {"botanical_families": sorted(fams), "diversity_share": round(diversity, 2), "grain_legume_years": legumes, "break_violations": viol, "bonus_points": round(bonus, 1)}

    def objective(self, seq: List[str], allow_catch: bool) -> Tuple[float, List[Dict[str, Any]], Dict[str, Any]]:
        ys = self.sequence(seq, allow_catch)
        vals = [y["overall"] for y in ys]
        if any(v is None for v in vals):
            return float("-inf"), ys, self.rotation_terms(seq)
        rt = self.rotation_terms(seq)
        return sum(vals) / len(vals) + rt["bonus_points"], ys, rt


# ------------------------------------------------------------------------------------------ legal pruning
def _legal_ok(hist: List[Tuple[int, str]], start_year: int, seq: List[str]) -> bool:
    entries = [{"year": y, "crop": c} for y, c in hist] + [{"year": start_year + i, "crop": c} for i, c in enumerate(seq)]
    # Only windows that include a planned year count; the farmer's past cannot be changed.
    if any(w["years"][-1] >= start_year for w in gloez.validate_sequence(entries)["violations"]):
        return False
    full = [(start_year + i, c) for i, c in enumerate(seq)]
    for v in rotation.break_violations(list(hist) + full):
        # Hard: grain legumes (sourced rest period) and any crop directly after itself. Soft: longer rest periods (wheat).
        if v["year"] >= start_year and (profiles.is_legume(v["crop"]) or v["years_without"] < 1):
            return False
    return True


def candidate_sequences(ev: Evaluator, crops: List[str], n: int = N_YEARS) -> List[List[str]]:
    """All sequences that pass the hard filters, built year by year so dead ends are cut early."""
    out: List[List[str]] = []
    hist = ev.hist

    def feasible_from(prev: str, c: str) -> bool:
        if prev not in profiles.crop_ids() or not profiles.calendar(prev) or not profiles.calendar(c):
            return True
        return rotation.feasible_succession(prev, c)["ok"]

    def rec(seq: List[str]):
        if len(seq) == n:
            out.append(list(seq))
            return
        prev = seq[-1] if seq else ev.last_hist
        for c in crops:
            if not feasible_from(prev, c):
                continue
            trial = seq + [c]
            if not _legal_ok(hist, ev.start_year, trial):
                continue
            seq.append(c)
            rec(seq)
            seq.pop()

    rec([])
    return out


# ------------------------------------------------------------------------------------------ assemble
def _strategy_axes(years: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out = {}
    for a in scoring.AXES:
        scores = [y["axes"][a]["score"] for y in years]
        if any(s is None for s in scores):
            reasons = sorted({y["axes"][a]["reason"] for y in years if y["axes"][a]["score"] is None and y["axes"][a]["reason"]})
            out[a] = {"axis": a, "label": scoring.AXIS_LABEL[a], "score": None, "status": "not_scored", "reason": "; ".join(reasons) or "input unavailable"}
        else:
            partial = [y["axes"][a]["reason"] for y in years if y["axes"][a]["status"] == "partial"]
            out[a] = {"axis": a, "label": scoring.AXIS_LABEL[a], "score": round(sum(scores) / len(scores), 1), "status": "partial" if partial else "scored",
                      "reason": partial[0] if partial else None}
    return out


def _strategy_dict(sid: str, name: str, kind: str, seq: List[str], ys: List[Dict[str, Any]], rt: Dict[str, Any], ev: Evaluator, farm_fields: List[Dict[str, Any]], field_id: str) -> Dict[str, Any]:
    entries = [{"year": ev.start_year + i, "crop": c} for i, c in enumerate(seq)]
    hist_entries = [{"year": y, "crop": c} for y, c in ev.hist]
    legal = gloez.validate_sequence(hist_entries + entries)
    dbes = dbe.plan(entries, previous_crop_before_first=ev.last_hist)
    years_out = []
    for i, (e, y, d) in enumerate(zip(entries, ys, dbes)):
        crop = e["crop"]
        prev = seq[i - 1] if i else ev.last_hist
        fe = None
        if prev in profiles.crop_ids() and crop in profiles.crop_ids() and profiles.calendar(prev) and profiles.calendar(crop):
            fe = rotation.feasible_succession(prev, crop)
        farm = [{"field_id": f["field_id"], "area_ha": f["area_ha"], "crop": (e["crop"] if f["field_id"] == field_id else f["crops_by_year"].get(e["year"]))} for f in farm_fields]
        years_out.append({
            "year": e["year"], "crop": crop, "crop_label": profiles.label(crop), "crop_label_de": profiles.label(crop, "de"),
            "scored": crop in profiles.eligible_crop_ids(), "catch_crop_after": bool(y["catch_crop"]),
            "axes": {a: {"score": y["axes"][a]["score"], "status": y["axes"][a]["status"]} for a in scoring.AXES},
            "year_overall": y["overall"], "previous_crop": prev, "feasibility_from_previous": fe,
            "dbe": d, "cap": {"field": cap.field_contribution(crop), "farm": cap.evaluate_farm(farm, e["year"])},
            "factors": {a: y["axes"][a]["factors"] for a in scoring.AXES},
        })
    axes = _strategy_axes(ys)
    return {"id": sid, "name": name, "kind": kind, "years": years_out, "axes": axes, "rotation_terms": rt, "legal": {"gloez7": legal, "break_violations": rt["break_violations"]},
            "overall": None}


def generate(ctx: Dict[str, Any], history: List[Dict[str, Any]], farm_fields: List[Dict[str, Any]], field_id: str) -> Dict[str, Any]:
    hist = validate_history(history)
    if not ctx.get("priority"):
        raise PlanInputError(["Choose your top priority."])
    ev = Evaluator(ctx, hist)
    eligible = profiles.eligible_crop_ids()

    # --- Strategy A
    seq_a = extend_history(hist)
    _, ys_a, rt_a = ev.objective(seq_a, False)
    strat_a = _strategy_dict("A", "Current path", "current_path", seq_a, ys_a, rt_a, ev, farm_fields, field_id)

    # --- candidates
    cands = candidate_sequences(ev, eligible)
    scored = []
    for s in cands:
        v, ys, rt = ev.objective(s, True)
        if v != float("-inf"):
            scored.append((v, s, ys, rt))
    out: Dict[str, Any] = {"start_year": ev.start_year, "years": [ev.start_year + i for i in range(N_YEARS)], "history": [{"year": y, "crop": c, "crop_label": profiles.label(c), "crop_label_de": profiles.label(c, "de")} for y, c in hist],
                           "candidates_examined": len(cands), "candidates_scored": len(scored), "eligible_crops": eligible,
                           "excluded_crops": [{"id": c, "missing": profiles.get_crop(c)["scoring"]["missing"]} for c in profiles.crop_ids() if c not in eligible]}
    strategies = [strat_a]
    if not scored:
        out["alternatives_note"] = ("No rotation could be scored from real data for this field. See the axis reasons." if cands else
                                    "No five-year rotation passes the legal and calendar filters from this crop history.")
        out["strategies"] = strategies
        out.update(apply_overall(strategies, ctx))
        return out

    scored.sort(key=lambda t: (-t[0], t[1]))
    v_b, seq_b, ys_b, rt_b = scored[0]
    strategies.append(_strategy_dict("B", "Resilience and soil building", "resilience", seq_b, ys_b, rt_b, ev, farm_fields, field_id))

    def diversity_key(t):
        v, s, ys, rt = t
        return (-len(set(s)), -len(rt["botanical_families"]), -v, s)

    pool = [t for t in scored if t[1] != seq_b and t[1] != seq_a]
    if pool:
        pool.sort(key=diversity_key)
        _, seq_c, ys_c, rt_c = pool[0]
        strategies.append(_strategy_dict("C", "Diversified rotation", "diversified", seq_c, ys_c, rt_c, ev, farm_fields, field_id))
    else:
        out["alternatives_note"] = "Only one rotation passes the filters; no third strategy exists."
    out["strategies"] = strategies
    out.update(apply_overall(strategies, ctx))
    return out


def apply_overall(strategies: List[Dict[str, Any]], ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Overall scores use only the axes scored for every strategy, so the strategies are comparable."""
    common = [a for a in scoring.AXES if all(s["axes"][a]["score"] is not None for s in strategies)]
    for s in strategies:
        s["overall"] = None
        s["overall_axes"] = common
        if common:
            ov = scoring.overall(ctx, s["axes"], restrict=common)
            if ov["overall"] is not None:
                s["overall"] = round(max(0.0, min(100.0, ov["overall"] + s["rotation_terms"]["bonus_points"])), 1)
    return {"common_axes": common, "excluded_axes": [a for a in scoring.AXES if a not in common]}
