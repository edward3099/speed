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

test.describe('3 Users City and Age Filtering Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match male (young, all cities) with female (young, London only), but not with female (old, 2 cities)', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Set TEST_BASE_URL`)
    }
    console.log(`🌐 Testing against Vercel: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    // All available cities
    const allCities = ['London', 'South England', 'Midlands', 'North England']
    
    try {
      // Create test users
      console.log('👤 Creating 3 test users...')
      
      // User 1: Male, 22 years old, ALL cities selected, age range 20-30
      const user1 = await createTestUser(
        `test-male-all-cities-${timestamp}@test.com`,
        password,
        'Test Male All Cities',
        'male',
        22 // age
      )
      testUsers.push(user1)
      
      // User 2: Female, 24 years old, ONLY London selected, age range 20-30 (SHOULD MATCH user1)
      const user2 = await createTestUser(
        `test-female-london-only-${timestamp}@test.com`,
        password,
        'Test Female London Only',
        'female',
        24 // age
      )
      testUsers.push(user2)
      
      // User 3: Female, 35 years old, 2 cities selected (London + South England), age range 30-40 (SHOULD NOT MATCH user1 - age incompatible)
      const user3 = await createTestUser(
        `test-female-old-2cities-${timestamp}@test.com`,
        password,
        'Test Female Old 2 Cities',
        'female',
        35 // age
      )
      testUsers.push(user3)
      
      console.log('✅ All test users created')
      
      // Update profiles with correct ages
      console.log('⚙️ Updating user profiles with ages...')
      await supabase.from('profiles').update({ age: 22 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user2.userId)
      await supabase.from('profiles').update({ age: 35 }).eq('id', user3.userId)
      
      // Set up preferences for each user via Supabase REST API (to ensure arrays are saved correctly)
      console.log('⚙️ Setting up user preferences via Supabase...')
      
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      // User 1: ALL cities, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user1.userId,
          min_age: 20,
          max_age: 30,
          city: allCities, // ALL cities selected
          gender_preference: 'female',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 2: ONLY London, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user2.userId,
          min_age: 20,
          max_age: 30,
          city: ['London'], // ONLY London
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 3: London + South England, age 30-40
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user3.userId,
          min_age: 30,
          max_age: 40,
          city: ['London', 'South England'], // 2 cities selected
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // Verify preferences were saved correctly
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age')
        .in('user_id', [user1.userId, user2.userId, user3.userId])
      
      if (verifyData) {
        console.log('✅ Preferences set. Verification:', verifyData.map(v => ({
          userId: v.user_id.substring(0, 8),
          city: v.city,
          cityCount: Array.isArray(v.city) ? v.city.length : 0,
          ageRange: `${v.min_age}-${v.max_age}`
        })))
      }
      
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
      
      // All users click Start Spin simultaneously (preferences already set via API)
      console.log('🎰 All users clicking Start Spin simultaneously...')
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          const startSpinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(startSpinButton).toBeVisible({ timeout: 10000 })
          await startSpinButton.click({ force: true })
          await page.waitForTimeout(500)
          console.log(`  ✅ ${user.name} clicked Start Spin`)
        })
      )
      
      // Wait for users to navigate to /spinning (they're in the queue)
      console.log('⏳ Waiting for users to enter queue...')
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          try {
            await page.waitForURL(/\/spinning/, { timeout: 10000 })
            console.log(`  ✅ ${user.name} entered queue`)
          } catch {
            // If still on /spin, that's okay - they might be matched immediately
            console.log(`  ⚠️ ${user.name} still on /spin (might be matched immediately)`)
          }
        })
      )
      
      // Wait for matches to be created (longer wait for matching to complete)
      console.log('⏳ Waiting for matches to be created...')
      await new Promise(resolve => setTimeout(resolve, 20000))
      
      // Check match results
      console.log('\n📊 Checking match results...')
      const matchResults = await Promise.all(
        contexts.map(async ({ page, user }) => {
          // Wait a bit for any navigation
          await page.waitForTimeout(1000)
          const currentUrl = page.url()
          console.log(`  ${user.name}: ${currentUrl}`)
          return { user, url: currentUrl }
        })
      )
      
      // Analyze matches
      console.log('\n📈 MATCH ANALYSIS:')
      const matchedUsers = matchResults.filter(r => r.url.includes('/voting-window'))
      
      if (matchedUsers.length === 0) {
        throw new Error('❌ No matches found! Expected at least one match.')
      }
      
      // Extract match IDs
      const matchIds = new Set<string>()
      matchedUsers.forEach(m => {
        const matchIdMatch = m.url.match(/matchId=([^&]+)/)
        if (matchIdMatch) {
          matchIds.add(matchIdMatch[1])
        }
      })
      
      console.log(`  Found ${matchIds.size} match(es)`)
      
      for (const matchId of matchIds) {
        const usersInMatch = matchedUsers.filter(m => m.url.includes(matchId))
        console.log(`  ✅ Match ${matchId.substring(0, 8)}...:`)
        usersInMatch.forEach(m => {
          console.log(`     - ${m.user.name} (${m.user.gender})`)
        })
        
        // Verify the match is correct
        const user1InMatch = usersInMatch.find(m => m.user.userId === user1.userId)
        const user2InMatch = usersInMatch.find(m => m.user.userId === user2.userId)
        const user3InMatch = usersInMatch.find(m => m.user.userId === user3.userId)
        
        if (user1InMatch && user2InMatch) {
          console.log(`     ✅ CORRECT: User 1 (male, all cities, age 22) matched with User 2 (female, London only, age 24)`)
          console.log(`        - City overlap: User 1 has all cities including London, User 2 has London ✓`)
          console.log(`        - Age compatible: User 1 (22) in User 2's range (20-30) ✓, User 2 (24) in User 1's range (20-30) ✓`)
        } else if (user1InMatch && user3InMatch) {
          throw new Error(`❌ ISSUE: User 1 (age 22, range 20-30) matched with User 3 (age 35, range 30-40) - age incompatible!`)
        } else if (user2InMatch && user3InMatch) {
          console.log(`     ✅ User 2 and User 3 matched (both female, should not match User 1)`)
        }
      }
      
      // Verify User 1 matched with User 2 (not User 3)
      const user1Result = matchResults.find(r => r.user.userId === user1.userId)
      const user2Result = matchResults.find(r => r.user.userId === user2.userId)
      const user3Result = matchResults.find(r => r.user.userId === user3.userId)
      
      if (!user1Result?.url.includes('/voting-window')) {
        throw new Error('❌ User 1 should have matched!')
      }
      
      if (!user2Result?.url.includes('/voting-window')) {
        throw new Error('❌ User 2 should have matched with User 1!')
      }
      
      // Extract match IDs to verify they're the same
      const user1MatchId = user1Result.url.match(/matchId=([^&]+)/)?.[1]
      const user2MatchId = user2Result.url.match(/matchId=([^&]+)/)?.[1]
      
      if (user1MatchId && user2MatchId && user1MatchId === user2MatchId) {
        console.log('\n✅ SUCCESS: User 1 (male, all cities, young) matched with User 2 (female, London only, young)')
      } else {
        throw new Error('❌ User 1 and User 2 should be in the same match!')
      }
      
      // Verify User 3 did NOT match with User 1
      if (user3Result?.url.includes('/voting-window')) {
        const user3MatchId = user3Result.url.match(/matchId=([^&]+)/)?.[1]
        if (user3MatchId === user1MatchId) {
          throw new Error('❌ ISSUE: User 3 (old age) matched with User 1 (young age) - age filtering failed!')
        } else {
          console.log('✅ User 3 matched with someone else (not User 1) - age filtering working correctly')
        }
      } else {
        console.log('✅ User 3 did not match (still spinning) - age filtering working correctly')
      }
      
      console.log('\n📊 TEST RESULTS:')
      console.log('Expected:')
      console.log('  ✅ User 1 (male, all cities, age 22, range 20-30) should match User 2 (female, London only, age 24, range 20-30)')
      console.log('  ❌ User 1 should NOT match User 3 (female, 2 cities, age 35, range 30-40) - age incompatible')
      
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
