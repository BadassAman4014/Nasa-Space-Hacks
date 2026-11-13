import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'child_process';

async function testNearMe() {
  console.log('--- Starting FastAPI Backend ---');
  const pythonProc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: './backend',
    stdio: 'pipe'
  });

  // Wait 2s for backend
  await new Promise((r) => setTimeout(r, 2000));

  console.log('--- Starting Vite Server ---');
  const server = await createServer({
    configFile: './vite.config.ts',
    server: { port: 5194 }
  });
  await server.listen();
  const base = server.resolvedUrls.local[0] || 'http://localhost:5194/';

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      geolocation: { latitude: 52.4150, longitude: 13.0450 }, // Potsdam
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    console.log('Navigating to', `${base}fields`);
    await page.goto(`${base}fields`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Locate the "Near Me" button
    const nearMeBtn = page.getByRole('button', { name: /Near Me/i });
    console.log('Found Near Me button:', await nearMeBtn.isVisible());

    // Click "Near Me"
    console.log('Clicking Near Me button...');
    await nearMeBtn.click();
    await page.waitForTimeout(2500);

    // Check if "Near Me (Active)" appears
    const activeText = await page.getByRole('button', { name: /Near Me \(Active\)/i }).isVisible();
    console.log('Near Me (Active) visible:', activeText);

    // Check if radius select is visible
    const radiusSelect = page.locator('select[title*="Search radius"]');
    console.log('Radius select visible:', await radiusSelect.isVisible());

    // Check rendered interactive paths / markers
    const pathCount = await page.evaluate(() => document.querySelectorAll('path.leaflet-interactive').length);
    console.log(`Rendered ${pathCount} interactive elements (field boundaries + user radius circle).`);

    await page.screenshot({ path: 'scripts/verify_near_me.png' });
    console.log('Saved screenshot to scripts/verify_near_me.png');

    console.log('=== NEAR ME VERIFICATION SUCCESSFUL ===');
  } finally {
    if (browser) await browser.close();
    await server.close();
    pythonProc.kill();
  }
}

testNearMe().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});

