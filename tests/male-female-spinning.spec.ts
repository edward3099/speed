/**
 * Playwright Test: Male and Female Spinning
 * 
 * Tests the complete flow of creating new male and female users, 
 * having them complete onboarding, and then spinning to match
 */

import { test, expect } from '@playwright/test'

test.describe('Male and Female Spinning Test - New Users', () => {
  test('should create new users, complete onboarding, and match when both spin', async ({ browser }) => {
    test.setTimeout(180000) // 3 minutes
    
    // Generate unique test emails
    const timestamp = Date.now()
    const maleEmail = `test-male-${timestamp}@test.com`
    const femaleEmail = `test-female-${timestamp}@test.com`
    const password = 'TestPassword123!'
    
    // Create two browser contexts (simulating 2 different users)
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    try {
      console.log('🧪 Starting test: Creating new users and testing match')
      console.log(`📧 Male email: ${maleEmail}`)
      console.log(`📧 Female email: ${femaleEmail}`)
      
      // Step 1: Create and onboard User 1 (Male)
      console.log('👤 Creating male user...')
      await page1.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
      await page1.waitForTimeout(2000)
      
      // Click "Start Now" button to open modal
      const startButton1 = page1.getByRole('button', { name: /start now/i }).first()
      await expect(startButton1).toBeVisible({ timeout: 15000 })
      await startButton1.click()
      await page1.waitForTimeout(1000)
      
      // Switch to sign up tab if needed (default might be sign in)
      const signUpTab = page1.getByRole('button', { name: /sign up/i }).first()
      if (await signUpTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await signUpTab.click()
        await page1.waitForTimeout(500)
      }
      
      // Fill signup form - email
      const emailInput1 = page1.locator('input[type="email"]').first()
      await expect(emailInput1).toBeVisible({ timeout: 10000 })
      await emailInput1.fill(maleEmail)
      await page1.waitForTimeout(300)
      
      // Fill password
      const passwordInputs1 = page1.locator('input[type="password"]')
      const passwordCount1 = await passwordInputs1.count()
      
      if (passwordCount1 >= 1) {
        await passwordInputs1.nth(0).fill(password)
        await page1.waitForTimeout(300)
      }
      
      // Fill retype password if it exists
      if (passwordCount1 >= 2) {
        await passwordInputs1.nth(1).fill(password)
        await page1.waitForTimeout(300)
      }
      
      // Click continue/submit
      const continueButton1 = page1.getByRole('button', { name: /continue/i }).first()
      await expect(continueButton1).toBeVisible({ timeout: 10000 })
      await continueButton1.click()
      await page1.waitForTimeout(2000)
      
      // Complete onboarding for male user
      console.log('✅ Male user created, completing onboarding...')
      
      // Onboarding Step 1: Name
      const nameInput1 = page1.locator('input[placeholder*="name" i], input[type="text"]').first()
      if (await nameInput1.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput1.fill('Test Male User')
        const nextButton1 = page1.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton1.click()
        await page1.waitForTimeout(1000)
      }
      
      // Onboarding Step 2: Gender (select male)
      const maleButton1 = page1.locator('button:has-text("male"), button:has-text("Male")').first()
      if (await maleButton1.isVisible({ timeout: 5000 }).catch(() => false)) {
        await maleButton1.click()
        await page1.waitForTimeout(500)
        const nextButton1 = page1.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton1.click()
        await page1.waitForTimeout(1000)
      }
      
      // Onboarding Step 3: Age (skip or use default)
      const ageSlider1 = page1.locator('input[type="range"]').first()
      if (await ageSlider1.isVisible({ timeout: 3000 }).catch(() => false)) {
        const nextButton1 = page1.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton1.click()
        await page1.waitForTimeout(1000)
      }
      
      // Onboarding Step 4: Bio
      const bioInput1 = page1.locator('textarea').first()
      if (await bioInput1.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bioInput1.fill('Test bio for male user')
        const nextButton1 = page1.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton1.click()
        await page1.waitForTimeout(1000)
      }
      
      // Onboarding Step 5: Photo (skip)
      const skipPhoto1 = page1.locator('button:has-text("skip"), button:has-text("Skip")').first()
      if (await skipPhoto1.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipPhoto1.click()
        await page1.waitForTimeout(1000)
      }
      
      // Navigate to /spin after onboarding (may not auto-redirect)
      const currentUrl1 = page1.url()
      console.log(`Current URL after onboarding: ${currentUrl1}`)
      if (!currentUrl1.includes('/spin')) {
        await page1.goto('http://localhost:3000/spin', { waitUntil: 'networkidle' })
        await page1.waitForTimeout(2000)
      }
      console.log('✅ Male user onboarding completed')
      
      // Step 2: Create and onboard User 2 (Female) - same process
      console.log('👤 Creating female user...')
      await page2.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
      await page2.waitForTimeout(2000)
      
      const startButton2 = page2.getByRole('button', { name: /start now/i }).first()
      await expect(startButton2).toBeVisible({ timeout: 15000 })
      await startButton2.click()
      await page2.waitForTimeout(1000)
      
      const signUpTab2 = page2.getByRole('button', { name: /sign up/i }).first()
      if (await signUpTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await signUpTab2.click()
        await page2.waitForTimeout(500)
      }
      
      const emailInput2 = page2.locator('input[type="email"]').first()
      await expect(emailInput2).toBeVisible({ timeout: 10000 })
      await emailInput2.fill(femaleEmail)
      await page2.waitForTimeout(300)
      
      const passwordInputs2 = page2.locator('input[type="password"]')
      const passwordCount2 = await passwordInputs2.count()
      
      if (passwordCount2 >= 1) {
        await passwordInputs2.nth(0).fill(password)
        await page2.waitForTimeout(300)
      }
      
      if (passwordCount2 >= 2) {
        await passwordInputs2.nth(1).fill(password)
        await page2.waitForTimeout(300)
      }
      
      const continueButton2 = page2.getByRole('button', { name: /continue/i }).first()
      await expect(continueButton2).toBeVisible({ timeout: 10000 })
      await continueButton2.click()
      await page2.waitForTimeout(2000)
      
      console.log('✅ Female user created, completing onboarding...')
      
      // Onboarding for female user
      const nameInput2 = page2.locator('input[placeholder*="name" i], input[type="text"]').first()
      if (await nameInput2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput2.fill('Test Female User')
        const nextButton2 = page2.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton2.click()
        await page2.waitForTimeout(1000)
      }
      
      // Select female
      const femaleButton2 = page2.locator('button:has-text("female"), button:has-text("Female")').first()
      if (await femaleButton2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await femaleButton2.click()
        await page2.waitForTimeout(500)
        const nextButton2 = page2.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton2.click()
        await page2.waitForTimeout(1000)
      }
      
      // Age
      const ageSlider2 = page2.locator('input[type="range"]').first()
      if (await ageSlider2.isVisible({ timeout: 3000 }).catch(() => false)) {
        const nextButton2 = page2.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton2.click()
        await page2.waitForTimeout(1000)
      }
      
      // Bio
      const bioInput2 = page2.locator('textarea').first()
      if (await bioInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bioInput2.fill('Test bio for female user')
        const nextButton2 = page2.locator('button:has-text("next"), button:has-text("Next"), button:has-text("continue")').first()
        await nextButton2.click()
        await page2.waitForTimeout(1000)
      }
      
      // Photo
      const skipPhoto2 = page2.locator('button:has-text("skip"), button:has-text("Skip")').first()
      if (await skipPhoto2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipPhoto2.click()
        await page2.waitForTimeout(1000)
      }
      
      const currentUrl2 = page2.url()
      console.log(`Current URL after onboarding: ${currentUrl2}`)
      if (!currentUrl2.includes('/spin')) {
        await page2.goto('http://localhost:3000/spin', { waitUntil: 'networkidle' })
        await page2.waitForTimeout(2000)
      }
      console.log('✅ Female user onboarding completed')
      
      // Step 3: Ensure both users are on /spin page (navigate if needed)
      if (!page1.url().includes('/spin')) {
        await page1.goto('http://localhost:3000/spin', { waitUntil: 'networkidle' })
        await page1.waitForTimeout(2000)
      }
      if (!page2.url().includes('/spin')) {
        await page2.goto('http://localhost:3000/spin', { waitUntil: 'networkidle' })
        await page2.waitForTimeout(2000)
      }
      
      // Verify both are on spin page
      expect(page1.url()).toContain('/spin')
      expect(page2.url()).toContain('/spin')
      
      await page1.waitForTimeout(2000)
      await page2.waitForTimeout(2000)
      
      // Step 4: User 1 (Male) - Click "Start Spin"
      console.log('🎰 Male user clicking Start Spin...')
      const spinButton1 = page1.locator('button:has-text("start spin"), button:has-text("Start Spin"), [role="button"]:has-text("spin")').first()
      await expect(spinButton1).toBeVisible({ timeout: 10000 })
      await spinButton1.click()
      
      // Wait for User 1 to join queue
      await page1.waitForTimeout(1000)
      console.log('✅ Male user joined queue')
      
      // Step 5: User 2 (Female) - Click "Start Spin"
      console.log('🎰 Female user clicking Start Spin...')
      const spinButton2 = page2.locator('button:has-text("start spin"), button:has-text("Start Spin"), [role="button"]:has-text("spin")').first()
      await expect(spinButton2).toBeVisible({ timeout: 10000 })
      await spinButton2.click()
      
      // Step 6: Wait for both users to be redirected
      console.log('⏳ Waiting for match...')
      
      // Both should redirect to /spinning first
      await Promise.all([
        page1.waitForURL(/\/spinning/, { timeout: 10000 }),
        page2.waitForURL(/\/spinning/, { timeout: 10000 })
      ])
      console.log('✅ Both users are on /spinning page')
      
      // Step 7: Wait for match - both should redirect to /voting-window
      console.log('⏳ Waiting for match to complete and redirect to voting window...')
      
      await Promise.all([
        page1.waitForURL(/\/voting-window/, { timeout: 15000 }),
        page2.waitForURL(/\/voting-window/, { timeout: 15000 })
      ])
      
      console.log('✅ MATCH SUCCESS! Both users redirected to /voting-window')
      
      // Step 8: Verify both pages show match information
      await expect(page1.locator('body')).toContainText(/match|partner|vote/i, { timeout: 5000 })
      await expect(page2.locator('body')).toContainText(/match|partner|vote/i, { timeout: 5000 })
      
      console.log('✅ Both pages show match/voting information')
      
      // Verify final URLs
      expect(page1.url()).toContain('/voting-window')
      expect(page2.url()).toContain('/voting-window')
      
      console.log('🎉 TEST PASSED: New male and female users matched successfully!')
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      await context1.close()
      await context2.close()
    }
  })
})
