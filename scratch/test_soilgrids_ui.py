import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        
        print("Navigating to http://127.0.0.1:5173/ ...")
        await page.goto("http://127.0.0.1:5173/", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        
        # Take screenshot of dashboard with SoilGrids card
        print("Taking initial dashboard screenshot...")
        await page.screenshot(path=r"C:\Users\amanr\.gemini\antigravity\brain\938078f3-cb21-4464-9a2c-f9892162b99a\verify_soilgrids_dashboard.png")
        
        # Click on 0-5 cm depth layer
        print("Looking for depth buttons...")
        btn_0_5 = page.locator("button:has-text('0–5 cm')")
        if await btn_0_5.count() > 0:
            await btn_0_5.first.click()
            await page.wait_for_timeout(1000)
            print("Taking screenshot with depth layer selected...")
            await page.screenshot(path=r"C:\Users\amanr\.gemini\antigravity\brain\938078f3-cb21-4464-9a2c-f9892162b99a\verify_soilgrids_depth_layer.png")
            
        # Switch to subpixel field if available
        fields = page.locator("div[class*='cursor-pointer']")
        if await fields.count() > 1:
            print("Selecting second field (subpixel field)...")
            await fields.nth(1).click()
            await page.wait_for_timeout(1500)
            print("Taking screenshot of subpixel field...")
            await page.screenshot(path=r"C:\Users\amanr\.gemini\antigravity\brain\938078f3-cb21-4464-9a2c-f9892162b99a\verify_soilgrids_subpixel.png")
            
        await browser.close()
        print("Verification complete!")

asyncio.run(run())

