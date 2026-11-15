"""Exercise the new Field Health endpoints through FastAPI and print a compact summary."""
import json
import time

from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)


def show(label, r, keys=None):
    body = r.json()
    if keys and isinstance(body, dict):
        body = {k: body.get(k) for k in keys}
    txt = json.dumps(body, ensure_ascii=False, default=str)
    print(f"\n== {label}: HTTP {r.status_code}\n{txt[:1400]}")


t = time.time()
r = c.get("/api/field-health/map")
print("map:", r.status_code, round(time.time() - t, 1), "s")
fields = r.json()
for f in fields:
    m = f["moisture"]
    print("  ", f["name"], "| moisture:", m.get("class") or m.get("reason"), "| days since rain:", f["days_since_rain"], "as of", f["rain_as_of"])
fid = fields[0]["field_id"]

t = time.time()
r = c.get(f"/api/field-health/fields/{fid}/card")
card = r.json()
print("\ncard:", r.status_code, round(time.time() - t, 1), "s")
print("  soil:", card["soil_health"].get("score"), card["soil_health"].get("label"), [(x["name"], x["value"], x["score"]) for x in card["soil_health"].get("components", [])])
print("  nitrogen:", card["nitrogen"].get("available"), card["nitrogen"].get("reason"))
w = card["weather"]
print("  weather:", w.get("current", {}).get("temperature_c"), [(d["day_name"], d["temp_min_c"], d["temp_max_c"], d["precipitation_mm"]) for d in w.get("forecast_3d", [])])
print("  rain:", {k: card["rain"].get(k) for k in ("days_since_rain", "rain_7d_mm", "rain_30d_mm", "rain_365d_mm", "heavy_days_365d", "as_of")})

for kind in ("moisture", "nitrogen", "leaching"):
    t = time.time()
    r = c.get(f"/api/field-health/fields/{fid}/overlay/{kind}")
    b = r.json()
    lay = b.get("layer") or {}
    print(f"\noverlay {kind}: HTTP {r.status_code} {round(time.time() - t, 1)} s | available={b.get('available')} | {lay.get('title') or b.get('level')} {lay.get('date', '')} | reason={b.get('reason') or lay.get('reason')} | note={lay.get('note') or b.get('note')}")

t = time.time()
r = c.get(f"/api/field-health/fields/{fid}/trend")
tr = r.json()
print("\ntrend:", r.status_code, round(time.time() - t, 1), "s")
v = tr["vegetation_trend"]
print("  vegetation:", v.get("observation_count"), v.get("period"), v.get("season_peaks"), (v.get("trend") or {}).get("status"), (v.get("trend") or {}).get("explanation"))
z = tr["yield_zones"]
print("  zones:", z.get("available"), z.get("reason"), z.get("seasons_used"), [(q["zone"], q["area_ha"], q["percent_of_field"]) for q in z.get("zones", [])], "bounds", z.get("bounds"))
e = tr["erosion"]
print("  erosion:", e.get("level"), e.get("dominant"), [(f["factor"], f["value"]) for f in e.get("factors", [])], "|", e.get("recommendation"))
l = tr["leaching"]
print("  leaching:", l.get("level"), l.get("vulnerability"), [a["text"][:80] for a in l.get("alerts", [])], "| seeding:", (l.get("seeding_window") or {}).get("text"))
m = tr["moisture_trend"]
print("  moisture trend:", m.get("available"), m.get("reason"), len(m.get("modelled", [])), "modelled days", len([x for x in m.get("measured", []) if x["used"]]), "measured used")
print("  actions:", [(a["priority"], a["title"]) for a in tr["actions"]])

r = c.put(f"/api/field-health/fields/{fid}/inputs", json={"crop": "winter_rye", "yield_target": 60, "previous_crop": "cereals", "nmin_kg_ha": 30})
print("\nput inputs:", r.status_code)
r = c.get(f"/api/field-health/fields/{fid}/card?refresh=true")
n = r.json()["nitrogen"]
print("nitrogen after inputs:", n.get("estimate_kg_n_ha"), [(x["label"], x["kg_n_ha"]) for x in n.get("lines", [])])
r = c.put(f"/api/field-health/fields/{fid}/inputs", json={"crop": "banana"})
print("invalid crop ->", r.status_code, r.json().get("detail"))
r = c.put(f"/api/field-health/fields/{fid}/inputs", json={})
print("reset inputs ->", r.status_code)
r = c.get("/api/field-health/fields/does-not-exist/card")
print("unknown field ->", r.status_code)
