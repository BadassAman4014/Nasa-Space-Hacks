"""Explore the OneSoil reference report as a normal visitor. No auth bypass."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "https://app.yield.onesoil.ai/bfbaa48e-1892-4799-9b92-cbaff08ed03a/report?ll=28.383681%3A49.412995&z=14.86"
OUT = Path("scratch/ref")
OUT.mkdir(parents=True, exist_ok=True)

api_calls = []

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()

    def on_resp(r):
        ct = r.headers.get("content-type", "")
        if r.request.resource_type in ("xhr", "fetch") or "json" in ct or "image/png" in ct or "protobuf" in ct or "tile" in r.url:
            api_calls.append({"status": r.status, "type": r.request.resource_type, "ct": ct[:40], "url": r.url[:220]})

    pg.on("response", on_resp)
    pg.goto(URL, wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(12000)
    pg.screenshot(path=str(OUT / "01_landing.png"))
    print("TITLE:", pg.title(), "| URL:", pg.url[:150])
    txt = pg.inner_text("body")
    print("BODY TEXT (first 2500):\n", txt[:2500])

    # Collect interactive controls
    ctrls = pg.eval_on_selector_all(
        "button, [role=button], [role=tab], a, select, [role=menuitem]",
        "els => els.map(e => (e.innerText || e.getAttribute('aria-label') || e.title || '').trim()).filter(Boolean).slice(0, 120)",
    )
    print("CONTROLS:", json.dumps(sorted(set(ctrls)))[:3000])
    Path(OUT / "api_calls.json").write_text(json.dumps(api_calls, indent=1))
    b.close()

print("network calls captured:", len(api_calls))
hosts = {}
for c in api_calls:
    h = c["url"].split("/")[2]
    hosts[h] = hosts.get(h, 0) + 1
print("hosts:", hosts)
