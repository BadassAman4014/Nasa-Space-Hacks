from playwright.sync_api import sync_playwright

N = "Official Field Boundaries Unavailable"


def run(b, label, geo=None, perms=None):
    kw = {"viewport": {"width": 1500, "height": 900}}
    if geo:
        kw["geolocation"] = geo
    if perms is not None:
        kw["permissions"] = perms
    ctx = b.new_context(**kw)
    pg = ctx.new_page()
    pg.goto("http://localhost:5173/fields")
    pg.wait_for_timeout(3000)
    pg.get_by_role("button", name="Near Me").click()
    pg.wait_for_timeout(2500)
    body = pg.inner_text("body")
    toast = pg.locator(".toast-body").all_inner_texts()
    print(f"[{label}] notice={N in body} toast={toast}")
    pg.screenshot(path=f"scratch/locate_{label}.png")
    ctx.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    run(b, "cottbus_precise", {"latitude": 51.7588, "longitude": 14.3109, "accuracy": 30}, ["geolocation"])
    run(b, "dresden_coarse", {"latitude": 51.0509, "longitude": 13.7383, "accuracy": 20000}, ["geolocation"])
    run(b, "cottbus_coarse", {"latitude": 51.7588, "longitude": 14.3109, "accuracy": 15000}, ["geolocation"])
    run(b, "denied", None, [])
    b.close()

