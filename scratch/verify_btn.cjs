const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:5173/dashboard ...');
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check the Add Field button
  const addBtn = page.locator('.dash-add-btn');
  const btnCount = await addBtn.count();
  console.log(`Add Field button count: ${btnCount}`);

  if (btnCount > 0) {
    const btnBox = await addBtn.boundingBox();
    const btnStyles = await addBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const span = el.querySelector('span');
      const spanComputed = span ? window.getComputedStyle(span) : null;
      return {
        btnBg: computed.backgroundColor,
        btnColor: computed.color,
        spanBg: spanComputed ? spanComputed.backgroundColor : null,
        spanColor: spanComputed ? spanComputed.color : null,
        spanText: span ? span.innerText : null,
      };
    });
    console.log('Button & span computed styles:', JSON.stringify(btnStyles, null, 2));
  }

  // Take screenshot of dashboard header and overall view
  const header = page.locator('.dash-head');
  if (await header.count() > 0) {
    await header.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_header_button_fix.png' });
    console.log('Saved header screenshot to verify_header_button_fix.png');
  }

  await page.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_dashboard_after_btn_fix.png' });
  console.log('Saved full dashboard screenshot to verify_dashboard_after_btn_fix.png');

  await browser.close();
})();
