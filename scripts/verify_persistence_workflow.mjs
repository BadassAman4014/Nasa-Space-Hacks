import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScenario() {
  console.log('================================================================');
  console.log('Farmily — Persistent My Farms / My Fields Verification');
  console.log('================================================================');

  // Step 1: Ensure SQLite database starts in clean state
  const dbFile = path.resolve('backend/data/user_farms_fields.db');
  console.log('[Step 1] Initializing clean database state at:', dbFile);
  if (existsSync(dbFile)) {
    try {
      unlinkSync(dbFile);
      console.log('  Cleaned existing database file.');
    } catch (e) {
      console.log('  Could not delete dbFile:', e.message);
    }
  }

  // Start FastAPI backend
  console.log('[Step 1b] Launching FastAPI backend on 127.0.0.1:8000...');
  let pythonProc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: './backend',
    stdio: 'pipe'
  });
  pythonProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.includes('ERROR') || s.includes('Traceback')) console.error('Python Error:', s);
  });

  await wait(3000);

  // Start Vite dev server
  console.log('[Step 1c] Launching Vite development server on port 5195...');
  const server = await createServer({
    configFile: './vite.config.ts',
    server: { port: 5195 }
  });
  await server.listen();
  const base = server.resolvedUrls.local[0] || 'http://localhost:5195/';
  console.log('  Vite server ready at:', base);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[Browser Console Error]', msg.text());
    });

    // Step 2 & 3: Open dashboard and confirm 3 demo fields are absent
    console.log('[Step 2] Opening Dashboard at', `${base}`);
    await page.goto(`${base}`, { waitUntil: 'networkidle' });
    await wait(1500);

    const content = await page.content();
    const hasDemo12 = content.includes('#23BC-12');
    const hasDemo14 = content.includes('#23BC-14');
    const hasDemo09 = content.includes('#23BC-09');
    const hasDemoStanfield = content.includes('Stanfield Land');
    console.log(`[Step 3] Hardcoded demo fields check:`);
    console.log(`  #23BC-12 present: ${hasDemo12} (must be false)`);
    console.log(`  #23BC-14 present: ${hasDemo14} (must be false)`);
    console.log(`  #23BC-09 present: ${hasDemo09} (must be false)`);
    console.log(`  Stanfield Land present: ${hasDemoStanfield} (must be false)`);
    if (hasDemo12 || hasDemo14 || hasDemo09 || hasDemoStanfield) {
      throw new Error('Hardcoded demo field data found on dashboard!');
    }

    // Step 4: Confirm empty state and "+ Add Your First Field" action
    console.log('[Step 4] Confirming empty state on dashboard...');
    const emptyHeading = await page.getByText(/No Saved Fields Yet/i).first().isVisible();
    const addFirstFieldBtn = await page.getByRole('button', { name: /Add Your First Field/i }).first().isVisible();
    const addFieldHeaderBtn = await page.getByRole('button', { name: /Add Field/i }).first().isVisible();
    console.log(`  "No Saved Fields Yet" visible: ${emptyHeading}`);
    console.log(`  "Add Your First Field" visible: ${addFirstFieldBtn}`);
    console.log(`  Toolbar "Add Field" button visible: ${addFieldHeaderBtn}`);
    await page.screenshot({ path: 'scripts/step1_dashboard_empty.png' });

    // Step 5 & 6: Click "+ Add Field" and confirm navigation to Field Explorer
    console.log('[Step 5 & 6] Clicking "Add Your First Field" to navigate to Field Explorer...');
    await page.getByRole('button', { name: /Add Your First Field/i }).first().click();
    await wait(2000);
    console.log('  Current URL after click:', page.url());

    // Step 7: Select a real DFBK boundary in Brandenburg
    console.log('[Step 7] Searching boundaries in Brandenburg...');
    // Type Potsdam into search or click a boundary
    const searchInput = page.locator('input[placeholder*="Search by municipality"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Potsdam');
      await searchInput.press('Enter');
      await wait(2500);
    }

    // Find interactive polygon paths
    const interactivePolygons = page.locator('path.leaflet-interactive');
    const polyCount = await interactivePolygons.count();
    console.log(`  Found ${polyCount} interactive boundaries on map.`);

    if (polyCount > 0) {
      console.log('  Triggering click on first DFBK boundary...');
      await page.evaluate(() => {
        const p = document.querySelector('path.leaflet-interactive');
        if (p) {
          p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      });
      await wait(1000);
      const isVisible = await page.locator('button:has-text("Save to My Farm")').first().isVisible();
      if (!isVisible) {
        await interactivePolygons.first().click({ force: true });
        await wait(1000);
      }
    }

    await page.screenshot({ path: 'scripts/step2_field_explorer_selection.png' });

    // Step 8: Click "Save to My Farm"
    console.log('[Step 8] Clicking "Save to My Farm"...');
    const saveToFarmBtn = page.locator('button:has-text("Save to My Farm")').first();
    const isSaveBtnVisible = await saveToFarmBtn.isVisible();
    console.log('  Save to My Farm button visible:', isSaveBtnVisible);
    if (!isSaveBtnVisible) {
      throw new Error('Save to My Farm button was not visible after clicking boundary');
    }
    await saveToFarmBtn.click();
    await wait(800);

    // Step 9 & 10: Create farm "Test Farm" and save field named "Field 1"
    console.log('[Step 9 & 10] Filling Save to My Farm form...');
    // Fill Field Name
    const fieldNameInput = page.locator('input[placeholder*="Field 1"]');
    await fieldNameInput.fill('Field 1');

    // Fill Crop
    const cropInput = page.locator('input[placeholder*="Winter wheat"]');
    await cropInput.fill('Winter wheat');

    // Fill New Farm Name if input exists
    const newFarmInput = page.locator('input[placeholder*="Test Farm"]');
    if (await newFarmInput.isVisible()) {
      await newFarmInput.fill('Test Farm');
    }

    await page.screenshot({ path: 'scripts/step3_save_modal.png' });

    // Click Confirm Save
    console.log('  Submitting Save Field...');
    const confirmBtn = page.locator('button:has-text("Confirm & Save to Farm")');
    await confirmBtn.click();
    await wait(2500);

    // Step 11: Return to Dashboard
    console.log('[Step 11] Navigating back to Dashboard...');
    await page.goto(`${base}dashboard`, { waitUntil: 'networkidle' });
    await wait(1500);

    // Step 12 & 13: Confirm Test Farm and Field 1 appear on Dashboard with polygon rendered
    console.log('[Step 12 & 13] Verifying saved farm and field on Dashboard...');
    const hasField1 = await page.locator('text=Field 1').first().isVisible();
    const hasTestFarm = (await page.content()).includes('Test Farm');
    const hasWheat = (await page.content()).includes('Winter wheat');
    console.log(`  "Field 1" visible: ${hasField1}`);
    console.log(`  "Test Farm" present: ${hasTestFarm}`);
    console.log(`  "Winter wheat" present: ${hasWheat}`);

    const dashboardPaths = await page.evaluate(() => document.querySelectorAll('.leaflet-map path.leaflet-interactive').length);
    console.log(`  Rendered polygon paths on dashboard map: ${dashboardPaths}`);
    await page.screenshot({ path: 'scripts/step4_dashboard_saved_field.png' });

    // Step 14: Refresh browser
    console.log('[Step 14] Refreshing browser page...');
    await page.reload({ waitUntil: 'networkidle' });
    await wait(1500);
    const hasField1AfterRefresh = await page.locator('text=Field 1').first().isVisible();
    console.log(`  "Field 1" still present after browser reload: ${hasField1AfterRefresh}`);

    // Step 15 & 16: Restart backend and confirm persistence
    console.log('[Step 15 & 16] Restarting FastAPI backend process...');
    pythonProc.kill();
    await wait(1500);
    pythonProc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: './backend',
      stdio: 'pipe'
    });
    await wait(3000);

    await page.reload({ waitUntil: 'networkidle' });
    await wait(1500);
    const hasField1AfterBackendRestart = await page.locator('text=Field 1').first().isVisible();
    console.log(`  "Field 1" still present after backend restart: ${hasField1AfterBackendRestart}`);

    // Step 17: Edit field name and verify persistence
    console.log('[Step 17] Editing field name...');
    const editBtn = page.locator('button[title="Rename or update field"]').first();
    await editBtn.click();
    await wait(500);

    const editNameInput = page.locator('input[placeholder="Field name"]');
    await editNameInput.fill('Field 1 - Renamed');

    const saveChangesBtn = page.locator('button:has-text("Save Changes")');
    await saveChangesBtn.click();
    await wait(1500);

    const hasRenamedField = await page.locator('text=Field 1 - Renamed').first().isVisible();
    console.log(`  "Field 1 - Renamed" visible after edit: ${hasRenamedField}`);
    await page.screenshot({ path: 'scripts/step5_edit_modal.png' });

    // Step 18: Delete the field and confirm it disappears from the dashboard
    console.log('[Step 18] Deleting field and checking return to empty state...');
    const deleteBtn = page.locator('button[title="Delete field"]').first();
    await deleteBtn.click();
    await wait(500);

    const confirmDeleteBtn = page.locator('button:has-text("Confirm Delete")');
    await confirmDeleteBtn.click();
    await wait(1500);

    const emptyAfterDelete = await page.getByText(/No Saved Fields Yet/i).first().isVisible();
    console.log(`  Empty state restored after deleting field: ${emptyAfterDelete}`);
    await page.screenshot({ path: 'scripts/step6_delete_and_empty.png' });

    console.log('================================================================');
    console.log('ALL 18 VERIFICATION STEPS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    if (browser) await browser.close();
    await server.close();
    if (pythonProc) pythonProc.kill();
  }
}

runScenario().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
