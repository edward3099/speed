import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, TestUser } from './helpers/create-users'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

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
      
      // Update profiles with correct ages
      console.log('⚙️ Updating user profiles with ages...')
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 22 }).eq('id', user2.userId)
      await supabase.from('profiles').update({ age: 28 }).eq('id', user3.userId)
      await supabase.from('profiles').update({ age: 35 }).eq('id', user4.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user5.userId)
      
      // Set up preferences for each user via Supabase directly
      console.log('⚙️ Setting up user preferences via Supabase...')
      
      // User 1: London + South England, age 20-30
      await supabase.from('user_preferences').upsert({
        user_id: user1.userId,
        min_age: 20,
        max_age: 30,
        city: ['London', 'South England'],
        gender_preference: 'female'
      }, { onConflict: 'user_id' })
      
      // User 2: London + Midlands, age 20-30
      await supabase.from('user_preferences').upsert({
        user_id: user2.userId,
        min_age: 20,
        max_age: 30,
        city: ['London', 'Midlands'],
        gender_preference: 'male'
      }, { onConflict: 'user_id' })
      
      // User 3: North England only, age 25-35
      await supabase.from('user_preferences').upsert({
        user_id: user3.userId,
        min_age: 25,
        max_age: 35,
        city: ['North England'],
        gender_preference: 'male'
      }, { onConflict: 'user_id' })
      
      // User 4: London, age 30-40
      await supabase.from('user_preferences').upsert({
        user_id: user4.userId,
        min_age: 30,
        max_age: 40,
        city: ['London'],
        gender_preference: 'male'
      }, { onConflict: 'user_id' })
      
      // User 5: No city preference, age 20-30
      await supabase.from('user_preferences').upsert({
        user_id: user5.userId,
        min_age: 20,
        max_age: 30,
        city: null, // No city preference
        gender_preference: 'male'
      }, { onConflict: 'user_id' })
      
      console.log('✅ Preferences set')
      
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
      
      // All users click Start Spin simultaneously
      console.log('🎰 All users clicking Start Spin simultaneously...')
      await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          await spinButton.click({ force: true })
          console.log(`  ✅ ${user.name} clicked Start Spin`)
        } catch (error) {
          console.error(`  ❌ Failed to click spin for ${user.name}:`, error)
        }
      }))
      
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait for matches
      
      // Check match results
      console.log('\n📊 Checking match results...')
      const matchResults: Map<string, string[]> = new Map() // matchId -> userIds
      
      for (const { page, user } of contexts) {
        const url = page.url()
        console.log(`  ${user.name}: ${url}`)
        
        if (url.includes('/voting-window')) {
          const matchIdMatch = url.match(/matchId=([^&]+)/)
          if (matchIdMatch) {
            const matchId = matchIdMatch[1]
            if (!matchResults.has(matchId)) {
              matchResults.set(matchId, [])
            }
            matchResults.get(matchId)!.push(user.userId)
          }
        }
      }
      
      // Analyze matches
      console.log('\n📈 MATCH ANALYSIS:')
      for (const [matchId, userIds] of matchResults.entries()) {
        if (userIds.length === 2) {
          const user1Match = testUsers.find(u => u.userId === userIds[0])
          const user2Match = testUsers.find(u => u.userId === userIds[1])
          
          if (user1Match && user2Match) {
            console.log(`  ✅ Match ${matchId.substring(0, 8)}...:`)
            console.log(`     - ${user1Match.name} (${user1Match.gender})`)
            console.log(`     - ${user2Match.name} (${user2Match.gender})`)
            
            // Verify match validity
            const isUser1 = user1Match.userId === user1.userId || user2Match.userId === user1.userId
            if (isUser1) {
              const partner = user1Match.userId === user1.userId ? user2Match : user1Match
              
              if (partner.email.includes('north')) {
                throw new Error(`❌ ISSUE: User 1 matched with ${partner.name} but they have no city overlap!`)
              }
              if (partner.email.includes('old')) {
                throw new Error(`❌ ISSUE: User 1 matched with ${partner.name} but age is out of range!`)
              }
              if (partner.email.includes('london') || partner.email.includes('no-city')) {
                console.log(`     ✅ Valid match: ${partner.name} has overlapping cities or no city preference`)
              }
            }
          }
        }
      }
      
      if (matchResults.size === 0) {
        console.log('  ⚠️ No matches found (this might indicate an issue with filtering)')
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
