const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForSelector('.dash-head', { timeout: 10000 });
  
  const html = await page.$eval('.dash-head', el => el.outerHTML);
  console.log('=== DASH-HEAD HTML ===\n', html);

  const btnBox = await page.$eval('.dash-add-btn', el => {
    const s = window.getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, w: el.offsetWidth, h: el.offsetHeight, innerHTML: el.innerHTML };
  });
  console.log('=== BTN COMPUTED ===\n', btnBox);

  const spanBox = await page.$eval('.dash-add-btn span', el => {
    const s = window.getComputedStyle(el);
    return { 
      bg: s.backgroundColor, 
      color: s.color, 
      display: s.display, 
      w: el.offsetWidth, 
      h: el.offsetHeight, 
      text: el.innerText,
      boxShadow: s.boxShadow,
      borderRadius: s.borderRadius
    };
  });
  console.log('=== SPAN COMPUTED ===\n', spanBox);

  // Take a screenshot of the header
  const headerHandle = await page.$('.dash-head');
  await headerHandle.screenshot({ path: 'scratch/header_screenshot.png' });
  console.log('Screenshot saved to scratch/header_screenshot.png');

  await browser.close();
})().catch(err => console.error(err));
