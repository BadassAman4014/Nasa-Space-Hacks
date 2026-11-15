"""Read-only discovery of the Field Analytics tabs: visible text, controls, and API calls."""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path("scratch/audit")
(OUT / "api").mkdir(parents=True, exist_ok=True)
calls = []


def slim(o, depth=0):
    """Shrink big payloads (base64 images, huge grids) so structure stays readable."""
    if isinstance(o, str):
        return o[:60] + f"...[{len(o)} chars]" if len(o) > 160 else o
    if isinstance(o, list):
        if len(o) > 6 and depth > 0:
            return [slim(x, depth + 1) for x in o[:3]] + [f"...[{len(o)} items]"]
        return [slim(x, depth + 1) for x in o]
    if isinstance(o, dict):
        return {k: slim(v, depth + 1) for k, v in o.items()}
    return o


def on_response(r):
    if "/api/" in r.url and r.request.resource_type in ("fetch", "xhr"):
        entry = {"status": r.status, "method": r.request.method, "url": r.url.split("/api", 1)[1]}
        try:
            entry["body"] = slim(r.json())
        except Exception:
            entry["body"] = None
        calls.append(entry)


def dump_controls(pg, label):
    ctrls = pg.eval_on_selector_all(
        "button, select, input, textarea, [role=tab], summary, a[href]",
        """els => els.filter(e => e.offsetParent !== null).map(e => ({
            tag: e.tagName.toLowerCase(), type: e.type || '', text: (e.innerText || e.value || e.getAttribute('aria-label') || e.title || e.placeholder || '').trim().replace(/\\s+/g,' ').slice(0,60)
        }))""",
    )
    print(f"\n#### {label}: {len(ctrls)} visible controls")
    seen = set()
    for c in ctrls:
        k = (c["tag"], c["type"], c["text"])
        if k not in seen and c["text"]:
            seen.add(k)
            print("  ", c["tag"], c["type"], "|", c["text"])


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("response", on_response)
    pg.goto("http://127.0.0.1:5173/analytics", wait_until="domcontentloaded")
    pg.get_by_text("Last rain").wait_for(timeout=300000)
    pg.wait_for_timeout(2000)

    for tab in ("Status", "Data"):
        pg.get_by_role("button", name=tab).first.click()
        pg.wait_for_timeout(9000)
        txt = "\n".join(l.strip() for l in pg.inner_text("body").splitlines() if l.strip())
        i = txt.find("Field 2")
        print(f"\n######## TAB: {tab} (page height {pg.evaluate('document.documentElement.scrollHeight')} px)")
        print(txt[:6000])
        dump_controls(pg, tab)

    (OUT / "api_calls_discovery.json").write_text(json.dumps(calls, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\nAPI calls captured:", len(calls))
    for c in calls:
        print(" ", c["status"], c["method"], c["url"][:110])
    b.close()
