from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.get_by_text("Last rain").wait_for(timeout=300000)
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    for gone in ("Field report", "Prescription maps", "Yield Analysis", "Prescription map", "Soil sampling map", "Upload data"):
        print(f"'{gone}' still visible:", gone in body)
    for kept in ("Field Map", "Field Health", "Status", "Data"):
        print(f"'{kept}' tab present:", pg.get_by_role("button", name=kept, exact=False).count() > 0)
    pg.screenshot(path="scratch/e2e/12_tabs_clean.png")
    for tab in ("Status", "Data", "Field Health", "Field Map"):
        pg.get_by_role("button", name=tab).first.click()
        pg.wait_for_timeout(4000)
        print(f"opened {tab}: ok")
    print("errors:", errs[:3])
    b.close()
