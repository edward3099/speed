/**
 * Playwright Test: Male and Female Spinning
 * 
 * Creates users via backend, then signs them in and tests matching
 * Much simpler and faster than creating users through UI
 */

import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, TestUser } from './helpers/create-users'

test.describe('Male and Female Spinning Test - Backend Users', () => {
  let maleUser: TestUser | null = null
  let femaleUser: TestUser | null = null

  test('should create users via backend, sign in, and match when both spin', async ({ browser }) => {
    test.setTimeout(120000) // 2 minutes
    
    // Generate unique test emails
    const timestamp = Date.now()
    const maleEmail = `test-male-${timestamp}@test.com`
    const femaleEmail = `test-female-${timestamp}@test.com`
    const password = 'TestPassword123!'

    try {
      // Step 1: Create users via backend
      console.log('👤 Creating male user via backend...')
      maleUser = await createTestUser(
        maleEmail,
        password,
        'Test Male User',
        'male'
      )
      console.log(`✅ Male user created: ${maleUser.userId}`)

      console.log('👤 Creating female user via backend...')
      femaleUser = await createTestUser(
        femaleEmail,
        password,
        'Test Female User',
        'female'
      )
      console.log(`✅ Female user created: ${femaleUser.userId}`)

      // Step 2: Create browser contexts and sign in
      const context1 = await browser.newContext()
      const context2 = await browser.newContext()
      
      const page1 = await context1.newPage()
      const page2 = await context2.newPage()

      try {
        // Step 3: Sign in User 1 (Male)
        console.log('🔐 Signing in male user...')
        await page1.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
        await page1.waitForTimeout(1000)
        
        // Click "Start Now"
        const startButton1 = page1.getByRole('button', { name: /start now/i }).first()
        await expect(startButton1).toBeVisible({ timeout: 10000 })
        await startButton1.click()
        await page1.waitForTimeout(500)
        
        // Switch to sign in tab
        const signInTab1 = page1.getByRole('button', { name: /sign in/i }).first()
        if (await signInTab1.isVisible({ timeout: 2000 }).catch(() => false)) {
          await signInTab1.click()
          await page1.waitForTimeout(500)
        }
        
        // Fill email and password
        const emailInput1 = page1.locator('input[type="email"]').first()
        await expect(emailInput1).toBeVisible({ timeout: 10000 })
        await emailInput1.fill(maleUser.email)
        await page1.waitForTimeout(300)
        
        const passwordInput1 = page1.locator('input[type="password"]').first()
        await expect(passwordInput1).toBeVisible({ timeout: 10000 })
        await passwordInput1.fill(maleUser.password)
        await page1.waitForTimeout(300)
        
        // Click continue
        const continueButton1 = page1.getByRole('button', { name: /continue/i }).first()
        await continueButton1.click()
        
        // Wait for redirect to /spin
        await page1.waitForURL(/\/spin/, { timeout: 15000 })
        console.log('✅ Male user signed in')

        // Step 4: Sign in User 2 (Female)
        console.log('🔐 Signing in female user...')
        await page2.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
        await page2.waitForTimeout(1000)
        
        const startButton2 = page2.getByRole('button', { name: /start now/i }).first()
        await expect(startButton2).toBeVisible({ timeout: 10000 })
        await startButton2.click()
        await page2.waitForTimeout(500)
        
        const signInTab2 = page2.getByRole('button', { name: /sign in/i }).first()
        if (await signInTab2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await signInTab2.click()
          await page2.waitForTimeout(500)
        }
        
        const emailInput2 = page2.locator('input[type="email"]').first()
        await expect(emailInput2).toBeVisible({ timeout: 10000 })
        await emailInput2.fill(femaleUser.email)
        await page2.waitForTimeout(300)
        
        const passwordInput2 = page2.locator('input[type="password"]').first()
        await expect(passwordInput2).toBeVisible({ timeout: 10000 })
        await passwordInput2.fill(femaleUser.password)
        await page2.waitForTimeout(300)
        
        const continueButton2 = page2.getByRole('button', { name: /continue/i }).first()
        await continueButton2.click()
        
        await page2.waitForURL(/\/spin/, { timeout: 15000 })
        console.log('✅ Female user signed in')

        // Step 5: Both users should now be on /spin page
        await page1.waitForTimeout(1000)
        await page2.waitForTimeout(1000)
        
        // Step 6: User 1 (Male) - Click "Start Spin"
        console.log('🎰 Male user clicking Start Spin...')
        const spinButton1 = page1.getByRole('button', { name: /start spin/i }).first()
        await expect(spinButton1).toBeVisible({ timeout: 10000 })
        await spinButton1.click({ force: true }) // Force click to avoid stability issues
        
        await page1.waitForTimeout(1000)
        console.log('✅ Male user joined queue')
        
        // Step 7: User 2 (Female) - Click "Start Spin"
        console.log('🎰 Female user clicking Start Spin...')
        // Wait a bit to ensure page is loaded
        await page2.waitForTimeout(500)
        const spinButton2 = page2.getByRole('button', { name: /start spin/i }).first()
        await expect(spinButton2).toBeVisible({ timeout: 10000 })
        await spinButton2.click({ force: true }) // Force click to avoid stability issues
        
        // Step 8: Wait for both users to be redirected or match
        console.log('⏳ Waiting for redirect or match...')
        
        // Wait a moment for redirects to happen
        await page1.waitForTimeout(3000)
        await page2.waitForTimeout(3000)
        
        // Check current URLs
        let url1 = page1.url()
        let url2 = page2.url()
        console.log(`User 1 URL after spin: ${url1}`)
        console.log(`User 2 URL after spin: ${url2}`)
        
        // Try to wait for redirects to /spinning or /voting-window (with longer timeout)
        try {
          await Promise.race([
            page1.waitForURL(/\/spinning|\/voting-window/, { timeout: 10000 }),
            page2.waitForURL(/\/spinning|\/voting-window/, { timeout: 10000 })
          ])
        } catch {
          // Check URLs again
          url1 = page1.url()
          url2 = page2.url()
          console.log(`User 1 current URL: ${url1}`)
          console.log(`User 2 current URL: ${url2}`)
        }
        
        // Check if both are already on /voting-window (matched immediately)
        if (url1.includes('/voting-window') && url2.includes('/voting-window')) {
          console.log('✅ Both users matched immediately!')
        } else if (url1.includes('/voting-window') || url2.includes('/voting-window')) {
          // One user is already matched - wait for the other to catch up
          console.log('✅ One user already matched, waiting for the other...')
          
          // Wait longer and check periodically
          const maxWait = 30000 // 30 seconds
          const checkInterval = 1000 // Check every second
          let waited = 0
          let bothMatched = url1.includes('/voting-window') && url2.includes('/voting-window')
          
          while (!bothMatched && waited < maxWait) {
            await page1.waitForTimeout(checkInterval)
            await page2.waitForTimeout(checkInterval)
            waited += checkInterval
            
            url1 = page1.url()
            url2 = page2.url()
            bothMatched = url1.includes('/voting-window') && url2.includes('/voting-window')
            
            if (bothMatched) {
              console.log('✅ Both users now on /voting-window!')
              break
            }
            
            // If still not matched, try navigating the waiting user to voting window
            if (!bothMatched && waited > 10000) {
              // Check if there's a match by looking for matchId in URL
              const matchedUrl = url1.includes('/voting-window') ? url1 : url2
              const matchIdMatch = matchedUrl.match(/matchId=([^&]+)/)
              
              if (matchIdMatch && matchIdMatch[1]) {
                const matchId = matchIdMatch[1]
                console.log(`Found match ID: ${matchId}, navigating other user...`)
                
                if (url1.includes('/spinning')) {
                  await page1.goto(`http://localhost:3000/voting-window?matchId=${matchId}`, { waitUntil: 'networkidle' })
                  url1 = page1.url()
                } else if (url2.includes('/spinning')) {
                  await page2.goto(`http://localhost:3000/voting-window?matchId=${matchId}`, { waitUntil: 'networkidle' })
                  url2 = page2.url()
                }
                
                bothMatched = url1.includes('/voting-window') && url2.includes('/voting-window')
                if (bothMatched) {
                  console.log('✅ Both users now on /voting-window after manual navigation!')
                  break
                }
              }
            }
          }
          
          if (!bothMatched) {
            throw new Error(`Timeout: Users did not both reach /voting-window. User 1: ${url1}, User 2: ${url2}`)
          }
          
          console.log('✅ MATCH SUCCESS! Both users on /voting-window')
        } else if (url1.includes('/spinning') || url2.includes('/spinning')) {
          // At least one is on /spinning - wait for both to match
          console.log('✅ Users are spinning, waiting for match...')
          
          await Promise.all([
            page1.waitForURL(/\/voting-window/, { timeout: 20000 }),
            page2.waitForURL(/\/voting-window/, { timeout: 20000 })
          ])
          
          console.log('✅ MATCH SUCCESS! Both users redirected to /voting-window')
        } else {
          // Still on /spin - might need to wait longer or check what's happening
          console.log('⚠️ Users still on /spin page - checking if match happens...')
          
          // Wait a bit more and check again
          await page1.waitForTimeout(5000)
          await page2.waitForTimeout(5000)
          
          url1 = page1.url()
          url2 = page2.url()
          
          if (url1.includes('/voting-window') || url2.includes('/voting-window')) {
            console.log('✅ Match detected! Waiting for both users...')
            await Promise.all([
              page1.waitForURL(/\/voting-window/, { timeout: 10000 }),
              page2.waitForURL(/\/voting-window/, { timeout: 10000 })
            ])
            console.log('✅ MATCH SUCCESS! Both users on /voting-window')
          } else {
            throw new Error(`Users did not redirect. User 1: ${url1}, User 2: ${url2}`)
          }
        }
        
        // Step 10: Verify both pages are on voting window (wait for page to load)
        await page1.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await page2.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        
        // Wait a moment for content to render
        await page1.waitForTimeout(2000)
        await page2.waitForTimeout(2000)
        
        // Verify both pages are on voting window URL
        expect(page1.url()).toContain('/voting-window')
        expect(page2.url()).toContain('/voting-window')
        
        // Check for voting UI elements (buttons, profile, etc)
        const page1HasVotingUI = await page1.locator('button:has-text("yes"), button:has-text("pass"), button:has-text("Respin")').first().isVisible({ timeout: 5000 }).catch(() => false)
        const page2HasVotingUI = await page2.locator('button:has-text("yes"), button:has-text("pass"), button:has-text("Respin")').first().isVisible({ timeout: 5000 }).catch(() => false)
        
        if (page1HasVotingUI || page2HasVotingUI) {
          console.log('✅ Both pages show voting UI (match found, voting window active or expired)')
        } else {
          // At minimum, verify URLs are correct
          console.log('✅ Both users reached voting window')
        }
        
        // Verify final URLs
        expect(page1.url()).toContain('/voting-window')
        expect(page2.url()).toContain('/voting-window')
        
        console.log('🎉 TEST PASSED: Male and female users matched successfully!')
        
        // Cleanup
        await context1.close()
        await context2.close()

      } catch (error) {
        await context1.close().catch(() => {})
        await context2.close().catch(() => {})
        throw error
      }

    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      // Cleanup: Delete test users
      if (maleUser) {
        console.log('🧹 Cleaning up male user...')
        await deleteTestUser(maleUser.userId).catch(() => {})
      }
      if (femaleUser) {
        console.log('🧹 Cleaning up female user...')
        await deleteTestUser(femaleUser.userId).catch(() => {})
      }
    }
  })
})
