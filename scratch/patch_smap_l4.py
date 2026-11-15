from pathlib import Path


def edit(path, pairs):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert a in s, (path, a[:80])
        s = s.replace(a, b, 1)
    p.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
    print("patched", path)


# 1. smap_l4: use only the 10:30 UTC snapshot for current + climatology
edit("backend/app/services/nasa/real/smap_l4.py", [
    ("def _have(key: str, start: str, end: str) -> set:\n    return {r[\"obs_time\"][:10] for r in real_store.get_point_values(key, PRODUCT, VAR_RZ, start, end) if r[\"value\"] is not None}",
     "def _snapshots(key: str, start: str, end: str, var: str = VAR_RZ) -> List[Dict[str, Any]]:\n    \"\"\"Stored values at the 10:30 UTC snapshot only, so every day is compared like with like.\"\"\"\n    return [r for r in real_store.get_point_values(key, PRODUCT, var, start, end) if r[\"value\"] is not None and r[\"obs_time\"][11:16] == \"10:30\"]\n\n\ndef _have(key: str, start: str, end: str) -> set:\n    return {r[\"obs_time\"][:10] for r in _snapshots(key, start, end)}"),
    ("    current = [r for r in real_store.get_point_values(key, PRODUCT, VAR_RZ, on.isoformat(), on.isoformat()) if r[\"value\"] is not None]",
     "    current = _snapshots(key, on.isoformat(), on.isoformat())"),
    ("        clim += [r[\"value\"] for r in real_store.get_point_values(key, PRODUCT, VAR_RZ, d.isoformat(), d.isoformat()) if r[\"value\"] is not None]",
     "        clim += [r[\"value\"] for r in _snapshots(key, d.isoformat(), d.isoformat())]"),
])

# 2. risks: moisture status + trend via smap_l4
edit("backend/app/services/field_analytics/health/risks.py", [
    ("from app.services.nasa.real import series as nasa_series\n",
     "from app.services.nasa.real import series as nasa_series\nfrom app.services.nasa.real import smap_l4\n"),
])
p = Path("backend/app/services/field_analytics/health/risks.py")
s = p.read_text(encoding="utf-8")
a = s.index("def moisture_status(")
b = s.index("def moisture_trend(")
new_status = '''def moisture_status(field_id: str) -> Dict[str, Any]:
    field = get_field(field_id)
    lat, lon = centroid(field)
    try:
        latest = smap_l4.latest_available_day()
        pc = smap_l4.percentile_for(lat, lon, latest)
    except smap_l4.SmapUnavailable as exc:
        return unavailable(f"NASA SMAP L4 soil moisture unavailable: {exc}")
    except Exception as exc:  # network / OPeNDAP problems
        return unavailable(f"NASA SMAP L4 soil moisture could not be read ({type(exc).__name__}).")
    p = pc["percentile"]
    cls = "red" if p < RED_PCTL else "yellow" if p < YELLOW_PCTL else "green"
    label = {"red": "Low moisture, possible stress", "yellow": "Moderate moisture", "green": "Sufficient moisture"}[cls]
    return {
        "available": True,
        "class": cls,
        "label": label,
        "percentile": p,
        "rootzone_m3m3": pc["rootzone_m3m3"],
        "date": pc["date"],
        "provenance": MODELLED,
        "source": "NASA SMAP L4 (SPL4SMGP.008) root zone 0-100 cm, 9 km cell",
        "rule": (f"Rank of today's value among {pc['climatology_samples']} values for the same cell within +-15 days of this date in "
                 f"{pc['climatology_years']}: < {RED_PCTL:g} red, {RED_PCTL:g}-{YELLOW_PCTL:g} yellow, >= {YELLOW_PCTL:g} green"),
        "climatology_median_m3m3": pc["climatology_median_m3m3"],
        "scale_note": "The 9 km cell is larger than the field; this is the moisture situation around the field.",
        "source_ref": pc["source_ref"],
    }


'''
s = s[:a] + new_status + s[b:]

# trend: fill the 30 days from OPeNDAP and attach the latest percentile
s = s.replace(
    "    modelled = nasa_series.smap_modelled(lat, lon, start, end)\n    measured = nasa_series.smap_measured(lat, lon, start, end)\n    if not modelled and not measured:",
    "    try:\n        smap_l4.ensure_days(lat, lon, [date.today() - timedelta(days=k) for k in range(days + 4, 3, -1)])\n    except Exception:\n        pass  # fall back to whatever is cached\n    modelled = nasa_series.smap_modelled(lat, lon, start, end)\n    measured = nasa_series.smap_measured(lat, lon, start, end)\n    if not modelled and not measured:",
    1,
)
s = s.replace(
    "    out: Dict[str, Any] = {\n        \"available\": True,\n        \"period\": [start, end],",
    "    if modelled:\n        try:\n            pc = smap_l4.percentile_for(lat, lon, date.fromisoformat(modelled[-1][\"date\"]))\n            modelled[-1][\"rootzone_percentile\"] = pc[\"percentile\"]\n        except Exception:\n            pass\n    out: Dict[str, Any] = {\n        \"available\": True,\n        \"period\": [start, end],",
    1,
)
p.write_text(s, encoding="utf-8")
print("risks patched:", "smap_l4.percentile_for(lat, lon, date.fromisoformat" in s and "def moisture_status" in s)
