"""Walk each tab of the OneSoil demo field and the layer menu. Read-only: no buttons that create/modify data."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/ref")
BASE = "https://app.yield.onesoil.ai/bfbaa48e-1892-4799-9b92-cbaff08ed03a"
calls = []


def panel_text(pg, n=2200):
    return "\n".join(l.strip() for l in pg.inner_text("body").splitlines() if l.strip())


def dump(pg, name, skip_until=None, n=2200):
    pg.screenshot(path=str(OUT / f"{name}.png"))
    t = panel_text(pg)
    if skip_until and skip_until in t:
        t = t[t.index(skip_until):]
    print(f"\n===== {name} | {pg.url[len(BASE):][:90]}\n{t[:n]}")


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]
    pg = ctx.new_page()
    pg.set_viewport_size({"width": 1600, "height": 1000})
    pg.on("response", lambda r: calls.append({"s": r.status, "ct": r.headers.get("content-type", "")[:30], "u": r.url[:260]})
          if ("onesoil" in r.url and r.request.resource_type in ("xhr", "fetch")) else None)

    pg.goto(f"{BASE}/report?ll=28.383681%3A49.412995&z=14.86", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(14000)
    dump(pg, "30_field_report", "Test field #1\n34.90", 3000)

    # Scroll the report panel to reveal more sections
    for i in range(4):
        pg.mouse.move(250, 600)
        pg.mouse.wheel(0, 900)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(OUT / f"31_field_report_scroll{i}.png"))

    # Status tab layer menu (Vegetation NDVI dropdown)
    pg.goto(f"{BASE}/status?ll=28.383681%3A49.412995&z=14.93", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(10000)
    try:
        pg.get_by_text("Vegetation", exact=False).first.click()
        pg.wait_for_timeout(2500)
        dump(pg, "32_layer_menu", "Satellitendaten", 1600)
        pg.keyboard.press("Escape")
    except Exception as e:
        print("layer menu:", type(e).__name__)
    try:
        pg.get_by_text("Legende einblenden").first.click()
        pg.wait_for_timeout(2000)
        pg.screenshot(path=str(OUT / "33_legend.png"))
    except Exception as e:
        print("legend:", type(e).__name__)

    for tab, name in [("Daten", "34_data_tab"), ("Ertragsanalyse", "35_yield_analysis"), ("Ausbringungskarten", "36_vra_maps")]:
        try:
            pg.get_by_text(tab, exact=False).first.click()
            pg.wait_for_timeout(8000)
            dump(pg, name, "Test field #1\n34.90", 2000)
        except Exception as e:
            print(tab, type(e).__name__, str(e)[:120])

    (OUT / "tab_calls.json").write_text(json.dumps(calls, indent=1))
    pg.close()

apis = sorted({c["u"].split("?")[0] for c in calls if "platform-api" in c["u"] or "api" in c["u"].split("/")[2]})
print("\nONESOIL API ENDPOINTS SEEN:")
for a in apis[:60]:
    print("  ", a[:160])
