"""Farmer workflow through the real UI: Field Map, overlays, field card, links, Field Health."""
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/e2e")
OUT.mkdir(parents=True, exist_ok=True)
FIELD = "field-2bf954950c"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    errors, api = [], []
    pg.on("pageerror", lambda e: errors.append(str(e)[:200]))
    pg.on("response", lambda r: api.append((r.status, r.url.split("/api")[-1][:90])) if "/api/field-health" in r.url else None)

    # Set the selected field the app opens with, then open Field Analytics.
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.wait_for_timeout(1500)
    t0 = time.time()
    pg.get_by_role("button", name="Field Map").first.wait_for(timeout=180000)
    print("workspace ready in", round(time.time() - t0, 1), "s")
    pg.get_by_text("Since rain").wait_for(timeout=120000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "01_field_map.png"))
    body = pg.inner_text("body")
    for k in ("Soil moisture", "Since rain", "Soil health", "Nitrogen need", "Weather", "Field Health", "Crop Planner", "Documentation"):
        print(f"card shows '{k}':", k in body)

    for label in ("Soil moisture gradient", "Nitrogen risk zones", "Leaching risk"):
        pg.get_by_label(label).check()
        pg.wait_for_timeout(9000)
    pg.screenshot(path=str(OUT / "02_overlays_on.png"))
    print("image overlays drawn:", pg.locator(".leaflet-image-layer").count())

    # Field Health tab via the card link
    pg.get_by_role("button", name="Field Health").last.click()
    pg.get_by_text("Vegetation trend, 3 years").wait_for(timeout=120000)
    pg.wait_for_timeout(5000)
    pg.screenshot(path=str(OUT / "03_field_health.png"), full_page=True)
    body = pg.inner_text("body")
    for k in ("Recommended actions", "Vegetation trend, 3 years", "Soil moisture trend, 30 days", "Yield (productivity) zones", "Erosion risk", "Leaching risk", "Nitrogen status this season", "Seeding window"):
        print(f"health shows '{k}':", k in body)

    # Back to map, test Crop Planner link navigation
    pg.get_by_role("button", name="Field Map").first.click()
    pg.wait_for_timeout(3000)
    pg.get_by_role("button", name="Crop Planner").click()
    pg.wait_for_timeout(2000)
    print("Crop Planner link ->", pg.url)
    pg.go_back()
    pg.wait_for_timeout(1500)

    print("API calls:", json.dumps(api[:30]))
    print("page errors:", errors[:5])
    b.close()
