"""Interact with OneSoil public map near Cottbus, and find the public product pages."""
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/ref")
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    pg.goto("https://map.onesoil.ai/2024/#13/51.78/14.30", wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(9000)
    pg.screenshot(path=str(OUT / "05_publicmap_cottbus.png"))
    # click near map centre to select a field
    pg.mouse.click(820, 520)
    pg.wait_for_timeout(5000)
    pg.screenshot(path=str(OUT / "06_publicmap_field_click.png"))
    t = " ".join(pg.inner_text("body").split())
    print("AFTER CLICK:", t[:1500])
    sel = pg.eval_on_selector_all("select, [role=listbox], [role=option], button", "els=>els.map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,80)")
    print("CONTROLS:", sorted(set(sel))[:80])

    pg2 = ctx.new_page()
    pg2.goto("https://onesoil.ai/en", wait_until="domcontentloaded", timeout=60000)
    pg2.wait_for_timeout(6000)
    links = pg2.eval_on_selector_all("a[href]", "els=>els.map(e=>[e.innerText.trim().slice(0,40), e.href]).filter(x=>x[0])")
    print("SITE LINKS:", [l for l in links if "onesoil.ai" in l[1]][:50])
    b.close()
