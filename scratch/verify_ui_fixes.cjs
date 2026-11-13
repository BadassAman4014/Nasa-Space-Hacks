const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a';

async function main() {
  console.log('Launching browser for UI verification...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const resolutions = [
    { width: 1920, height: 1080, name: '1920x1080' },
    { width: 1440, height: 900, name: '1440x900' },
    { width: 1366, height: 768, name: '1366x768' },
  ];

  // 1. Test Field Explorer at all 3 desktop resolutions
  for (const res of resolutions) {
    console.log(`Testing Field Explorer at ${res.name}...`);
    const page = await browser.newPage({ viewport: { width: res.width, height: res.height } });
    await page.goto('http://127.0.0.1:5173/fields', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Measure map bottom versus viewport bottom
    const mapBounds = await page.evaluate(() => {
      const leafletContainer = document.querySelector('.leaflet-container');
      const rect = leafletContainer ? leafletContainer.getBoundingClientRect() : null;
      const bodyScrollHeight = document.body.scrollHeight;
      const windowHeight = window.innerHeight;
      return {
        mapTop: rect ? rect.top : 0,
        mapBottom: rect ? rect.bottom : 0,
        mapHeight: rect ? rect.height : 0,
        windowHeight,
        bodyScrollHeight,
        hasScrollbar: bodyScrollHeight > windowHeight,
      };
    });

    console.log(`Resolution ${res.name}: Window height=${mapBounds.windowHeight}, Map bottom=${mapBounds.mapBottom}, Gap=${mapBounds.windowHeight - mapBounds.mapBottom}px, Scrollable=${mapBounds.hasScrollbar}`);

    const screenshotPath = path.join(ARTIFACT_DIR, `verify_explorer_${res.name}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to ${screenshotPath}`);

    await page.close();
  }

  // 2. Test Dashboard at 1440x900
  console.log('Testing Dashboard Header and Layout...');
  const dashPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await dashPage.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await dashPage.waitForTimeout(1000);

  // Check that "3 Fields saved" badge is gone
  const savedBadgeCount = await dashPage.locator('.dash-head span:has-text("saved")').count();
  console.log(`"Fields saved" badge in header count: ${savedBadgeCount}`);
  if (savedBadgeCount === 0) {
    console.log('SUCCESS: Separate "Fields saved" badge removed from Dashboard header.');
  } else {
    console.warn(`WARNING: Found ${savedBadgeCount} saved badge(s) in header.`);
  }

  // Check header structure:
  // LEFT: Add Field button & Overflow menu
  const leftAddBtn = await dashPage.locator('.dash-head-left .dash-add-btn').isVisible();
  const leftMoreBtn = await dashPage.locator('.dash-head-left .dash-more').isVisible();
  console.log(`Header Left: Add Field=${leftAddBtn}, More=${leftMoreBtn}`);

  // RIGHT: Export & Bell buttons
  const rightExportBtn = await dashPage.locator('.dash-head-right .dash-export-btn').isVisible();
  const rightBellBtn = await dashPage.locator('.dash-head-right .dash-bell-btn').isVisible();
  console.log(`Header Right: Export=${rightExportBtn}, Bell=${rightBellBtn}`);

  // Check positions of left group and right group
  const headerLayout = await dashPage.evaluate(() => {
    const head = document.querySelector('.dash-head');
    const left = document.querySelector('.dash-head-left');
    const right = document.querySelector('.dash-head-right');
    const headRect = head ? head.getBoundingClientRect() : null;
    const leftRect = left ? left.getBoundingClientRect() : null;
    const rightRect = right ? right.getBoundingClientRect() : null;
    return {
      headWidth: headRect ? headRect.width : 0,
      leftLeft: leftRect ? leftRect.left : 0,
      rightRight: rightRect ? rightRect.right : 0,
      headRight: headRect ? headRect.right : 0,
      diffRight: rightRect && headRect ? Math.abs(headRect.right - rightRect.right) : 0,
    };
  });
  console.log('Header layout alignment metrics:', headerLayout);

  // Check Saved Fields card still shows correct count
  const savedFieldsCardText = await dashPage.locator('.metric-v2 strong').first().innerText();
  console.log(`Saved Fields Card count: ${savedFieldsCardText}`);

  const dashScreenshotPath = path.join(ARTIFACT_DIR, 'verify_dashboard_header_fixed.png');
  await dashPage.screenshot({ path: dashScreenshotPath });
  console.log(`Saved Dashboard screenshot to ${dashScreenshotPath}`);

  await dashPage.close();
  await browser.close();
  console.log('Verification finished successfully!');
}

main().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});

