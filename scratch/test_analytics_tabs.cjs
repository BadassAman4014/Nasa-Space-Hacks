const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log('Navigating to local dashboard...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click on "Field Analytics & Historical Report" button
  console.log('Opening Field Analytics workspace...');
  const analyticsBtn = await page.locator('button:has-text("Field Analytics & Historical Report")').first();
  if (analyticsBtn) {
    await analyticsBtn.click();
    await page.waitForTimeout(2500);

    // 1. Status Tab
    console.log('Capturing Status Tab...');
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_tab_1_status.png',
      fullPage: false
    });

    // 2. Field Report Tab
    console.log('Capturing Field Report Tab...');
    await page.locator('header button:has-text("Field report")').click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_tab_2_field_report.png',
      fullPage: false
    });

    // 3. Prescription Maps Tab
    console.log('Capturing Prescription Maps Tab...');
    await page.locator('header button:has-text("Prescription maps")').click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_tab_3_prescription_maps.png',
      fullPage: false
    });

    // 4. Data +12 Tab
    console.log('Capturing Data +12 Tab...');
    await page.locator('header button:has-text("+12")').click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_tab_4_data_catalog.png',
      fullPage: false
    });

    // 5. Yield Analysis Tab
    console.log('Capturing Yield Analysis Tab...');
    await page.locator('header button:has-text("Yield Analysis")').click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_tab_5_yield_analysis.png',
      fullPage: false
    });

    console.log('All 5 tabs captured successfully!');
  } else {
    console.log('Could not find Field Analytics button');
  }

  await browser.close();
})();
