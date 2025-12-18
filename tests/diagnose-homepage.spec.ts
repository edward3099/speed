import { test, expect } from '@playwright/test'

test('Diagnose homepage rendering', async ({ page }) => {
  const BASE_URL = 'https://speed-silk.vercel.app'
  
  console.log('Navigating to homepage...')
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
  
  console.log('Page loaded. URL:', page.url())
  
  // Wait for React to hydrate
  await page.waitForTimeout(3000)
  
  // Check page title
  const title = await page.title()
  console.log('Page title:', title)
  
  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text())
    }
  })
  
  page.on('pageerror', error => {
    console.log('Page error:', error.message)
  })
  
  // Get all buttons
  const buttons = await page.locator('button').all()
  console.log(`Found ${buttons.length} buttons on the page`)
  
  for (let i = 0; i < Math.min(buttons.length, 10); i++) {
    const text = await buttons[i].textContent().catch(() => '')
    const isVisible = await buttons[i].isVisible().catch(() => false)
    console.log(`Button ${i}: "${text.trim()}" - Visible: ${isVisible}`)
  }
  
  // Try to find start now button
  const startButton = page.getByRole('button', { name: /start now/i }).first()
  const count = await startButton.count()
  console.log(`\nStart Now button - Count: ${count}`)
  
  if (count > 0) {
    const visible = await startButton.isVisible().catch(() => false)
    const text = await startButton.textContent().catch(() => '')
    const boundingBox = await startButton.boundingBox().catch(() => null)
    console.log(`  Visible: ${visible}`)
    console.log(`  Text: "${text?.trim()}"`)
    console.log(`  Bounding box:`, boundingBox)
  } else {
    console.log('  ❌ Start Now button NOT FOUND')
    
    // Check if page has any content
    const bodyText = await page.locator('body').textContent()
    console.log(`\nBody text preview (first 500 chars):`, bodyText?.substring(0, 500))
    
    // Check for any buttons with "start" in text
    const allButtons = await page.locator('button').all()
    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '')
      if (text && /start/i.test(text)) {
        console.log(`Found button with "start": "${text.trim()}"`)
      }
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: 'homepage-diagnostic.png', fullPage: true })
  console.log('\nScreenshot saved to homepage-diagnostic.png')
})












