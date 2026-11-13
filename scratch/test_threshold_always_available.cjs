const { chromium } = require('playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/amanr/.gemini/antigravity/brain/938078f3-cb21-4464-9a2c-f9892162b99a';

async function run() {
  console.log('Launching browser for threshold selector verification...');
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
  await page.waitForTimeout(2000);

  console.log('Navigating to Field Explorer...');
  const navBtn = await page.waitForSelector('button[aria-label="Field Explorer"]');
  await navBtn.click();
  await page.waitForTimeout(2000);

  console.log('Searching for Umred...');
  const searchInput = await page.waitForSelector('input[placeholder*="Search"]');
  await searchInput.fill('Umred');
  await page.waitForTimeout(1000);

  const resultItem = page.locator('text=Umred').first();
  await resultItem.click();
  await page.waitForTimeout(2000);

  // Click Scan for Fields
  console.log('Clicking "Scan for Fields"...');
  const scanBtn = await page.waitForSelector('button:has-text("Scan for Fields")');
  await scanBtn.click();

  // Wait for predictions to load
  console.log('Waiting for AI segmentation...');
  await page.waitForSelector('text=Potential Fields Detected', { timeout: 60000 });
  console.log('Fields loaded!');
  await page.waitForTimeout(1500);

  // Move threshold slider to 0.85 (85%) so NO fields meet the threshold
  console.log('Adjusting threshold slider to 0.85 to simulate 0 fields found...');
  const slider = page.locator('input[type="range"][max="0.85"]').first();
  await slider.fill('0.85');
  await page.waitForTimeout(1500);

  // Verify that the Review Panel and threshold selector are STILL VISIBLE!
  console.log('Verifying threshold selector remains visible when 0 fields are found...');
  await page.waitForSelector('text=No Fields at Current Threshold', { timeout: 5000 });
  await page.waitForSelector('text=0 fields meet 85% threshold', { timeout: 5000 });
  await page.waitForSelector('input[type="range"]', { timeout: 5000 });
  console.log('SUCCESS: Threshold selector is still available when 0 fields are found!');

  // Capture Screenshot 1: Zero fields state with threshold selector still open and active
  const ss1 = path.join(ARTIFACT_DIR, 'verify_threshold_zero_fields.png');
  await page.screenshot({ path: ss1 });
  console.log(`Saved screenshot 1 to: ${ss1}`);

  // Test recovery: Click "Lower Threshold to 20%"
  console.log('Clicking "Lower Threshold to 20%" button to recover fields...');
  const lowerBtn = page.locator('button:has-text("Lower Threshold to 20%")');
  await lowerBtn.click();
  await page.waitForTimeout(1500);

  // Verify fields are back!
  await page.waitForSelector('text=Potential Fields Detected', { timeout: 5000 });
  console.log('SUCCESS: Fields immediately recovered upon lowering threshold!');

  // Capture Screenshot 2: Recovered fields
  const ss2 = path.join(ARTIFACT_DIR, 'verify_threshold_recovered_fields.png');
  await page.screenshot({ path: ss2 });
  console.log(`Saved screenshot 2 to: ${ss2}`);

  console.log('ALL THRESHOLD SELECTOR VERIFICATIONS PASSED SUCCESSFULLY!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR in test script:', err);
  process.exit(1);
});
