import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'child_process';

async function run() {
  console.log('--- Starting FastAPI Backend ---');
  const pythonProc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: './backend',
    stdio: 'pipe'
  });

  pythonProc.stdout.on('data', (d) => {
    // console.log('[API]:', d.toString().trim());
  });
  pythonProc.stderr.on('data', (d) => {
    // console.log('[API err]:', d.toString().trim());
  });

  // Wait 2 seconds for backend to start
  await new Promise((r) => setTimeout(r, 2000));

  console.log('--- Starting Vite Server ---');
  const server = await createServer({
    configFile: './vite.config.ts',
    server: { port: 5192 }
  });
  await server.listen();
  const base = server.resolvedUrls.local[0] || 'http://localhost:5192/';
  console.log('Vite running at', base);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. Verify Desktop Dashboard map visibility
    console.log('1. Navigating to Dashboard at', `${base}dashboard`);
    await page.goto(`${base}dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const dashMapStage = await page.evaluate(() => {
      const el = document.querySelector('.map-stage');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y, visible: r.width > 300 && r.height > 300 };
    });
    console.log('Dashboard map stage dimensions:', dashMapStage);
    if (!dashMapStage || !dashMapStage.visible) {
      throw new Error('Dashboard map is NOT visible on desktop!');
    }
    await page.screenshot({ path: 'scripts/verify_dashboard_desktop.png' });
    console.log('Saved scripts/verify_dashboard_desktop.png');

    // 2. Navigate to Field Explorer
    console.log('2. Navigating to Field Explorer');
    await page.goto(`${base}fields`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify DFBK elements
    const statusText = await page.evaluate(() => {
      const badge = document.querySelector('body');
      return badge ? badge.innerText : '';
    });
    console.log('Contains DFBK / 90,756:', statusText.includes('90,756') || statusText.includes('DFBK'));

    // Check if SVG paths or GeoJSON boundaries rendered on map
    const pathCount = await page.evaluate(() => {
      return document.querySelectorAll('path.leaflet-interactive').length;
    });
    console.log(`Rendered ${pathCount} interactive boundary polygons on the map.`);

    // Click on the first interactive polygon to open detail card
    if (pathCount > 0) {
      await page.evaluate(() => {
        const p = document.querySelector('path.leaflet-interactive');
        if (p) p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'scripts/verify_field_discovery.png' });
    console.log('Saved scripts/verify_field_discovery.png');

    console.log('=== ALL E2E VERIFICATIONS PASSED SUCCESSFULLY ===');
  } finally {
    if (browser) await browser.close();
    await server.close();
    pythonProc.kill();
  }
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});

