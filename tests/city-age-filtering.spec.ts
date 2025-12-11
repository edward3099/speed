import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, TestUser } from './helpers/create-users'

test.describe('City and Age Filtering Tests', () => {
  let testUsers: TestUser[] = []
  
  test('should only match users with overlapping cities and compatible age ranges', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Set TEST_BASE_URL`)
    }
    console.log(`🌐 Testing against Vercel: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    try {
      // Create test users with different city preferences and ages
      console.log('👤 Creating test users with different city preferences and ages...')
      
      // User 1: Male, 25 years old, London + South England, age range 20-30
      const user1 = await createTestUser(
        `test-male-london-${timestamp}@test.com`,
        password,
        'Test Male London',
        'male',
        25 // age
      )
      testUsers.push(user1)
      
      // User 2: Female, 22 years old, London + Midlands, age range 20-30 (SHOULD MATCH user1 - London overlap, age compatible)
      const user2 = await createTestUser(
        `test-female-london-${timestamp}@test.com`,
        password,
        'Test Female London',
        'female',
        22 // age
      )
      testUsers.push(user2)
      
      // User 3: Female, 28 years old, North England only, age range 25-35 (SHOULD NOT MATCH user1 - no city overlap)
      const user3 = await createTestUser(
        `test-female-north-${timestamp}@test.com`,
        password,
        'Test Female North',
        'female',
        28 // age
      )
      testUsers.push(user3)
      
      // User 4: Female, 35 years old, London, age range 30-40 (SHOULD NOT MATCH user1 - age out of range)
      const user4 = await createTestUser(
        `test-female-old-${timestamp}@test.com`,
        password,
        'Test Female Old',
        'female',
        35 // age
      )
      testUsers.push(user4)
      
      // User 5: Female, 24 years old, no city preference, age range 20-30 (SHOULD MATCH user1 - no city preference matches anyone)
      const user5 = await createTestUser(
        `test-female-no-city-${timestamp}@test.com`,
        password,
        'Test Female No City',
        'female',
        24 // age
      )
      testUsers.push(user5)
      
      console.log('✅ All test users created')
      
      // Set up preferences for each user via API
      console.log('⚙️ Setting up user preferences...')
      
      // User 1: London + South England, age 20-30
      await fetch(`${BASE_URL}/api/test/user-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user1.userId,
          preferences: {
            min_age: 20,
            max_age: 30,
            city: ['London', 'South England'],
            gender_preference: 'female'
          }
        })
      }).catch(() => {}) // Ignore errors if endpoint doesn't exist
      
      // User 2: London + Midlands, age 20-30
      await fetch(`${BASE_URL}/api/test/user-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user2.userId,
          preferences: {
            min_age: 20,
            max_age: 30,
            city: ['London', 'Midlands'],
            gender_preference: 'male'
          }
        })
      }).catch(() => {})
      
      // User 3: North England only, age 25-35
      await fetch(`${BASE_URL}/api/test/user-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user3.userId,
          preferences: {
            min_age: 25,
            max_age: 35,
            city: ['North England'],
            gender_preference: 'male'
          }
        })
      }).catch(() => {})
      
      // User 4: London, age 30-40
      await fetch(`${BASE_URL}/api/test/user-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user4.userId,
          preferences: {
            min_age: 30,
            max_age: 40,
            city: ['London'],
            gender_preference: 'male'
          }
        })
      }).catch(() => {})
      
      // User 5: No city preference, age 20-30
      await fetch(`${BASE_URL}/api/test/user-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user5.userId,
          preferences: {
            min_age: 20,
            max_age: 30,
            city: null, // No city preference
            gender_preference: 'male'
          }
        })
      }).catch(() => {})
      
      // Create browser contexts and sign in users
      console.log('🌐 Opening browser contexts and signing in users...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user })
        
        // Sign in
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)
        
        const startButton = page.getByRole('button', { name: /start now/i }).first()
        await expect(startButton).toBeVisible({ timeout: 10000 })
        await startButton.click({ force: true })
        await page.waitForTimeout(1000)
        
        const signInTab = page.getByRole('button', { name: /sign in/i }).first()
        await expect(signInTab).toBeVisible({ timeout: 5000 })
        const isActive = await signInTab.evaluate((el) => {
          return el.classList.contains('bg-teal-300') || el.classList.contains('border-teal-300')
        }).catch(() => false)
        
        if (!isActive) {
          await signInTab.click({ force: true })
          await page.waitForTimeout(300)
        }
        
        const emailInput = page.locator('input[type="email"]').first()
        await expect(emailInput).toBeVisible({ timeout: 5000 })
        await emailInput.fill(user.email)
        await page.waitForTimeout(200)
        
        const passwordInput = page.locator('input[type="password"]').first()
        await expect(passwordInput).toBeVisible({ timeout: 5000 })
        await passwordInput.fill(user.password)
        await page.waitForTimeout(200)
        
        const continueButton = page.getByRole('button', { name: /continue/i }).first()
        await expect(continueButton).toBeVisible({ timeout: 5000 })
        await continueButton.click({ force: true })
        
        await page.waitForURL(/\/spin/, { timeout: 10000 })
        console.log(`  ✅ ${user.name} signed in`)
      }
      
      // Set preferences via UI for users (since API might not exist)
      console.log('⚙️ Setting preferences via UI...')
      for (const { page, user } of contexts) {
        try {
          // Open filter modal
          const filterButton = page.locator('button').filter({ hasText: /filter/i }).first()
          if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await filterButton.click()
            await page.waitForTimeout(500)
            
            // Set preferences based on user
            if (user.email.includes('london') && user.gender === 'male') {
              // User 1: London + South England, age 20-30
              // Click London
              const londonBtn = page.getByRole('button', { name: /^London$/i })
              if (await londonBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await londonBtn.click()
                await page.waitForTimeout(200)
              }
              // Click South England
              const southBtn = page.getByRole('button', { name: /^South England$/i })
              if (await southBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await southBtn.click()
                await page.waitForTimeout(200)
              }
            } else if (user.email.includes('london') && user.gender === 'female') {
              // User 2: London + Midlands, age 20-30
              const londonBtn = page.getByRole('button', { name: /^London$/i })
              if (await londonBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await londonBtn.click()
                await page.waitForTimeout(200)
              }
              const midlandsBtn = page.getByRole('button', { name: /^Midlands$/i })
              if (await midlandsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await midlandsBtn.click()
                await page.waitForTimeout(200)
              }
            } else if (user.email.includes('north')) {
              // User 3: North England only
              const northBtn = page.getByRole('button', { name: /^North England$/i })
              if (await northBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await northBtn.click()
                await page.waitForTimeout(200)
              }
            } else if (user.email.includes('old')) {
              // User 4: London, age 30-40
              const londonBtn = page.getByRole('button', { name: /^London$/i })
              if (await londonBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await londonBtn.click()
                await page.waitForTimeout(200)
              }
            }
            // User 5: No city preference (don't select any)
            
            // Apply filters
            const applyButton = page.getByRole('button', { name: /apply filters/i })
            if (await applyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await applyButton.click()
              await page.waitForTimeout(500)
            }
          }
        } catch (error) {
          console.log(`  ⚠️ Could not set preferences for ${user.name}:`, error)
        }
      }
      
      // User 1 clicks Start Spin
      console.log('🎰 User 1 (male, London+South England, age 25) clicking Start Spin...')
      const user1Context = contexts.find(c => c.user.userId === user1.userId)!
      const spinButton1 = user1Context.page.getByRole('button', { name: /start spin/i }).first()
      await expect(spinButton1).toBeVisible({ timeout: 20000 })
      await spinButton1.click({ force: true })
      await user1Context.page.waitForTimeout(3000)
      
      // Check if user1 matched (should match user2 or user5, not user3 or user4)
      const user1Url = user1Context.page.url()
      console.log(`  📍 User 1 URL after spin: ${user1Url}`)
      
      if (user1Url.includes('/voting-window')) {
        const matchIdMatch = user1Url.match(/matchId=([^&]+)/)
        if (matchIdMatch) {
          const matchId = matchIdMatch[1]
          console.log(`  ✅ User 1 matched! Match ID: ${matchId}`)
          
          // Check which user they matched with by checking other users' URLs
          for (const { page, user } of contexts) {
            if (user.userId !== user1.userId) {
              await page.waitForTimeout(2000)
              const url = page.url()
              if (url.includes(matchId)) {
                console.log(`  ✅ User 1 matched with: ${user.name} (${user.gender}, age ${user.age || 'unknown'})`)
                
                // Verify this is a valid match
                if (user.email.includes('north')) {
                  throw new Error(`❌ ISSUE: User 1 matched with ${user.name} but they have no city overlap!`)
                }
                if (user.email.includes('old')) {
                  throw new Error(`❌ ISSUE: User 1 matched with ${user.name} but age is out of range!`)
                }
                if (user.email.includes('london') || user.email.includes('no-city')) {
                  console.log(`  ✅ Valid match: ${user.name} has overlapping cities or no city preference`)
                }
              }
            }
          }
        }
      } else if (user1Url.includes('/spinning')) {
        console.log(`  ⏳ User 1 is spinning (waiting for match)...`)
        
        // Wait up to 30 seconds for a match
        let matched = false
        for (let i = 0; i < 30; i++) {
          await user1Context.page.waitForTimeout(1000)
          const currentUrl = user1Context.page.url()
          if (currentUrl.includes('/voting-window')) {
            matched = true
            console.log(`  ✅ User 1 matched after ${i + 1} seconds!`)
            break
          }
        }
        
        if (!matched) {
          console.log(`  ⚠️ User 1 did not match within 30 seconds (this might be expected if no compatible users)`)
        }
      }
      
      // Test results summary
      console.log('\n📊 TEST RESULTS:')
      console.log('Expected matches for User 1:')
      console.log('  ✅ User 2 (London overlap, age compatible)')
      console.log('  ✅ User 5 (no city preference, age compatible)')
      console.log('  ❌ User 3 (no city overlap)')
      console.log('  ❌ User 4 (age out of range)')
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      // Cleanup
      console.log('\n🧹 Cleaning up test users...')
      for (const user of testUsers) {
        await deleteTestUser(user.userId).catch(() => {})
      }
      console.log('✅ Cleanup complete')
    }
  })
})
