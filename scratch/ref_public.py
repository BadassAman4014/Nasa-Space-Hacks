"""Look at OneSoil's public pages (no login) for the same features."""
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/ref")
OUT.mkdir(parents=True, exist_ok=True)
pages = {
    "02_public_map": "https://map.onesoil.ai/",
    "03_yield_product": "https://onesoil.ai/en/yield",
    "04_app_product": "https://onesoil.ai/en/app",
}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1600, "height": 1000})
    for name, url in pages.items():
        pg = ctx.new_page()
        try:
            pg.goto(url, wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(8000)
            pg.screenshot(path=str(OUT / f"{name}.png"))
            t = " ".join(pg.inner_text("body").split())
            print(f"== {name} | {pg.url[:90]} | {pg.title()}")
            print("  ", t[:1800])
        except Exception as e:
            print(f"== {name} ERR {type(e).__name__}: {str(e)[:150]}")
        pg.close()
    b.close()
