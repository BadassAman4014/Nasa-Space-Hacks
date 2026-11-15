from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.get_by_text("Last rain").wait_for(timeout=300000)
    pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Moisture", exact=True).click()
    pg.wait_for_timeout(9000)
    pg.get_by_role("button", name="Nitrogen", exact=True).click()
    pg.wait_for_timeout(2000)
    print("image layers after switching Moisture -> Nitrogen:", pg.locator(".leaflet-image-layer").count(), "(expect 1)")
    pg.screenshot(path="scratch/e2e/10_map_single.png")
    pg.get_by_role("button", name="Field health", exact=True).click()
    pg.get_by_text("What to do").wait_for(timeout=300000)
    pg.wait_for_timeout(5000)
    pg.screenshot(path="scratch/e2e/11_health_final.png", full_page=True)
    print("errors:", errs[:3])
    b.close()
