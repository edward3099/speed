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

// Available cities
const CITIES = ['London', 'Midlands', 'North England', 'South England', 'other']

// Helper function to get random element from array
function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

// Helper function to get random age
function getRandomAge(min: number = 20, max: number = 45): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

test.describe('100 Users Randomized Stress Test', () => {
  let testUsers: (TestUser & { age: number; city: string; minAge: number; maxAge: number })[] = []
  
  test('should test random number of males and females (totaling 100) with randomized ages and cities', async ({ browser }) => {
    test.setTimeout(7200000) // 2 hours for large test
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes(':3000')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Use https://speed-silk.vercel.app`)
    }
    const VERIFIED_BASE_URL = 'https://speed-silk.vercel.app'
    console.log(`🌐 Testing against Vercel: ${VERIFIED_BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    const startTime = Date.now()
    
    try {
      // 0. Clean up ALL users in waiting/matched state (ensure complete isolation)
      console.log('🧹 Cleaning up ALL users in waiting/matched state for test isolation...')
      const { data: allWaitingMatched } = await supabase
        .from('users_state')
        .select('user_id, match_id')
        .in('state', ['waiting', 'matched'])

      if (allWaitingMatched && allWaitingMatched.length > 0) {
        console.log(`  Found ${allWaitingMatched.length} users in waiting/matched state`)

        const matchIds = [...new Set(allWaitingMatched.map(u => u.match_id).filter(Boolean))]
        if (matchIds.length > 0) {
          console.log(`  Deleting ${matchIds.length} existing matches...`)
          await supabase
            .from('matches')
            .delete()
            .in('match_id', matchIds)
        }
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', allWaitingMatched.map(u => u.user_id))
        if (profiles && profiles.length > 0) {
          const testUserProfiles = profiles.filter(p => p.name?.startsWith('Test '))
          if (testUserProfiles.length > 0) {
            console.log(`  Deleting ${testUserProfiles.length} test users...`)
            const cleanupPromises = testUserProfiles.map(p => deleteTestUser(p.id).catch(() => {}))
            await Promise.all(cleanupPromises)
          }
          const nonTestUserIds = profiles
            .filter(p => !p.name?.startsWith('Test '))
            .map(p => p.id)
          if (nonTestUserIds.length > 0) {
            console.log(`  Resetting ${nonTestUserIds.length} non-test users to idle state...`)
            const updateResult = await supabase
              .from('users_state')
              .update({
                state: 'idle',
                match_id: null,
                partner_id: null,
                waiting_since: null,
                updated_at: new Date().toISOString()
              })
              .in('user_id', nonTestUserIds)
            if (updateResult.error) {
              console.log(`  ⚠️ Error updating users_state: ${updateResult.error.message}`)
              await supabase
                .from('users_state')
                .delete()
                .in('user_id', nonTestUserIds)
            }
          }
        }
        console.log(`  ✅ Cleanup complete`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
      const { data: remainingUsers } = await supabase
        .from('users_state')
        .select('user_id, state')
        .in('state', ['waiting', 'matched'])
      if (remainingUsers && remainingUsers.length > 0) {
        console.log(`  ⚠️ WARNING: ${remainingUsers.length} users still in waiting/matched state after cleanup`)
      } else {
        console.log(`  ✅ Isolation verified: No users in waiting/matched state`)
      }
      
      // 1. Create 100 users with random male/female split and randomized attributes
      // Randomly determine number of females (0-100), males = 100 - females
      const numFemales = Math.floor(Math.random() * 101) // 0-100
      const numMales = 100 - numFemales
      console.log(`👤 Creating ${numFemales} females and ${numMales} males (totaling 100) with randomized ages and cities...`)
      const createStartTime = Date.now()
      
      // Create females
      const femalePromises = Array.from({ length: numFemales }, async (_, i) => {
        const age = getRandomAge(20, 45)
        const city = getRandomElement(CITIES)
        const minAge = Math.max(18, age - 5)
        const maxAge = Math.min(50, age + 10)
        
        const user = await createTestUser(
          `test-female${i + 1}-rand-${timestamp}@test.com`,
          password,
          `Test Female ${i + 1} ${city}`,
          'female'
        )
        return { ...user, age, city, minAge, maxAge }
      })
      
      // Create males
      const malePromises = Array.from({ length: numMales }, async (_, i) => {
        const age = getRandomAge(20, 45)
        const city = getRandomElement(CITIES)
        const minAge = Math.max(18, age - 5)
        const maxAge = Math.min(50, age + 10)
        
        const user = await createTestUser(
          `test-male${i + 1}-rand-${timestamp}@test.com`,
          password,
          `Test Male ${i + 1} ${city}`,
          'male'
        )
        return { ...user, age, city, minAge, maxAge }
      })
      
      const [females, males] = await Promise.all([
        Promise.all(femalePromises),
        Promise.all(malePromises)
      ])
      
      testUsers = [...females, ...males]
      
      const createTime = Date.now() - createStartTime
      console.log(`✅ All ${testUsers.length} users created in ${createTime}ms`)
      
      // Log user distribution
      console.log(`\n📊 USER DISTRIBUTION:`)
      const cityDistribution = testUsers.reduce((acc, user) => {
        acc[user.city] = (acc[user.city] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      console.log(`  Cities: ${JSON.stringify(cityDistribution)}`)
      const ageRange = testUsers.map(u => u.age).sort((a, b) => a - b)
      console.log(`  Ages: ${ageRange[0]}-${ageRange[ageRange.length - 1]} (min: ${Math.min(...ageRange)}, max: ${Math.max(...ageRange)})`)
      
      const genderDistribution = testUsers.reduce((acc, user) => {
        acc[user.gender] = (acc[user.gender] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      console.log(`  Gender: ${JSON.stringify(genderDistribution)}`)
      
      // Update profiles with ages
      console.log('⚙️ Updating user profiles with ages...')
      const profileUpdates = testUsers.map(user => 
        supabase.from('profiles').update({ age: user.age }).eq('id', user.userId)
      )
      await Promise.all(profileUpdates)
      console.log(`✅ Profiles updated`)
      
      // 2. Set preferences - each user wants their own city and age range
      console.log('⚙️ Setting up preferences (randomized cities and age ranges)...')
      console.log(`  Expected: Matches depending on city/age compatibility and gender distribution`)
      
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      // Set preferences for all users in parallel (batch to avoid overwhelming)
      const BATCH_SIZE = 20
      for (let i = 0; i < testUsers.length; i += BATCH_SIZE) {
        const batch = testUsers.slice(i, i + BATCH_SIZE)
        const preferencePromises = batch.map(async (user) => {
          const prefData = {
            user_id: user.userId,
            min_age: user.minAge,
            max_age: user.maxAge,
            city: [user.city],
            gender_preference: user.gender === 'male' ? 'female' : 'male',
            updated_at: new Date().toISOString()
          }
          const response = await fetch(preferencesUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(prefData)
          })
          if (!response.ok) {
            const text = await response.text()
            console.error(`  ❌ Failed to set preferences for ${user.name}: ${response.status} ${response.statusText}`)
          }
        })
        await Promise.all(preferencePromises)
        if (i % 20 === 0) {
          console.log(`  ✅ Set preferences for ${Math.min(i + BATCH_SIZE, testUsers.length)}/${testUsers.length} users...`)
        }
      }
      console.log(`✅ All preferences set`)
      
      // Wait for preferences to be saved
      console.log('⏳ Waiting 5 seconds for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Verify preferences
      const { data: preSpinPrefs, error: prefsError } = await supabase
        .from('user_preferences')
        .select('user_id')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (prefsError) {
        console.error(`❌ Error fetching preferences:`, prefsError)
        throw new Error(`Failed to fetch preferences: ${prefsError.message}`)
      }
      
      if (!preSpinPrefs || preSpinPrefs.length !== testUsers.length) {
        throw new Error(`❌ CRITICAL: ${testUsers.length - (preSpinPrefs?.length || 0)} users missing preferences!`)
      }
      
      console.log(`  ✅ All ${testUsers.length} users have preferences verified`)
      
      // 3. Sign in all users in parallel (with batching to avoid overwhelming)
      console.log('🌐 Opening browser contexts and signing in users in parallel (batched)...')
      const signInStartTime = Date.now()
      const contexts: { context: any; page: any; user: TestUser & { age: number; city: string; minAge: number; maxAge: number } }[] = []
      
      // Sign in users sequentially to avoid Vercel bot detection
      // Process in small batches with delays between each user
      const SIGN_IN_BATCH_SIZE = 5 // Small batches for 100 users
      for (let i = 0; i < testUsers.length; i += SIGN_IN_BATCH_SIZE) {
        const batch = testUsers.slice(i, i + SIGN_IN_BATCH_SIZE)
        console.log(`  Signing in batch ${Math.floor(i / SIGN_IN_BATCH_SIZE) + 1}/${Math.ceil(testUsers.length / SIGN_IN_BATCH_SIZE)} (${batch.length} users)...`)
        
        // Process users sequentially within batch to avoid bot detection
        for (const user of batch) {
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
          })
          const page = await context.newPage()
          
          // Navigate and wait for page to be ready
          const response = await page.goto(`${VERIFIED_BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 })
          await page.waitForTimeout(2000) // Give page time to render
          
          // Check if we got a valid response
          const httpStatus = response?.status() || 200
          if (httpStatus === 404) {
            throw new Error(`❌ Platform Issue: Vercel deployment returns HTTP 404. Please check if the deployment is live.`)
          }
          
          // Wait for checkpoint to complete - check page title and URL
          let checkpointPassed = false
          for (let attempt = 0; attempt < 60; attempt++) {
            const pageTitle = await page.title().catch(() => '')
            const currentUrl = page.url()
            
            // Check if we're past the checkpoint
            if (!pageTitle.includes('Vercel Security Checkpoint') && 
                !currentUrl.includes('challenges.cloudflare.com') &&
                currentUrl.includes('speed-silk.vercel.app')) {
              checkpointPassed = true
              break
            }
            
            await page.waitForTimeout(1000)
          }
          
          if (!checkpointPassed) {
            console.log(`  ⚠️ Checkpoint may still be active, continuing anyway...`)
          }
          
          // Wait for the Start Now button to appear
          // Try multiple selectors like the load test
          let startButton = page.locator('button').filter({ hasText: /start now/i }).first()
          
          // Wait with longer timeout for checkpoint
          await expect(startButton).toBeVisible({ timeout: 60000 })
          await startButton.click({ force: true })
          await page.waitForTimeout(1000)
          
          // Wait for sign in button
          const signInTab = page.getByRole('button', { name: /sign in/i }).first()
          await expect(signInTab).toBeVisible({ timeout: 20000 })
          await signInTab.click({ force: true })
          await page.waitForTimeout(1000)
          
          // Fill email and password (simple approach like other working tests)
          const emailInput = page.locator('input[type="email"]').first()
          await expect(emailInput).toBeVisible({ timeout: 20000 })
          await expect(emailInput).toBeEnabled({ timeout: 10000 })
          await emailInput.fill(user.email)
          await page.waitForTimeout(200)
          
          const passwordInput = page.locator('input[type="password"]').first()
          await expect(passwordInput).toBeVisible({ timeout: 20000 })
          await expect(passwordInput).toBeEnabled({ timeout: 30000 }) // Password field may take longer to become editable
          await passwordInput.fill(user.password)
          await page.waitForTimeout(200)
          
          // Click continue button
          const continueButton = page.getByRole('button', { name: /continue/i }).first()
          await expect(continueButton).toBeVisible({ timeout: 20000 })
          await continueButton.click({ force: true })
          
          // Wait for navigation to /spin
          await page.waitForURL(/\/spin/, { timeout: 30000 })
          
          contexts.push({ context, page, user })
          
          // Small delay between users to avoid bot detection
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        
        console.log(`  ✅ Batch ${Math.floor(i / SIGN_IN_BATCH_SIZE) + 1} complete: ${contexts.length}/${testUsers.length} users signed in`)
        
        // Delay between batches to avoid overwhelming server
        if (i + SIGN_IN_BATCH_SIZE < testUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }
      
      const signInTime = Date.now() - signInStartTime
      console.log(`✅ ALL ${testUsers.length} users signed in successfully in ${signInTime}ms`)
      
      // 4. All users click Start Spin simultaneously
      console.log('🎰 All users clicking Start Spin simultaneously...')
      const spinStartTime = Date.now()
      
      // Verify pages are on /spin and navigate if needed (in parallel batches)
      console.log('  ⏳ Verifying all pages are on /spin...')
      const NAV_BATCH_SIZE = 20
      let totalPagesOnSpin = 0
      
      for (let i = 0; i < contexts.length; i += NAV_BATCH_SIZE) {
        const batch = contexts.slice(i, i + NAV_BATCH_SIZE)
        const batchNum = Math.floor(i / NAV_BATCH_SIZE) + 1
        const totalBatches = Math.ceil(contexts.length / NAV_BATCH_SIZE)
        
        const navResults = await Promise.all(batch.map(async ({ page }, idx) => {
          const userNum = i + idx + 1
          try {
            // Check current URL first
            const currentUrl = page.url()
            if (currentUrl.includes('/spin')) {
              return true
            }
            
            // Navigate if not on /spin
            await page.goto(`${VERIFIED_BASE_URL}/spin`, { 
              waitUntil: 'domcontentloaded', 
              timeout: 30000 
            })
            // Don't wait for networkidle - just wait a bit for page to settle
            await page.waitForTimeout(500)
            return true
          } catch (error) {
            console.log(`  ⚠️ User ${userNum} navigation issue: ${error instanceof Error ? error.message : 'unknown error'}`)
            // Try once more with shorter timeout
            try {
              await page.goto(`${VERIFIED_BASE_URL}/spin`, { 
                waitUntil: 'domcontentloaded', 
                timeout: 15000 
              })
              await page.waitForTimeout(500)
              return true
            } catch (retryError) {
              console.log(`  ❌ User ${userNum} failed navigation after retry`)
              return false
            }
          }
        }))
        
        const batchOnSpin = navResults.filter(Boolean).length
        totalPagesOnSpin += batchOnSpin
        console.log(`  ✅ Batch ${batchNum}/${totalBatches}: ${batchOnSpin}/${batch.length} on /spin (${totalPagesOnSpin}/${contexts.length} total)`)
        
        // Small delay between batches
        if (i + NAV_BATCH_SIZE < contexts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      console.log(`  ✅ ${totalPagesOnSpin}/${contexts.length} pages confirmed on /spin`)
      
      // Check button visibility in batches with progress logging
      console.log('  ⏳ Checking button visibility...')
      const BUTTON_CHECK_BATCH_SIZE = 25
      let totalButtonsFound = 0
      
      for (let i = 0; i < contexts.length; i += BUTTON_CHECK_BATCH_SIZE) {
        const batch = contexts.slice(i, i + BUTTON_CHECK_BATCH_SIZE)
        const batchNum = Math.floor(i / BUTTON_CHECK_BATCH_SIZE) + 1
        const totalBatches = Math.ceil(contexts.length / BUTTON_CHECK_BATCH_SIZE)
        
        const visibilityChecks = await Promise.all(batch.map(async ({ page }) => {
          try {
            const button = page.getByRole('button', { name: /start spin/i }).first()
            const isVisible = await button.isVisible({ timeout: 10000 }).catch(() => false)
            return isVisible
          } catch (error) {
            return false
          }
        }))
        
        const batchFound = visibilityChecks.filter(Boolean).length
        totalButtonsFound += batchFound
        console.log(`  ✅ Batch ${batchNum}/${totalBatches}: ${batchFound}/${batch.length} visible (${totalButtonsFound}/${contexts.length} total)`)
        
        // Small delay between batches
        if (i + BUTTON_CHECK_BATCH_SIZE < contexts.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      console.log(`  ✅ ${totalButtonsFound}/${contexts.length} buttons visible and ready`)
      
      if (totalButtonsFound < contexts.length * 0.8) {
        console.log(`  ⚠️ WARNING: Only ${totalButtonsFound}/${contexts.length} buttons visible (expected at least 80%)`)
      }
      
      // Click all buttons simultaneously in batches to avoid overwhelming
      console.log('  ⏳ Clicking Start Spin buttons...')
      const CLICK_BATCH_SIZE = 25
      let totalButtonsClicked = 0
      
      for (let i = 0; i < contexts.length; i += CLICK_BATCH_SIZE) {
        const batch = contexts.slice(i, i + CLICK_BATCH_SIZE)
        const batchNum = Math.floor(i / CLICK_BATCH_SIZE) + 1
        const totalBatches = Math.ceil(contexts.length / CLICK_BATCH_SIZE)
        
        const clickResults = await Promise.all(batch.map(async ({ page }, idx) => {
          const userNum = i + idx + 1
          try {
            const spinButton = page.getByRole('button', { name: /start spin/i }).first()
            await spinButton.click({ force: true, timeout: 15000 })
            return true
          } catch (error) {
            console.log(`  ⚠️ Failed to click button for user ${userNum}: ${error instanceof Error ? error.message : 'unknown error'}`)
            return false
          }
        }))
        
        const batchClicked = clickResults.filter(Boolean).length
        totalButtonsClicked += batchClicked
        console.log(`  ✅ Batch ${batchNum}/${totalBatches}: ${batchClicked}/${batch.length} clicked (${totalButtonsClicked}/${contexts.length} total)`)
        
        // Small delay between batches
        if (i + CLICK_BATCH_SIZE < contexts.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      const clickTime = Date.now() - spinStartTime
      console.log(`  ✅ ${totalButtonsClicked}/${contexts.length} buttons clicked in ${clickTime}ms`)
      
      // Wait for API calls to complete
      console.log('  ⏳ Waiting 15 seconds for API calls to complete...')
      await new Promise(resolve => setTimeout(resolve, 15000))
      
      // Wait for matching
      console.log('  ⏳ Waiting 60 seconds for matching system to process...')
      await new Promise(resolve => setTimeout(resolve, 60000))
      
      // Check queue state
      const { data: queueUsers } = await supabase
        .from('users_state')
        .select('user_id, state, waiting_since, match_id, partner_id')
        .in('user_id', testUsers.map(u => u.userId))
      
      console.log(`\n📊 QUEUE STATE:`)
      console.log(`  Users in queue: ${queueUsers?.filter(u => u.state === 'waiting').length || 0}`)
      console.log(`  Users matched: ${queueUsers?.filter(u => u.state === 'matched').length || 0}`)
      console.log(`  Users idle: ${queueUsers?.filter(u => u.state === 'idle').length || 0}`)
      
      // Check matches using match_id from users_state
      const testUserIds = testUsers.map(u => u.userId)
      const matchedTestUsers = queueUsers?.filter(u => u.state === 'matched' && u.match_id) || []
      const matchIds = [...new Set(matchedTestUsers.map(u => u.match_id).filter(Boolean))]
      
      console.log(`\n📈 MATCHES:`)
      console.log(`  Found ${matchIds.length} unique match_id(s) from users_state`)
      
      let validMatches: any[] = []
      
      if (matchIds.length > 0) {
        const { data: matchesByMatchId } = await supabase
          .from('matches')
          .select('match_id, user1_id, user2_id, status, created_at')
          .in('match_id', matchIds)
        
        const matches = matchesByMatchId || []
        console.log(`  Found ${matches.length} match(es) in matches table`)
        
        validMatches = matches.filter(m => 
          testUserIds.includes(m.user1_id) && 
          testUserIds.includes(m.user2_id)
        )
        
        const testUserMatchesWithExternal = matches.filter(m =>
          (testUserIds.includes(m.user1_id) && !testUserIds.includes(m.user2_id)) ||
          (testUserIds.includes(m.user2_id) && !testUserIds.includes(m.user1_id))
        )
        if (testUserMatchesWithExternal.length > 0) {
          console.log(`  ⚠️ WARNING: ${testUserMatchesWithExternal.length} match(es) found where test users matched with external users`)
        }
      }
      
      console.log(`  Total matches found: ${validMatches.length}`)
      console.log(`  Expected: Matches depending on city/age compatibility and gender distribution`)
      
      // Validate that all matches follow the matching criteria
      if (validMatches.length > 0) {
        console.log(`\n🔍 VALIDATING MATCHES (checking preferences compatibility)...`)
        
        // Fetch all profiles and preferences for matched users
        const matchedUserIds = new Set(validMatches.flatMap(m => [m.user1_id, m.user2_id]))
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, gender, age')
          .in('id', Array.from(matchedUserIds))
        
        const { data: preferences } = await supabase
          .from('user_preferences')
          .select('user_id, min_age, max_age, city, gender_preference')
          .in('user_id', Array.from(matchedUserIds))
        
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])
        const prefsMap = new Map(preferences?.map(p => [p.user_id, p]) || [])
        
        let invalidMatches: any[] = []
        let validMatchCount = 0
        
        for (const match of validMatches) {
          const user1 = profileMap.get(match.user1_id)
          const user2 = profileMap.get(match.user2_id)
          const prefs1 = prefsMap.get(match.user1_id)
          const prefs2 = prefsMap.get(match.user2_id)
          
          if (!user1 || !user2 || !prefs1 || !prefs2) {
            console.log(`  ⚠️ Match ${match.match_id}: Missing profile/preferences data`)
            invalidMatches.push({ match, reason: 'Missing data' })
            continue
          }
          
          const errors: string[] = []
          
          // 1. Check gender compatibility (must be opposite)
          if (user1.gender === user2.gender) {
            errors.push(`Same gender (${user1.gender})`)
          }
          
          // 2. Check gender preference compatibility
          if (prefs1.gender_preference !== user2.gender && prefs1.gender_preference !== 'all') {
            errors.push(`User1 wants ${prefs1.gender_preference} but got ${user2.gender}`)
          }
          if (prefs2.gender_preference !== user1.gender && prefs2.gender_preference !== 'all') {
            errors.push(`User2 wants ${prefs2.gender_preference} but got ${user1.gender}`)
          }
          
          // 3. Check age range compatibility
          if (prefs1.min_age !== null && user2.age < prefs1.min_age) {
            errors.push(`User2 age ${user2.age} < User1 min_age ${prefs1.min_age}`)
          }
          if (prefs1.max_age !== null && user2.age > prefs1.max_age) {
            errors.push(`User2 age ${user2.age} > User1 max_age ${prefs1.max_age}`)
          }
          if (prefs2.min_age !== null && user1.age < prefs2.min_age) {
            errors.push(`User1 age ${user1.age} < User2 min_age ${prefs2.min_age}`)
          }
          if (prefs2.max_age !== null && user1.age > prefs2.max_age) {
            errors.push(`User1 age ${user1.age} > User2 max_age ${prefs2.max_age}`)
          }
          
          // 4. Check city compatibility (at least one city in common, or one has no preference)
          const cities1 = Array.isArray(prefs1.city) ? prefs1.city : (prefs1.city ? [prefs1.city] : [])
          const cities2 = Array.isArray(prefs2.city) ? prefs2.city : (prefs2.city ? [prefs2.city] : [])
          
          const hasCityOverlap = cities1.length === 0 || 
                                 cities2.length === 0 || 
                                 cities1.some(c => cities2.includes(c))
          
          if (!hasCityOverlap) {
            errors.push(`No city overlap: User1 [${cities1.join(', ')}] vs User2 [${cities2.join(', ')}]`)
          }
          
          if (errors.length > 0) {
            console.log(`  ❌ Match ${match.match_id} (${user1.gender} ${user1.age}yo ↔ ${user2.gender} ${user2.age}yo): ${errors.join('; ')}`)
            invalidMatches.push({ match, errors, user1, user2, prefs1, prefs2 })
          } else {
            validMatchCount++
            const cityInfo = hasCityOverlap ? 
              (cities1.length === 0 || cities2.length === 0 ? 'no city preference' : 
               `cities: ${cities1.filter(c => cities2.includes(c)).join(', ')}`) : ''
            console.log(`  ✅ Match ${match.match_id}: ${user1.gender} ${user1.age}yo ↔ ${user2.gender} ${user2.age}yo (${cityInfo})`)
          }
        }
        
        if (invalidMatches.length > 0) {
          console.log(`\n  ❌ CRITICAL: ${invalidMatches.length} invalid match(es) found! This indicates a bug in the matching system.`)
          throw new Error(`Matching validation failed: ${invalidMatches.length} match(es) do not meet preference criteria`)
        } else {
          console.log(`  ✅ All ${validMatchCount} match(es) are valid and meet preference criteria`)
        }
      }
      
      // Verify unmatched users
      const matchedUserIds = new Set(validMatches.flatMap(m => [m.user1_id, m.user2_id]))
      const unmatchedUsers = testUsers.filter(u => !matchedUserIds.has(u.userId))
      const unmatchedFemales = unmatchedUsers.filter(u => u.gender === 'female')
      const unmatchedMales = unmatchedUsers.filter(u => u.gender === 'male')
      
      console.log(`\n📊 UNMATCHED USERS:`)
      console.log(`  Unmatched females: ${unmatchedFemales.length}`)
      console.log(`  Unmatched males: ${unmatchedMales.length}`)
      
      // Analyze why unmatched users didn't match
      if (unmatchedUsers.length > 0) {
        console.log(`\n🔍 ANALYZING UNMATCHED USERS...`)
        const { data: unmatchedProfiles } = await supabase
          .from('profiles')
          .select('id, gender, age')
          .in('id', unmatchedUsers.map(u => u.userId))
        
        const { data: unmatchedPrefs } = await supabase
          .from('user_preferences')
          .select('user_id, min_age, max_age, city, gender_preference')
          .in('user_id', unmatchedUsers.map(u => u.userId))
        
        const unmatchedProfileMap = new Map(unmatchedProfiles?.map(p => [p.id, p]) || [])
        const unmatchedPrefsMap = new Map(unmatchedPrefs?.map(p => [p.user_id, p]) || [])
        
        for (const unmatchedUser of unmatchedUsers) {
          const profile = unmatchedProfileMap.get(unmatchedUser.userId)
          const prefs = unmatchedPrefsMap.get(unmatchedUser.userId)
          if (profile && prefs) {
            const cities = Array.isArray(prefs.city) ? prefs.city : (prefs.city ? [prefs.city] : [])
            console.log(`  - ${profile.gender} ${profile.age}yo: wants ${prefs.gender_preference}, age ${prefs.min_age}-${prefs.max_age}, cities [${cities.join(', ') || 'any'}]`)
          }
        }
      }
      
      // Performance summary
      const totalTime = Date.now() - startTime
      console.log(`\n⏱️ PERFORMANCE SUMMARY:`)
      console.log(`  Total test time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`)
      console.log(`  User creation: ${createTime}ms`)
      console.log(`  Sign-in: ${signInTime}ms`)
      console.log(`  Spin & match: ${clickTime}ms`)
      
      console.log(`\n✅ 100-USERS-RANDOMIZED-STRESS TEST COMPLETE - ${validMatches.length} matches found!`)
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      // Cleanup with batching to avoid overwhelming Supabase
      console.log('\n🧹 Cleaning up test users...')
      const CLEANUP_BATCH_SIZE = 10
      for (let i = 0; i < testUsers.length; i += CLEANUP_BATCH_SIZE) {
        const batch = testUsers.slice(i, i + CLEANUP_BATCH_SIZE)
        await Promise.all(batch.map(user => deleteTestUser(user.userId).catch(() => {})))
        // Small delay between batches
        if (i + CLEANUP_BATCH_SIZE < testUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      console.log(`✅ Cleanup complete`)
    }
  })
})
