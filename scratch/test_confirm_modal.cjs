const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Open 3-dot menu and click Manage Farms
  const moreBtn = await page.$('.dash-more');
  if (moreBtn) {
    await moreBtn.click();
    await page.waitForTimeout(300);
    const manageFarmsBtn = await page.getByText(/Manage Farms/i).first();
    if (manageFarmsBtn) {
      await manageFarmsBtn.click();
      await page.waitForTimeout(400);

      // Click the Delete button next to the farm in the modal
      const delBtn = await page.locator('.fixed button:has-text("Delete")').first();
      if (delBtn) {
        await delBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ 
          path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_delete_farm_confirmation_modal.png',
          fullPage: false 
        });
        console.log('Confirmation screenshot captured successfully!');
      } else {
        console.log('Delete button not found');
      }
    }
  }

  await browser.close();
})();
