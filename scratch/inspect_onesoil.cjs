const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  const networkRequests = [];
  page.on('request', req => {
    networkRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType()
    });
  });

  const networkResponses = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('api') || url.includes('onesoil') || url.includes('json') || url.includes('graphql')) {
      try {
        const status = res.status();
        let bodySnippet = '';
        const contentType = res.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const json = await res.json();
          bodySnippet = JSON.stringify(json).slice(0, 500);
        }
        networkResponses.push({ url, status, contentType, bodySnippet });
      } catch (e) {
        // ignore
      }
    }
  });

  console.log('Navigating to target URL...');
  try {
    await page.goto('https://app.yield.onesoil.ai/bfbaa48e-1892-4799-9b92-cbaff08ed03a/status?ll=28.383681%3A49.412995&z=14.86', {
      waitUntil: 'load',
      timeout: 30000
    });
  } catch (err) {
    console.log('Goto error (proceeding to inspect state):', err.message);
  }

  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  await page.screenshot({
    path: 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/onesoil_capture.png',
    fullPage: false
  });

  const pageTitle = await page.title();
  console.log('Page title:', pageTitle);

  // Write collected network data
  fs.writeFileSync(
    'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a/scratch/onesoil_network.json',
    JSON.stringify({ currentUrl, pageTitle, networkResponses, networkRequests: networkRequests.slice(0, 100) }, null, 2)
  );

  console.log('Inspection complete');
  await browser.close();
})();
