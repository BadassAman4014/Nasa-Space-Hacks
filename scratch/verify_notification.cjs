const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to http://127.0.0.1:5173/dashboard ...');
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click the notification bell
  const bellBtn = page.locator('.dash-bell-btn');
  console.log('Bell button count:', await bellBtn.count());
  await bellBtn.click();
  console.log('Clicked bell button');

  // Wait for the toast to appear
  const toast = page.locator('.toast');
  await toast.waitFor({ state: 'visible', timeout: 5000 });

  // Measure bounding box and position of toast
  const toastMetrics = await page.evaluate(() => {
    const el = document.querySelector('.toast');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      offsetFromRight: window.innerWidth - rect.right,
      offsetFromTop: rect.top,
      text: el.innerText.replace(/\n/g, ' '),
      zIndex: style.zIndex,
    };
  });

  console.log('Toast Metrics:', JSON.stringify(toastMetrics, null, 2));

  // Capture full screenshot showing the notification at top right
  await page.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_notification_top_right.png' });
  console.log('Saved verify_notification_top_right.png');

  // Also take a screenshot of just the top right area
  await toast.screenshot({ path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/verify_toast_element.png' });
  console.log('Saved verify_toast_element.png');

  await browser.close();
})();
