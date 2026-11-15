"""Explore the OneSoil demo field report and its tabs/layers in the user's signed-in Chrome. Read-only."""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/ref")
calls = []


def dump(pg, name, n=1800):
    pg.screenshot(path=str(OUT / f"{name}.png"))
    txt = "\n".join(l.strip() for l in pg.inner_text("body").splitlines() if l.strip())
    print(f"\n===== {name} | {pg.url[:140]}\n{txt[:n]}")


with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = b.contexts[0]
    pg = ctx.new_page()
    pg.set_viewport_size({"width": 1600, "height": 1000})
    pg.on("response", lambda r: calls.append({"s": r.status, "ct": r.headers.get("content-type", "")[:30], "u": r.url[:240]})
          if ("onesoil" in r.url and r.request.resource_type in ("xhr", "fetch")) or "tile" in r.url else None)
    pg.goto("https://app.yield.onesoil.ai/", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_timeout(10000)
    pg.get_by_text("Test field #1").first.click()
    pg.wait_for_timeout(10000)
    dump(pg, "20_demo_field_selected")

    ctrls = pg.eval_on_selector_all(
        "button, [role=button], [role=tab], a, [role=menuitem], [role=radio]",
        "els => els.map(e => [ (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\\s+/g,' '), e.getAttribute('href') || '' ]).filter(x => x[0])",
    )
    print("\nCONTROLS:", json.dumps(ctrls, ensure_ascii=False)[:4000])
    (OUT / "demo_controls.json").write_text(json.dumps(ctrls, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "demo_calls.json").write_text(json.dumps(calls, indent=1))
    print("\nCURRENT URL:", pg.url)
