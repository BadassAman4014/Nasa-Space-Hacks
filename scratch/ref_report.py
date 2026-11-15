"""Attach to the user's signed-in Chrome (port 9222) and explore the OneSoil report as a normal user."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

REPORT = "https://app.yield.onesoil.ai/bfbaa48e-1892-4799-9b92-cbaff08ed03a/report?ll=28.383681%3A49.412995&z=14.86"
OUT = Path("scratch/ref")
OUT.mkdir(parents=True, exist_ok=True)
calls = []

with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]
    pg = ctx.new_page()
    pg.set_viewport_size({"width": 1600, "height": 1000})

    def on_resp(r):
        if r.request.resource_type in ("xhr", "fetch") or any(k in r.url for k in ("tile", ".pbf", ".png", "mvt")):
            calls.append({"s": r.status, "t": r.request.resource_type, "ct": r.headers.get("content-type", "")[:35], "u": r.url[:230]})

    pg.on("response", on_resp)
    pg.goto(REPORT, wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(15000)
    print("URL:", pg.url[:160])
    pg.screenshot(path=str(OUT / "10_report_landing.png"))
    print("TEXT:\n", "\n".join(l for l in pg.inner_text("body").splitlines() if l.strip())[:4000])
    ctrls = pg.eval_on_selector_all(
        "button, [role=button], [role=tab], a, [role=menuitem], [role=radio], label",
        "els => els.map(e => (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\\s+/g,' ')).filter(Boolean)",
    )
    print("\nCONTROLS:", json.dumps(sorted(set(ctrls)), ensure_ascii=False)[:3500])
    (OUT / "report_calls.json").write_text(json.dumps(calls, indent=1))
    pg.close()

hosts = {}
for c in calls:
    h = c["u"].split("/")[2]
    hosts[h] = hosts.get(h, 0) + 1
print("\nHOSTS:", hosts)
for c in calls:
    if "onesoil" in c["u"] and c["t"] in ("xhr", "fetch"):
        print("  API", c["s"], c["ct"], c["u"][:200])
