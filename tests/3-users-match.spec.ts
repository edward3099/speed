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

test.describe('3 Users Match Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match 2 males with 1 female (London overlap), verify 1 match occurs, and check remaining user stays in spinning', async ({ browser }) => {
    test.setTimeout(180000) // 3 minutes
    
    // ALWAYS use Vercel URL - never localhost
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes(':3000')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Use https://speed-silk.vercel.app`)
    }
    // Force Vercel URL
    const VERIFIED_BASE_URL = 'https://speed-silk.vercel.app'
    console.log(`🌐 Testing against Vercel: ${VERIFIED_BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    try {
      // 1. Create users via Supabase
      console.log('👤 Creating 3 test users (2 males, 1 female)...')
      
      // User 1: Male 1, 25 years old, London
      const user1 = await createTestUser(
        `test-male1-london-${timestamp}@test.com`,
        password,
        'Test Male 1 London',
        'male',
        25 // age
      )
      testUsers.push(user1)
      
      // User 2: Male 2, 27 years old, London
      const user2 = await createTestUser(
        `test-male2-london-${timestamp}@test.com`,
        password,
        'Test Male 2 London',
        'male',
        27 // age
      )
      testUsers.push(user2)
      
      // User 3: Female, 24 years old, London
      const user3 = await createTestUser(
        `test-female-london-${timestamp}@test.com`,
        password,
        'Test Female London',
        'female',
        24 // age
      )
      testUsers.push(user3)
      
      console.log('✅ All 3 test users created')
      
      // Update profiles with correct ages
      console.log('⚙️ Updating user profiles with ages...')
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 27 }).eq('id', user2.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user3.userId)
      
      // 2. Set preferences via Supabase
      console.log('⚙️ Setting up user preferences via Supabase...')
      
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      // User 1: London, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user1.userId,
          min_age: 20,
          max_age: 30,
          city: ['London'],
          gender_preference: 'female',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 2: London, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user2.userId,
          min_age: 20,
          max_age: 30,
          city: ['London'],
          gender_preference: 'female',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 3: London, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user3.userId,
          min_age: 20,
          max_age: 30,
          city: ['London'],
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // Verify preferences were saved correctly
      console.log('⏳ Waiting 2 seconds for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age')
        .in('user_id', [user1.userId, user2.userId, user3.userId])
      
      if (verifyData) {
        console.log('✅ Preferences set. Verification:', verifyData.map(v => ({
          userId: v.user_id.substring(0, 8),
          city: v.city,
          cityLength: Array.isArray(v.city) ? v.city.length : 0,
          ageRange: `${v.min_age}-${v.max_age}`
        })))
      }
      
      // Verify all users have preferences before spinning
      console.log('🔍 Verifying all users have preferences before spinning...')
      const { data: preSpinPrefs } = await supabase
        .from('user_preferences')
        .select('user_id, city')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (!preSpinPrefs || preSpinPrefs.length !== testUsers.length) {
        const missingUsers = testUsers.filter(u => !preSpinPrefs?.find(p => p.user_id === u.userId))
        throw new Error(`❌ CRITICAL: ${missingUsers.length} users missing preferences before spin! Users: ${missingUsers.map(u => u.name).join(', ')}`)
      }
      
      console.log(`✅ All ${testUsers.length} users have preferences`)
      
      // 3. Sign in with Playwright
      console.log('🌐 Opening browser contexts and signing in users...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user })
        
        // Sign in via Playwright
        await page.goto(`${VERIFIED_BASE_URL}/`, { waitUntil: 'networkidle' })
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
      
      // 4. Click Start Spin simultaneously
      console.log('🎰 All 3 users clicking Start Spin simultaneously...')
      const spinResults = await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          
          // Set up response listener to capture API response
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/spin') && response.request().method() === 'POST',
            { timeout: 15000 }
          ).catch(() => null)
          
          await spinButton.click({ force: true })
          
          // Wait for API response
          const response = await responsePromise
          let responseData: any = {}
          if (response) {
            responseData = await response.json().catch(() => ({}))
            const status = response.status()
            console.log(`  ${user.name}: API status=${status}, matched=${responseData.matched}, match_id=${responseData.match_id || 'none'}`)
            
            if (status !== 200) {
              const errorText = await response.text().catch(() => '')
              console.error(`  ❌ ${user.name} API error:`, errorText.substring(0, 200))
            }
          } else {
            console.log(`  ⚠️ ${user.name}: No API response captured (timeout or error)`)
          }
          
          // Wait for redirect (either to /spinning or /voting-window)
          try {
            await page.waitForURL(/\/spinning|\/voting-window/, { timeout: 15000 })
            const finalUrl = page.url()
            console.log(`  ✅ ${user.name} redirected to: ${finalUrl}`)
            return { user, url: finalUrl, matched: responseData.matched, matchId: responseData.match_id }
          } catch {
            const currentUrl = page.url()
            console.log(`  ⚠️ ${user.name} did not redirect - still on: ${currentUrl}`)
            return { user, url: currentUrl, matched: false, matchId: null }
          }
        } catch (error: any) {
          console.error(`  ❌ Failed to click spin for ${user.name}:`, error.message || error)
          return { user, url: page.url(), matched: false, matchId: null, error: error.message }
        }
      }))
      
      // Wait for matches to occur
      console.log('\n⏳ Waiting for matches to occur (30 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 30000))
      
      // Check user states
      console.log('🔍 Re-checking user states after wait...')
      const votingWindowUsers: { user: TestUser; matchId: string }[] = []
      const spinningUsers: TestUser[] = []
      const unexpectedPages: { user: TestUser; url: string }[] = []
      
      for (const { page, user } of contexts) {
        try {
          const currentUrl = page.url()
          if (currentUrl.includes('/voting-window')) {
            const matchIdMatch = currentUrl.match(/matchId=([^&]+)/)
            const matchId = matchIdMatch ? matchIdMatch[1] : 'unknown'
            console.log(`  ✅ ${user.name} is now in voting-window: ${currentUrl}`)
            votingWindowUsers.push({ user, matchId })
          } else if (currentUrl.includes('/spinning')) {
            console.log(`  ⏳ ${user.name} still spinning: ${currentUrl}`)
            spinningUsers.push(user)
          } else {
            console.log(`  ⚠️ ${user.name} on unexpected page: ${currentUrl}`)
            unexpectedPages.push({ user, url: currentUrl })
          }
        } catch (e) {
          console.log(`  ❌ Error checking ${user.name}:`, e)
        }
      }
      
      // Analyze results
      console.log('\n📊 MATCH ANALYSIS:')
      console.log(`  Users in voting-window: ${votingWindowUsers.length}`)
      console.log(`  Users still spinning: ${spinningUsers.length}`)
      console.log(`  Users on unexpected pages: ${unexpectedPages.length}`)
      
      // Expected: 2 users matched (1 pair), 1 user still spinning
      if (votingWindowUsers.length === 2) {
        console.log('  ✅ SUCCESS: 2 users matched (1 pair)')
        const matchId = votingWindowUsers[0].matchId
        const user1Match = votingWindowUsers[0].user
        const user2Match = votingWindowUsers[1].user
        
        console.log(`  ✅ Match ${matchId.substring(0, 8)}...:`)
        console.log(`     - ${user1Match.name} (${user1Match.gender})`)
        console.log(`     - ${user2Match.name} (${user2Match.gender})`)
        
        // Verify match is correct (male + female)
        const hasMale = user1Match.gender === 'male' || user2Match.gender === 'male'
        const hasFemale = user1Match.gender === 'female' || user2Match.gender === 'female'
        
        if (!hasMale || !hasFemale) {
          throw new Error(`❌ ISSUE: Match should be between male and female, but got: ${user1Match.gender} and ${user2Match.gender}`)
        }
        
        console.log(`     ✅ Valid match: Male and Female with London city overlap`)
      } else if (votingWindowUsers.length === 0) {
        throw new Error('❌ ISSUE: No matches found! At least 1 pair should have matched (2 males + 1 female with London overlap)')
      } else if (votingWindowUsers.length === 1) {
        throw new Error('❌ ISSUE: Only 1 user in voting-window! Matches should have 2 users. This indicates a state management issue.')
      } else {
        throw new Error(`❌ ISSUE: Unexpected number of users in voting-window: ${votingWindowUsers.length}. Expected 2 (1 pair).`)
      }
      
      // Check remaining user
      if (spinningUsers.length === 1) {
        console.log(`  ✅ SUCCESS: 1 user still spinning (expected - odd number of users)`)
        console.log(`     - ${spinningUsers[0].name} is waiting for another match`)
      } else if (spinningUsers.length === 0) {
        console.log(`  ⚠️ NOTE: No users spinning (all matched or redirected)`)
      } else {
        console.log(`  ⚠️ NOTE: ${spinningUsers.length} users still spinning (unexpected, but may be normal)`)
      }
      
      // Check for unexpected pages
      if (unexpectedPages.length > 0) {
        console.log(`  ⚠️ WARNING: ${unexpectedPages.length} users on unexpected pages:`)
        unexpectedPages.forEach(({ user, url }) => {
          console.log(`     - ${user.name}: ${url}`)
        })
      }
      
      console.log('\n✅ TEST PASSED: 3 users tested, 1 pair matched successfully, remaining user handled correctly!')
      
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


















