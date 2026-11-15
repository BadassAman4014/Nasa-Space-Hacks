from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('scratch/audit')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1600, 'height': 1000})
    pg.goto('http://127.0.0.1:5173/analytics', wait_until='domcontentloaded')
    pg.get_by_text('Last rain').wait_for(timeout=300000)
    pg.wait_for_timeout(2000)
    pg.get_by_role('button', name='Status').click()
    pg.wait_for_timeout(6000)
    pg.screenshot(path=str(out / 'status-overview.png'), full_page=True)
    pg.get_by_role('button', name='Data').click()
    pg.wait_for_timeout(5000)
    pg.screenshot(path=str(out / 'data-catalog.png'), full_page=True)
    print('screenshots captured')
    b.close()
