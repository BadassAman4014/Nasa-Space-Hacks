const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ 
    path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_current_dashboard.png', 
    fullPage: false 
  });

  const moreBtn = await page.$('.dash-more');
  if (moreBtn) {
    await moreBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ 
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_three_dot_farm_menu.png',
      fullPage: false 
    });
  }

  // Also click on "Manage Farms" to test modal
  const manageFarmsBtn = await page.getByText(/Manage Farms/i).first();
  if (manageFarmsBtn) {
    await manageFarmsBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ 
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_manage_farms_modal.png',
      fullPage: false 
    });
  }

  await browser.close();
  console.log('Finished capturing screenshots');
})();
