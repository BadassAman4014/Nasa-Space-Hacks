import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.get_by_text("Last rain").wait_for(timeout=300000)
    pg.wait_for_timeout(1500)
    for label in ("Moisture", "Nitrogen", "Leaching"):
        pg.get_by_role("button", name=label, exact=True).click()
        pg.wait_for_timeout(8000)
    pg.screenshot(path="scratch/e2e/07_map_simple.png")
    pg.get_by_role("button", name="About Soil moisture").click()
    pg.wait_for_timeout(500)
    pg.screenshot(path="scratch/e2e/08_info_popover.png")
    pg.get_by_role("button", name="Field health", exact=True).click()
    pg.get_by_text("What to do").wait_for(timeout=300000)
    pg.wait_for_timeout(6000)
    pg.screenshot(path="scratch/e2e/09_health_simple.png", full_page=True)
    print("errors:", errs[:3])
    b.close()
