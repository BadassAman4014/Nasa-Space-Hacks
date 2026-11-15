"""Read OneSoil help articles on field monitoring and productivity zones (public docs)."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto("https://help.onesoil.ai/en/", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(3000)
    cols = pg.eval_on_selector_all("a[href*='/collections/']", "els=>els.map(e=>e.href)")
    arts = []
    for c in dict.fromkeys(cols):
        if not any(k in c for k in ("monitoring", "pro", "onesoil-pro", "field")):
            continue
        pg.goto(c, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(1500)
        arts += pg.eval_on_selector_all("a[href*='/articles/']", "els=>els.map(e=>[e.innerText.trim().split('\\n')[0], e.href])")
    seen = {}
    for t, h in arts:
        seen.setdefault(h, t)
    print("ARTICLES:")
    for h, t in seen.items():
        print(" -", t[:70], "|", h)
    keys = ("product", "zone", "ndvi", "index", "vegetation", "moisture", "yield", "weather")
    for h, t in list(seen.items()):
        if any(k in (t + h).lower() for k in keys):
            pg.goto(h, wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(1500)
            body = " ".join(pg.inner_text("article" if pg.locator("article").count() else "body").split())
            print(f"\n=== {t}\n{body[:1400]}")
    b.close()
