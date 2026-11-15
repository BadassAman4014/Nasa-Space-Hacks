"""Shorten farmer-facing wording and add the 'usual range' band data."""
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


# ---------------------------------------------------------------- ndvi_history: one short sentence
p = Path("backend/app/services/field_analytics/health/ndvi_history.py")
s = p.read_text(encoding="utf-8").replace("\r\n", "\n")
a = s.index('        if status == "stable":')
b = s.index("        trend = {")
s = s[:a] + '''        if status == "stable":
            text = f"Spring green-up is steady ({first['season']}-{last['season']})."
        elif status == "improving":
            text = f"Spring green-up is getting stronger ({first['season']}-{last['season']})."
        else:
            text = f"Spring green-up is weaker than in {first['season']}. Check crop, weather and soil."
''' + s[b:]
p.write_text(s, encoding="utf-8", newline="")
print("patched ndvi_history")

# ---------------------------------------------------------------- smap_l4: usual range
edit("backend/app/services/nasa/real/smap_l4.py", [
    ('        "climatology_median_m3m3": round(clim_sorted[len(clim_sorted) // 2], 4),',
     '        "climatology_median_m3m3": round(clim_sorted[len(clim_sorted) // 2], 4),\n'
     '        "climatology_p10_m3m3": round(clim_sorted[int(0.1 * (len(clim_sorted) - 1))], 4),\n'
     '        "climatology_p90_m3m3": round(clim_sorted[int(0.9 * (len(clim_sorted) - 1))], 4),'),
])

# ---------------------------------------------------------------- risks
edit("backend/app/services/field_analytics/health/risks.py", [
    ('        "climatology_median_m3m3": pc["climatology_median_m3m3"],\n',
     '        "climatology_median_m3m3": pc["climatology_median_m3m3"],\n'
     '        "climatology_p10_m3m3": pc["climatology_p10_m3m3"],\n'
     '        "climatology_p90_m3m3": pc["climatology_p90_m3m3"],\n'),
    ('    if modelled:\n        try:\n            pc = smap_l4.percentile_for(lat, lon, date.fromisoformat(modelled[-1]["date"]))\n            modelled[-1]["rootzone_percentile"] = pc["percentile"]\n        except Exception:\n            pass\n',
     '    usual = None\n    if modelled:\n        try:\n            pc = smap_l4.percentile_for(lat, lon, date.fromisoformat(modelled[-1]["date"]))\n            modelled[-1]["rootzone_percentile"] = pc["percentile"]\n'
     '            usual = {"p10": pc["climatology_p10_m3m3"], "median": pc["climatology_median_m3m3"], "p90": pc["climatology_p90_m3m3"],\n'
     '                     "years": pc["climatology_years"], "samples": pc["climatology_samples"], "window": "same date +-15 days"}\n'
     '        except Exception:\n            pass\n'),
    ('        "available": True,\n        "period": [start, end],\n        "modelled": modelled,',
     '        "available": True,\n        "period": [start, end],\n        "usual_range": usual,\n        "modelled": modelled,'),
    ('f"Root zone is at the {last[\'rootzone_percentile\']:.0f}th percentile: drier than usual for this time of year."',
     '"Drier than usual for this time of year."'),
    ('rec = "No action needed. Keep the soil covered over winter."', 'rec = "No action needed. Keep soil covered over winter."'),
    ('rec = "Keep sandy soil covered: sow a winter crop or cover crop soon after harvest, leave stubble, and avoid fine seedbeds in spring."',
     'rec = "Keep the soil covered: cover crop after harvest, leave stubble."'),
    ('rec = "Reduce runoff: till and drill across the slope, keep residues on the surface, and consider a grass strip at the lowest edge."',
     'rec = "Work across the slope, keep residue on top, add a grass strip at the low edge."'),
    ('f"Heavy rain {\'after\' if (rain_since or 0) >= 20 else \'forecast after\'} the N application on {app_date} on free-draining soil: high nitrate leaching risk."',
     'f"Heavy rain {\'since\' if (rain_since or 0) >= 20 else \'due after\'} your N on {app_date}: high leaching risk."'),
    ('f"{fc_rain_3d} mm rain forecast in 3 days. Do not apply nitrogen before it."', 'f"{fc_rain_3d} mm rain due in 3 days. Hold off nitrogen."'),
    ('"DüV blocking period: on arable land no nitrogen fertiliser from the main-crop harvest until 31 January (limited exceptions until 1 October)."',
     '"No nitrogen on arable land until 31 January (DüV blocking period)."'),
])
p = Path("backend/app/services/field_analytics/health/risks.py")
s = p.read_text(encoding="utf-8").replace("\r\n", "\n")
a = s.index('                "text": (f"Topsoil averages')
b = s.index('                "rule": "Open when')
s = s[:a] + '''                "text": (f"Soil {mean_t} °C, {fc_rain_3d} mm rain due: good time to sow a cover crop." if open_ else
                         "Not a sowing window: " + ", ".join(
                             ([f"soil {mean_t} °C, needs 8 °C"] if mean_t < 8 else []) + ([f"{fc_rain_3d} mm rain due"] if (fc_rain_3d or 0) >= 20 else []))),
''' + s[b:]
p.write_text(s, encoding="utf-8", newline="")
print("patched seeding text")

# ---------------------------------------------------------------- service actions
edit("backend/app/services/field_analytics/health/service.py", [
    ('f"Root-zone moisture is at the {moist[\'percentile\']:.0f}th percentile for this time of year. Prioritise water-saving tillage and avoid sowing into dry seedbeds."',
     '"Root zone is below the usual range for this time of year. Avoid sowing into a dry seedbed."'),
    ('"Crop vigour declining over three seasons"', '"Spring green-up is weaker"'),
    ('f"Topsoil pH is about {ph[\'value\']}. Sandy soils lose lime quickly; confirm with a soil test before liming."',
     'f"Topsoil pH about {ph[\'value\']}. Confirm with a soil test before liming."'),
    ('f"Organic carbon is about {soc[\'value\']} %. Cover crops, straw incorporation and manure raise water and nutrient holding."',
     'f"Organic carbon about {soc[\'value\']} %. Cover crops, straw and manure help."'),
    ('f"Latest clear Sentinel-2 scene ({recent[-1][\'date\']}) shows NDVI {recent[-1][\'mean_ndvi\']}. On sandy soil, bare winter fields lose nitrate and topsoil."',
     'f"NDVI {recent[-1][\'mean_ndvi\']} on {recent[-1][\'date\']}. Bare sandy soil loses nitrate and topsoil over winter."'),
    ('"Open-Meteo soil temperature and rain forecast"', '"Open-Meteo forecast"'),
])
