const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://127.0.0.1:5173...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Check saved field exists
  console.log('Looking for saved fields...');
  const testFieldItem = page.locator('text="Test"').first();
  await testFieldItem.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Clicking Test field...');
  await testFieldItem.click();
  await page.waitForTimeout(1000);

  // Field card should now be open
  const fieldCard = page.locator('.field-card');
  await fieldCard.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Field card opened.');

  // Click NASA Satellites tab
  const nasaTab = fieldCard.locator('button:has-text("NASA Satellites")');
  await nasaTab.click();
  console.log('Clicked NASA Satellites tab.');
  await page.waitForTimeout(1500);

  // SMAP view screenshot
  const smapShot = path.join(ARTIFACT_DIR, 'verify_nasa_smap.png');
  await page.screenshot({ path: smapShot });
  console.log('Saved SMAP screenshot to', smapShot);

  // Click GPM Precipitation tab
  const gpmTab = fieldCard.locator('button:has-text("GPM")').first();
  await gpmTab.waitFor({ state: 'visible', timeout: 5000 });
  await gpmTab.click();
  await page.waitForTimeout(800);
  const gpmShot = path.join(ARTIFACT_DIR, 'verify_nasa_gpm.png');
  await page.screenshot({ path: gpmShot });
  console.log('Saved GPM screenshot to', gpmShot);

  // Click MODIS Vegetation tab
  const modisTab = fieldCard.locator('button:has-text("MODIS")').first();
  await modisTab.waitFor({ state: 'visible', timeout: 5000 });
  await modisTab.click();
  await page.waitForTimeout(800);
  const modisShot = path.join(ARTIFACT_DIR, 'verify_nasa_modis.png');
  await page.screenshot({ path: modisShot });
  console.log('Saved MODIS screenshot to', modisShot);

  // Now click on Field 2 (3.58 ha) to verify subpixel handling
  const field2Btn = page.locator('text="Field 2"').first();
  console.log('Clicking Field 2 to test subpixel...');
  await field2Btn.click();
  await page.waitForTimeout(1000);

  // Click NASA Satellites tab again for Field 2
  await fieldCard.locator('button:has-text("NASA Satellites")').click();
  await page.waitForTimeout(800);

  // Click MODIS tab for Field 2
  const mTab = fieldCard.locator('button:has-text("MODIS")').first();
  await mTab.click();
  await page.waitForTimeout(800);

  const subpixelShot = path.join(ARTIFACT_DIR, 'verify_nasa_subpixel.png');
  await page.screenshot({ path: subpixelShot });
  console.log('Saved subpixel screenshot to', subpixelShot);

  await browser.close();
  console.log('Playwright verification complete!');
}

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
