"""Check which OneSoil apps the user's Chrome session is signed in to. Read-only."""
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/ref")
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]
    print("open tabs:", [pg.url[:100] for pg in ctx.pages])
    cookies = ctx.cookies(["https://app.onesoil.ai", "https://app.yield.onesoil.ai", "https://platform-api.onesoil.ai"])
    print("onesoil cookie names:", sorted({c["name"] for c in cookies}))
    for name, url in {"11_main_app": "https://app.onesoil.ai/", "12_yield_root": "https://app.yield.onesoil.ai/"}.items():
        pg = ctx.new_page()
        pg.set_viewport_size({"width": 1600, "height": 1000})
        pg.goto(url, wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_timeout(12000)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        txt = " ".join(pg.inner_text("body").split())
        print(f"== {name}: {pg.url[:130]}\n   {txt[:700]}")
        pg.close()
