const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://127.0.0.1:5173/fields', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Take a full screenshot
  await page.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_explorer_legend_current.png' });
  
  // Also take a screenshot specifically of the legend
  const legend = page.locator('.z-\\[450\\]');
  if (await legend.count() > 0) {
    await legend.first().screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_legend_element.png' });
  }

  await browser.close();
  console.log('Screenshots captured');
})();
