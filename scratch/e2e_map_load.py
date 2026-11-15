import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    timing = {}
    t0 = time.time()

    def on_resp(r):
        if "/api/field-health/map" in r.url:
            timing["map_api_s"] = round(time.time() - t0, 1)
            timing["map_status"] = r.status
        if "/api/field-health/fields" in r.url and r.url.endswith("/card"):
            timing["card_api_s"] = round(time.time() - t0, 1)

    pg.on("response", on_resp)
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.get_by_text("Last rain").wait_for(timeout=300000)
    pg.wait_for_timeout(1500)
    print("polygons right after card:", pg.locator("path.leaflet-interactive").count())
    for _ in range(40):
        if pg.locator("path.leaflet-interactive").count() > 0:
            break
        pg.wait_for_timeout(1000)
    print("polygons drawn:", pg.locator("path.leaflet-interactive").count(), "after", round(time.time() - t0, 1), "s")
    pg.wait_for_timeout(2000)
    pg.screenshot(path="scratch/e2e/13_map_loaded.png")
    print(timing)
    b.close()
