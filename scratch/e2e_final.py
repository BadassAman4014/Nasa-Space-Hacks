"""Final browser pass for both fields: map colours, card, overlays, health tab."""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs, bad = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.on("response", lambda r: bad.append((r.status, r.url[-70:])) if r.status >= 400 and "/api/" in r.url else None)
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    t = time.time()
    pg.get_by_text("Since rain").wait_for(timeout=300000)
    pg.wait_for_timeout(2000)
    print("Field Map ready in", round(time.time() - t), "s")
    pg.screenshot(path="scratch/e2e/05_map_final.png")
    txt = pg.inner_text("body")
    print("moisture text shown:", "Drier than" in txt, "| 'still being extracted' shown:", "still being extracted" in txt)
    pg.get_by_role("button", name="Field Health").first.click()
    pg.get_by_text("Vegetation trend, 3 years").wait_for(timeout=300000)
    pg.wait_for_timeout(5000)
    pg.screenshot(path="scratch/e2e/06_health_final.png", full_page=True)
    txt = pg.inner_text("body")
    print("moisture trend chart shown:", "Root zone 0-100 cm, SMAP L4 model" in txt, "| still extracting:", "still being extracted" in txt)
    print("errors:", errs[:3], "| HTTP>=400:", bad[:5])
    b.close()
