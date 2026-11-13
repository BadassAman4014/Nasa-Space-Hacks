import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        
        print("Navigating to http://127.0.0.1:5173/...")
        await page.goto("http://127.0.0.1:5173/", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        
        # Click on field item to open details or analytics
        field_card = page.locator("text=Field 1").first
        if await field_card.count() > 0:
            print("Clicking Field 1...")
            await field_card.click()
            await page.wait_for_timeout(1000)
            
            # Click Field Analytics or open workspace
            analytics_btn = page.locator("button:has-text('Field Analytics'), button:has-text('Open Analytics'), button:has-text('Analytics')").first
            if await analytics_btn.count() > 0:
                print("Clicking Analytics button...")
                await analytics_btn.click()
                await page.wait_for_timeout(2000)
        
        # Click on Data tab (or Data +12)
        data_tab = page.locator("button:has-text('Data')").first
        if await data_tab.count() > 0:
            print("Clicking Data tab...")
            await data_tab.click()
            await page.wait_for_timeout(2000)
            
            # Screenshot Data Catalog with NASA Challenge Datasets
            await page.screenshot(path="verify_nasa_challenge_hub.png")
            print("Saved verify_nasa_challenge_hub.png")
            
            # Test clicking 'Query for Field' on first card
            query_btn = page.locator("button:has-text('Query for Field')").first
            if await query_btn.count() > 0:
                print("Clicking Query for Field...")
                await query_btn.click()
                await page.wait_for_timeout(3000)
                await page.screenshot(path="verify_nasa_challenge_query_modal.png")
                print("Saved verify_nasa_challenge_query_modal.png")
        
        await browser.close()

asyncio.run(run())
