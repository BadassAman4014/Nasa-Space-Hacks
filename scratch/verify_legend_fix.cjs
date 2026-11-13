const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to Field Explorer...');
  await page.goto('http://127.0.0.1:5173/fields', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Take screenshot of Field Explorer with the new legend
  await page.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_explorer_legend_fixed.png' });
  console.log('Saved verify_explorer_legend_fixed.png');

  // Screenshot specifically of the legend
  const legend = page.locator('.z-\\[450\\]');
  if (await legend.count() > 0) {
    await legend.first().screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_legend_element_fixed.png' });
    console.log('Saved verify_legend_element_fixed.png');
  }

  // Also test Dashboard legend
  console.log('Navigating to Dashboard...');
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_dashboard_legend_fixed.png' });
  console.log('Saved verify_dashboard_legend_fixed.png');

  await browser.close();
  console.log('Playwright legend verification complete.');
})();
