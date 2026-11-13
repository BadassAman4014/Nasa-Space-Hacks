const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log('Navigating to dashboard...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log('Opening field 2 (Winter wheat 3.58 ha) via second sparkle button in sidebar...');
  const sparkleBtns = page.locator('button[title="Open Field Analytics Workspace"]');
  if (await sparkleBtns.count() >= 2) {
    await sparkleBtns.nth(1).click();
    console.log('Clicked Winter wheat field, capturing initial batch state (newest first)...');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_batch_progressive_wheat_initial.png',
      fullPage: false
    });

    console.log('Waiting for progressive batches to stream...');
    await page.waitForTimeout(2500);

    console.log('Capturing completed progressive sync state with scroll to graph...');
    await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto') || document.documentElement;
      container.scrollTop = 700;
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_batch_progressive_wheat_graph.png',
      fullPage: false
    });

    console.log('Wheat progressive batch test finished successfully!');
  }

  await browser.close();
})();
