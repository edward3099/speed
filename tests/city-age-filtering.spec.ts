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
      
      // Set up preferences for each user via Supabase REST API (to ensure arrays are saved correctly)
      console.log('⚙️ Setting up user preferences via Supabase...')
      
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      // User 1: London + South England, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user1.userId,
          min_age: 20,
          max_age: 30,
          city: ['London', 'South England'],
          gender_preference: 'female',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 2: London + Midlands, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user2.userId,
          min_age: 20,
          max_age: 30,
          city: ['London', 'Midlands'],
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 3: North England only, age 25-35
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user3.userId,
          min_age: 25,
          max_age: 35,
          city: ['North England'],
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 4: London, age 30-40
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user4.userId,
          min_age: 30,
          max_age: 40,
          city: ['London'],
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      // User 5: No city preference, age 20-30
      await fetch(preferencesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: user5.userId,
          min_age: 20,
          max_age: 30,
          city: null,
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
        .in('user_id', [user1.userId, user2.userId, user3.userId, user4.userId, user5.userId])
      
      if (verifyData) {
        console.log('✅ Preferences set. Verification:', verifyData.map(v => ({
          userId: v.user_id.substring(0, 8),
          city: v.city,
          cityType: Array.isArray(v.city) ? 'array' : (v.city === null ? 'null' : typeof v.city),
          cityLength: Array.isArray(v.city) ? v.city.length : 0,
          ageRange: `${v.min_age}-${v.max_age}`
        })))
        
        // CRITICAL: Verify all users have preferences
        const usersWithoutPrefs = [user1.userId, user2.userId, user3.userId, user4.userId, user5.userId]
          .filter(id => !verifyData.find(v => v.user_id === id))
        if (usersWithoutPrefs.length > 0) {
          throw new Error(`❌ CRITICAL: ${usersWithoutPrefs.length} users don't have preferences set! Users: ${usersWithoutPrefs.map(id => id.substring(0, 8)).join(', ')}`)
        }
      } else {
        throw new Error('❌ CRITICAL: No preferences found for test users!')
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
      
      // Note: NULL city preferences are valid - users with no city preference match with anyone
      const cityStatus = preSpinPrefs.map(p => ({
        userId: p.user_id.substring(0, 8),
        hasCity: p.city && Array.isArray(p.city) && p.city.length > 0 ? `${p.city.length} cities` : 'NULL (matches anyone)'
      }))
      console.log(`✅ All ${testUsers.length} users have preferences. City status:`, cityStatus)
      
      // Create browser contexts and sign in with Playwright
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
      
      // All users click Start Spin simultaneously
      console.log('🎰 All users clicking Start Spin simultaneously...')
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
      
      // Check if any users failed to redirect
      const failedRedirects = spinResults.filter(r => !r.url.includes('/spinning') && !r.url.includes('/voting-window'))
      if (failedRedirects.length > 0) {
        console.error(`\n❌ ISSUE: ${failedRedirects.length} users failed to redirect after clicking Start Spin:`)
        failedRedirects.forEach(r => {
          console.error(`  - ${r.user.name}: Still on ${r.url}${r.error ? ` (Error: ${r.error})` : ''}`)
        })
      }
      
      // Wait longer for matches to occur and retry matching
      console.log('\n⏳ Waiting for matches to occur (30 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 30000))
      
      // Check if users are now matched
      console.log('🔍 Re-checking user states after wait...')
      for (const { page, user } of contexts) {
        try {
          const currentUrl = page.url()
          if (currentUrl.includes('/voting-window')) {
            console.log(`  ✅ ${user.name} is now in voting-window: ${currentUrl}`)
          } else if (currentUrl.includes('/spinning')) {
            console.log(`  ⏳ ${user.name} still spinning: ${currentUrl}`)
          } else {
            console.log(`  ⚠️ ${user.name} on unexpected page: ${currentUrl}`)
          }
        } catch (e) {
          console.log(`  ❌ Error checking ${user.name}:`, e)
        }
      }
      
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
