const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log('Taking initial dashboard screenshot...');
  await page.screenshot({
    path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_soilgrids_dashboard.png',
  });

  // Check 0-5 cm depth layer
  const btnDepth = page.locator('button:has-text("0–5 cm")');
  if (await btnDepth.count() > 0) {
    console.log('Clicking 0-5 cm depth button...');
    await btnDepth.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_soilgrids_depth_layer.png',
    });
  }

  // Switch to Field 2 (which is 3.58 ha, subpixel)
  const fieldItems = page.locator('.space-y-2 > div.cursor-pointer');
  console.log('Found saved field items:', await fieldItems.count());
  if (await fieldItems.count() > 1) {
    console.log('Selecting second field to check subpixel resolution alert...');
    await fieldItems.nth(1).click();
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_soilgrids_subpixel.png',
    });
  }

  await browser.close();
  console.log('Verification finished successfully!');
})();
