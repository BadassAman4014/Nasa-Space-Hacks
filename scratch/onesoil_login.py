"""
Open a visible browser so the user can sign in to OneSoil themselves (Google sign-in).
The session is kept in a local profile folder; no credentials are read or stored by this script.
Waits up to 10 minutes for the report page to load after login.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

REPORT = "https://app.yield.onesoil.ai/bfbaa48e-1892-4799-9b92-cbaff08ed03a/report?ll=28.383681%3A49.412995&z=14.86"
PROFILE = Path("scratch/onesoil_profile").resolve()
PROFILE.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        str(PROFILE),
        headless=False,
        viewport={"width": 1500, "height": 950},
        args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"],
    )
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto(REPORT, wait_until="domcontentloaded", timeout=90000)
    print("Browser open. Please sign in with Google in that window.", flush=True)
    try:
        pg.wait_for_url("**app.yield.onesoil.ai/**/report**", timeout=600000)
        pg.wait_for_timeout(8000)
        print("LOGGED IN:", pg.url[:120], flush=True)
    except Exception as e:
        print("Timed out waiting for login:", type(e).__name__, flush=True)
    ctx.close()
