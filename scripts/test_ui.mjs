import { createServer } from 'vite';
import { chromium } from 'playwright';

async function test() {
  const server = await createServer({
    configFile: './vite.config.ts',
    server: { port: 5190 }
  });
  await server.listen();
  const base = server.resolvedUrls.local[0] || 'http://localhost:5190/';

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    
    // Test 1920x1080 at /
    for (const [vpName, width, height] of [['desktop_1920', 1920, 1080], ['desktop_1366', 1366, 768], ['ipad_768', 768, 1024]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${base}dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const mapStageBox = await page.evaluate(() => {
        const el = document.querySelector('.map-stage');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, x: r.x, y: r.y };
      });

      console.log(`Viewport ${vpName} (${width}x${height}): map-stage =`, mapStageBox);
      await page.screenshot({ path: `scripts/test_${vpName}.png` });
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

test().catch(console.error);
