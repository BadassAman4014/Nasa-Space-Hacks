import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5173/ ...');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 8000 });
  } catch (e) {
    console.log('Navigation event:', e.message);
  }

  await page.screenshot({ path: 'desktop-screenshot.png' });
  console.log('Saved desktop-screenshot.png');

  const inspection = await page.evaluate(() => {
    function getBox(sel) {
      const el = document.querySelector(sel);
      if (!el) return { selector: sel, found: false };
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        selector: sel,
        found: true,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        width: style.width,
        height: style.height,
        gridTemplateColumns: style.gridTemplateColumns,
        flexDirection: style.flexDirection,
        order: style.order,
        overflow: style.overflow,
        zIndex: style.zIndex
      };
    }

    const gridChildren = [];
    const grid = document.querySelector('.dashboard-grid');
    if (grid) {
      for (const child of grid.children) {
        const rect = child.getBoundingClientRect();
        gridChildren.push({
          tagName: child.tagName,
          className: child.className,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          computedDisplay: window.getComputedStyle(child).display
        });
      }
    }

    return {
      windowSize: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      appShell: getBox('.app-shell'),
      sidebar: getBox('.sidebar-v2'),
      workspace: getBox('.workspace'),
      pageContent: getBox('.page-content'),
      dashboardGrid: getBox('.dashboard-grid'),
      dashPanel: getBox('.dash-panel'),
      mapStage: getBox('.map-stage'),
      leafletMap: getBox('.leaflet-map'),
      gridChildren
    };
  });

  console.log('INSPECTION RESULT:\n', JSON.stringify(inspection, null, 2));

  await browser.close();
}

main().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});

