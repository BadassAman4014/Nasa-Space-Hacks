const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://127.0.0.1:5173...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log('Clicking Field Explorer in Sidebar via aria-label...');
  const navBtn = await page.waitForSelector('button[aria-label="Field Explorer"]', { timeout: 10000 });
  await navBtn.click();
  await page.waitForTimeout(2000);

  // Take screenshot of Field Explorer initial state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'debug_explorer_loaded.png') });
  console.log('Screenshot saved to debug_explorer_loaded.png');

  // Find search input in Field Explorer
  console.log('Finding search input...');
  const searchInput = await page.waitForSelector('input[placeholder*="Search"], input[type="text"]', { timeout: 10000 });
  console.log('Filling search query "Umred"...');
  await searchInput.fill('Umred');
  await page.waitForTimeout(1000);

  // Select Umred result from dropdown
  console.log('Looking for Umred in dropdown results...');
  const resultItem = page.locator('text=Umred').first();
  await resultItem.waitFor({ state: 'visible', timeout: 8000 });
  await resultItem.click();
  console.log('Selected Umred!');

  // Wait for "Official Field Boundaries Unavailable" prompt
  console.log('Waiting for "Official Field Boundaries Unavailable" card...');
  await page.waitForSelector('text=Official Field Boundaries Unavailable', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Screenshot 1: Notice and Scan for Fields button
  const ss1 = path.join(ARTIFACT_DIR, 'verify_ai_prompt_umred.png');
  await page.screenshot({ path: ss1 });
  console.log(`Saved screenshot 1 to: ${ss1}`);

  // Click "Scan for Fields"
  console.log('Clicking "Scan for Fields" button...');
  const scanBtn = await page.waitForSelector('button:has-text("Scan for Fields")');
  await scanBtn.click();

  // Wait for CNN inference and predictions
  console.log('Waiting for AI segmentation to complete...');
  await page.waitForSelector('text=Potential Fields Detected', { timeout: 60000 });
  console.log('Inference complete! Predictions loaded.');
  await page.waitForTimeout(2000);

  // Screenshot 2: Predicted purple boundaries on map + review panel + legend
  const ss2 = path.join(ARTIFACT_DIR, 'verify_ai_predictions_map.png');
  await page.screenshot({ path: ss2 });
  console.log(`Saved screenshot 2 to: ${ss2}`);

  // Save Confirmed Fields
  console.log('Clicking "Save Confirmed Fields"...');
  const saveBtn = await page.waitForSelector('button:has-text("Save Confirmed Fields")');
  await saveBtn.click();
  await page.waitForTimeout(1000);

  console.log('Confirming save modal...');
  const confirmBtn = await page.waitForSelector('button:has-text("Confirm & Save to Farm")');
  await confirmBtn.click();
  await page.waitForTimeout(2500);

  // Navigate back to Dashboard
  console.log('Navigating to Dashboard...');
  const dashBtn = await page.waitForSelector('button[aria-label="Dashboard"]');
  await dashBtn.click();
  await page.waitForTimeout(2500);

  // Screenshot 3: Saved field in Dashboard
  const ss3 = path.join(ARTIFACT_DIR, 'verify_dashboard_saved_ai_field.png');
  await page.screenshot({ path: ss3 });
  console.log(`Saved screenshot 3 to: ${ss3}`);

  console.log('ALL AI FIELD DETECTION WORKFLOW STEPS VERIFIED SUCCESSFULLY!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
