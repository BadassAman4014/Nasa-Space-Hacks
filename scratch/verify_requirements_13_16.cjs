const { chromium } = require('playwright');
const path = require('path');

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

  console.log('Navigating to Dashboard (http://127.0.0.1:5173)...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Verify Dashboard has exactly ONE Add Field button
  const addFieldButtons = await page.locator('button:has-text("Add Field")').all();
  console.log(`Found ${addFieldButtons.length} "Add Field" button(s) on Dashboard.`);
  if (addFieldButtons.length !== 1) {
    console.error(`FAILURE: Expected exactly 1 Add Field button, found ${addFieldButtons.length}`);
  } else {
    console.log('SUCCESS: Exactly 1 Add Field button found on Dashboard.');
  }

  // 2. Verify redundant Active field count is removed
  const activeDtCount = await page.locator('dt:has-text("Active")').count();
  console.log(`Redundant <dt>Active</dt> count: ${activeDtCount}`);
  if (activeDtCount > 0) {
    console.warn(`WARNING: Found ${activeDtCount} <dt>Active</dt> elements.`);
  } else {
    console.log('SUCCESS: No redundant Active count in Saved Fields card.');
  }

  // 3. Test Dashboard Search prioritizing saved fields
  console.log('Testing Dashboard Search...');
  const searchInput = page.locator('input[placeholder*="Search saved fields"]');
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  await searchInput.fill('Field');
  await page.waitForTimeout(600);

  // Dropdown should be visible with saved field items
  const dropdownItem = page.locator('text="Saved Field"').first();
  await dropdownItem.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Saved fields found in search dropdown.');

  // Click the first saved field
  await dropdownItem.click();
  await page.waitForTimeout(800);

  // Verify Legend on Dashboard
  const legend = page.locator('text="Map Legend"');
  await legend.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Map Legend visible on Dashboard.');

  // Screenshot 1: Dashboard with Search & Legend
  const dashShot = path.join(ARTIFACT_DIR, 'verify_dashboard_legend_and_search.png');
  await page.screenshot({ path: dashShot });
  console.log('Saved dashboard screenshot to', dashShot);

  // 4. Test Navigation to Field Explorer
  console.log('Navigating to Field Explorer...');
  await page.click('button:has-text("Add Field")');
  await page.waitForTimeout(1500);

  // Verify single search input in Field Explorer
  const explorerSearchInputs = await page.locator('input[placeholder*="Brandenburg municipalities"]').count();
  console.log(`Field Explorer search input count: ${explorerSearchInputs}`);
  if (explorerSearchInputs !== 1) {
    console.error(`FAILURE: Expected exactly 1 search input in Field Explorer, found ${explorerSearchInputs}`);
  } else {
    console.log('SUCCESS: Exactly 1 search input in Field Explorer.');
  }

  // Test Field Explorer geographic search
  const explorerSearch = page.locator('input[placeholder*="Brandenburg municipalities"]');
  await explorerSearch.fill('Havelland');
  await page.waitForTimeout(600);

  const regionItem = page.locator('text="Havelland"').first();
  await regionItem.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Havelland geographic region found in search dropdown.');
  await regionItem.click();
  await page.waitForTimeout(1500);

  // Verify Field Explorer Legend
  const explorerLegend = page.locator('text="Map Legend"');
  await explorerLegend.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Map Legend visible on Field Explorer.');

  // Screenshot 2: Field Explorer with Unified Toolbar & Legend
  const explorerShot = path.join(ARTIFACT_DIR, 'verify_explorer_unified_toolbar_legend.png');
  await page.screenshot({ path: explorerShot });
  console.log('Saved Field Explorer screenshot to', explorerShot);

  // 5. Test Locate Me in Field Explorer
  console.log('Testing Locate Me...');
  const locateMeBtn = page.locator('button:has-text("Near Me")');
  if (await locateMeBtn.isVisible()) {
    // Grant geolocation permissions
    const context = page.context();
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 52.415, longitude: 13.045 });

    await locateMeBtn.click();
    await page.waitForTimeout(1500);
    console.log('Locate Me triggered.');

    const locateShot = path.join(ARTIFACT_DIR, 'verify_locate_me_blue_marker.png');
    await page.screenshot({ path: locateShot });
    console.log('Saved Locate Me screenshot to', locateShot);
  }

  await browser.close();
  console.log('Playwright verification script finished successfully!');
}

main().catch(err => {
  console.error('Playwright verification error:', err);
  process.exit(1);
});

