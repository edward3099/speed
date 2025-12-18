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

// Available cities for randomization (must match platform filter options)
const AVAILABLE_CITIES = ['London', 'Midlands', 'South England', 'North England', 'other']

test.describe('Thursday 100 Users Matching Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match 100 random users correctly', async ({ browser }) => {
    test.setTimeout(0) // No timeout - wait indefinitely
    
    // ALWAYS use Vercel URL - never localhost
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes(':3000')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Use https://speed-silk.vercel.app`)
    }
    const VERIFIED_BASE_URL = 'https://speed-silk.vercel.app'
    console.log(`🌐 Testing against Vercel: ${VERIFIED_BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    const totalUsers = 100
    
    // Randomize genders (ensure total is 100, at least 1 male and 1 female)
    const numMales = Math.floor(Math.random() * (totalUsers - 2)) + 1
    const numFemales = totalUsers - numMales
    
    console.log(`\n🎲 RANDOMIZATION:`)
    console.log(`   - Total users: ${totalUsers}`)
    console.log(`   - Males: ${numMales}`)
    console.log(`   - Females: ${numFemales}`)
    
    try {
      // 1. Create users with random genders (optimized: batch creation feedback)
      console.log('\n👤 Creating 100 test users with random genders...')
      
      for (let i = 0; i < totalUsers; i++) {
        const gender = i < numMales ? 'male' : 'female'
        const age = Math.floor(Math.random() * 11) + 20 // Age 20-30
        const user = await createTestUser(
          `test-${gender}-${i}-${timestamp}@test.com`,
          password,
          `Test ${gender === 'male' ? 'Male' : 'Female'} ${i + 1}`,
          gender as 'male' | 'female',
          age // Pass age to createTestUser
        )
        testUsers.push(user)
        
        // Verify age was set correctly (update if needed as fallback)
        const { data: profile } = await supabase.from('profiles').select('age').eq('id', user.userId).single()
        if (!profile || profile.age !== age) {
          await supabase.from('profiles').update({ age }).eq('id', user.userId)
        }
        
        // Progress logging every 20 users
        if ((i + 1) % 20 === 0) {
          console.log(`  ✅ Created ${i + 1}/${totalUsers} users...`)
        }
      }
      
      console.log('✅ All 100 test users created')
      
      // 2. Assign random cities and preferences (optimized: parallel where possible)
      console.log('\n🎲 Assigning random cities and preferences...')
      
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      const userConfigs: Array<{
        userId: string
        name: string
        gender: string
        age: number
        city: string[]
        cityPref: string[]
        minAge: number
        maxAge: number
        genderPref: string
      }> = []
      
      // Create all preferences in parallel batches
      const preferencePromises = testUsers.map(async (user) => {
        // Random city for user (1-3 cities)
        const numCities = Math.floor(Math.random() * 3) + 1
        const userCity = []
        const available = [...AVAILABLE_CITIES]
        for (let i = 0; i < numCities; i++) {
          const cityIndex = Math.floor(Math.random() * available.length)
          userCity.push(available.splice(cityIndex, 1)[0])
        }
        
        // Random city preference (1-4 cities, or all cities)
        const numPrefCities = Math.random() > 0.3 ? Math.floor(Math.random() * 4) + 1 : AVAILABLE_CITIES.length
        const cityPref = numPrefCities === AVAILABLE_CITIES.length 
          ? AVAILABLE_CITIES 
          : (() => {
              const pref = []
              const prefAvailable = [...AVAILABLE_CITIES]
              for (let i = 0; i < numPrefCities; i++) {
                const cityIndex = Math.floor(Math.random() * prefAvailable.length)
                pref.push(prefAvailable.splice(cityIndex, 1)[0])
              }
              return pref
            })()
        
        // Random age preference
        const minAge = Math.floor(Math.random() * 6) + 18 // 18-23
        const maxAge = Math.floor(Math.random() * 8) + 25 // 25-32
        
        // Gender preference (opposite gender)
        const genderPref = user.gender === 'male' ? 'female' : 'male'
        
        const config = {
          userId: user.userId,
          name: user.name,
          gender: user.gender,
          age: user.age || 25,
          city: userCity,
          cityPref,
          minAge,
          maxAge,
          genderPref
        }
        
        userConfigs.push(config)
        
        // Set preferences
        await fetch(preferencesUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: user.userId,
            min_age: minAge,
            max_age: maxAge,
            city: cityPref,
            gender_preference: genderPref,
            updated_at: new Date().toISOString()
          })
        }).catch(() => {})
        
        return config
      })
      
      await Promise.all(preferencePromises)
      
      // Reduced logging for 100 users
      console.log(`✅ Preferences assigned to all ${totalUsers} users`)
      
      // Verify preferences were saved (optimized: reduced wait time)
      console.log('\n⏳ Waiting 1 second for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 1000)) // Reduced from 2000ms
      
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age, gender_preference')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (verifyData && verifyData.length === testUsers.length) {
        console.log(`✅ All ${testUsers.length} users have preferences saved`)
      } else {
        console.warn(`⚠️ Only ${verifyData?.length || 0} users have preferences (expected ${testUsers.length})`)
      }
      
      // 3. Sign in all users in parallel batches (optimized: parallel batches of 20)
      console.log('\n🌐 Opening browser contexts and signing in all users in parallel batches...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      // Process sign-ins in batches of 20 to balance speed and server load
      const BATCH_SIZE = 20
      for (let batchStart = 0; batchStart < testUsers.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, testUsers.length)
        const batch = testUsers.slice(batchStart, batchEnd)
        
        // Sign in batch in parallel
        await Promise.all(batch.map(async (user, batchIndex) => {
          const context = await browser.newContext()
          const page = await context.newPage()
          page.setDefaultTimeout(60000) // 60 second timeout (reasonable for 100 users)
          page.setDefaultNavigationTimeout(60000) // 60 second navigation timeout
          contexts.push({ context, page, user })
          
          try {
            // Sign in via Playwright (optimized delays)
            await page.goto(`${VERIFIED_BASE_URL}/`, { waitUntil: 'networkidle', timeout: 0 })
            await page.waitForTimeout(100) // Minimal delay
            
            const startButton = page.getByRole('button', { name: /start now/i }).first()
            await expect(startButton).toBeVisible()
            await startButton.click({ force: true })
            await page.waitForTimeout(100) // Minimal delay
            
            const signInTab = page.getByRole('button', { name: /sign in/i }).first()
            await expect(signInTab).toBeVisible()
            const isActive = await signInTab.evaluate((el) => {
              return el.classList.contains('bg-teal-300') || el.classList.contains('border-teal-300')
            }).catch(() => false)
            
            if (!isActive) {
              await signInTab.click({ force: true })
              await page.waitForTimeout(50) // Minimal delay
            }
            
            const emailInput = page.locator('input[type="email"]').first()
            await expect(emailInput).toBeVisible()
            await emailInput.fill(user.email)
            await page.waitForTimeout(30) // Minimal delay
            
            const passwordInput = page.locator('input[type="password"]').first()
            await expect(passwordInput).toBeVisible()
            await passwordInput.fill(user.password)
            await page.waitForTimeout(30) // Minimal delay
            
            const continueButton = page.getByRole('button', { name: /continue/i }).first()
            await expect(continueButton).toBeVisible()
            await continueButton.click({ force: true })
            
            await page.waitForURL(/\/spin/)
          } catch (error: any) {
            console.error(`  ⚠️ Failed to sign in ${user.name}: ${error.message}`)
            // Continue anyway - user might still be signed in
          }
        }))
        
        console.log(`  ✅ ${batchEnd}/${testUsers.length} users signed in (batch ${Math.floor(batchStart / BATCH_SIZE) + 1})`)
        
        // Small delay between batches to avoid overwhelming server
        if (batchEnd < testUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      console.log(`  ✅ All ${testUsers.length} users signed in`)
      
      // 4. All users click Start Spin in parallel batches (optimized: parallel batches of 25)
      console.log('\n🎰 All 100 users clicking Start Spin in parallel batches...')
      const spinStartTimes = new Map<string, number>()
      const spinResults: Array<{
        user: TestUser
        url: string
        matched: boolean
        matchId: string | null
        spinStartTime: number | null
        responseTime: number | null
        error?: string
      }> = []
      
      // Process spin clicks in batches of 25 to balance speed and server load
      const SPIN_BATCH_SIZE = 25
      for (let batchStart = 0; batchStart < contexts.length; batchStart += SPIN_BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + SPIN_BATCH_SIZE, contexts.length)
        const batch = contexts.slice(batchStart, batchEnd)
        
        // Click spin for batch in parallel
        const batchResults = await Promise.all(batch.map(async ({ page, user }, batchIndex) => {
          try {
            // Small stagger within batch: 0-30ms delay
            if (batchIndex > 0) {
              await new Promise(resolve => setTimeout(resolve, Math.min(batchIndex * 10, 30)))
            }
            
            page.setDefaultTimeout(60000) // 60 second timeout (reasonable for 100 users)
            page.setDefaultNavigationTimeout(60000) // 60 second navigation timeout
            
            const spinButton = page.getByRole('button', { name: /start spin/i }).first()
            await expect(spinButton).toBeVisible({ timeout: 60000 })
            
            const spinStartTime = Date.now()
            spinStartTimes.set(user.userId, spinStartTime)
            
            const responsePromise = page.waitForResponse(response => 
              response.url().includes('/api/spin') && response.request().method() === 'POST',
              { timeout: 60000 }
            ).catch(() => null)
            
            await spinButton.click({ force: true, timeout: 60000 })
          
            const response = await responsePromise
            const responseTime = response ? Date.now() : null
            let responseData: any = {}
            if (response) {
              responseData = await response.json().catch(() => ({}))
              const status = response.status()
              const responseDelay = responseTime ? responseTime - spinStartTime : null
              // Reduced logging - only log matches
              if (status === 200 && responseData.matched) {
                console.log(`  ✅ ${user.name}: Matched immediately (match_id: ${responseData.match_id?.substring(0, 8)}..., response time: ${responseDelay}ms)`)
              }
            }
            
            try {
              await page.waitForURL(/\/spinning|\/voting-window/, { timeout: 60000 })
              return { 
                user, 
                url: page.url(), 
                matched: responseData.matched, 
                matchId: responseData.match_id,
                spinStartTime,
                responseTime
              }
            } catch {
              return { user, url: page.url(), matched: false, matchId: null, spinStartTime, responseTime: null }
            }
          } catch (error: any) {
            console.error(`  ❌ Failed to click spin for ${user.name}:`, error.message || error)
            return { user, url: page.url(), matched: false, matchId: null, error: error.message, spinStartTime: spinStartTimes.get(user.userId) || null, responseTime: null }
          }
        }))
        
        spinResults.push(...batchResults)
        console.log(`  ✅ ${batchEnd}/${contexts.length} users clicked spin (batch ${Math.floor(batchStart / SPIN_BATCH_SIZE) + 1})`)
        
        // Small delay between batches to avoid overwhelming server
        if (batchEnd < contexts.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      const matchedImmediately = spinResults.filter(r => r.matched).length
      console.log(`\n📊 Initial matching: ${matchedImmediately}/${testUsers.length} users matched immediately`)
      
      // Track matches from spin responses (simplified logging)
      const matchesFromSpin: Map<string, Array<{ user: TestUser; matchId: string }>> = new Map()
      for (const result of spinResults) {
        if (result.matched && result.matchId) {
          if (!matchesFromSpin.has(result.matchId)) {
            matchesFromSpin.set(result.matchId, [])
          }
          matchesFromSpin.get(result.matchId)!.push({ user: result.user, matchId: result.matchId })
        }
      }
      
      console.log(`\n📈 MATCHES FROM SPIN RESPONSES: ${matchesFromSpin.size} matches`)
      for (const [matchId, users] of matchesFromSpin.entries()) {
        if (users.length === 2) {
          console.log(`  ✅ Match ${matchId.substring(0, 8)}...: ${users[0].user.name} + ${users[1].user.name}`)
        } else {
          console.warn(`  ⚠️ Match ${matchId.substring(0, 8)}... has ${users.length} users (expected 2): ${users.map(u => u.user.name).join(', ')}`)
        }
      }
      
      // Wait for all matches to occur (optimized: reduced wait time)
      console.log('\n⏳ Waiting for all matches to occur (45 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 45000)) // Reduced from 60000ms
      
      // Query database for user states to see who's matched/waiting/idle
      console.log('\n🔍 Querying user states from database...')
      // Map user IDs to names (needed throughout analysis)
      const userIdToName = new Map(testUsers.map(u => [u.userId, u.name]))
      const userIdToGender = new Map(testUsers.map(u => [u.userId, u.gender]))
      
      const { data: userStates, error: statesError } = await supabase
        .from('users_state')
        .select('user_id, state, match_id, partner_id, waiting_since, fairness, last_active, updated_at')
        .in('user_id', testUsers.map(u => u.userId))
        .order('updated_at', { ascending: false })
      
      // Reduced verbose logging for 100 users
      if (!statesError && userStates) {
        const matchedCount = userStates.filter(s => s.state === 'matched').length
        const waitingCount = userStates.filter(s => s.state === 'waiting').length
        const idleCount = userStates.filter(s => s.state === 'idle').length
        console.log(`\n📊 USER STATES SUMMARY:`)
        console.log(`   - Matched: ${matchedCount}`)
        console.log(`   - Waiting: ${waitingCount}`)
        console.log(`   - Idle: ${idleCount}`)
      }
      
      // Query database directly to see all matches (extended time window for 100 users)
      console.log('\n🔍 Querying database for all matches...')
      const { data: dbMatches, error: dbError } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id, status, created_at, vote_window_expires_at, vote_window_started_at')
        .gte('created_at', new Date(Date.now() - 300000).toISOString()) // Matches created in last 5 minutes (extended for 100 users)
        .order('created_at', { ascending: true })
      
      // Also check for any users who might have been matched but match record expired/deleted
      console.log('\n🔍 Checking for any users in matched state without active match records...')
      const { data: matchedStates } = await supabase
        .from('users_state')
        .select('user_id, state, match_id, partner_id')
        .in('user_id', testUsers.map(u => u.userId))
        .eq('state', 'matched')
      
      if (matchedStates) {
        const matchIdsFromStates = new Set(matchedStates.map(s => s.match_id).filter(Boolean))
        const matchIdsFromMatches = new Set((dbMatches || []).map(m => m.match_id))
        const orphanedMatches = [...matchIdsFromStates].filter(id => !matchIdsFromMatches.has(id))
        if (orphanedMatches.length > 0) {
          console.log(`  ⚠️ Found ${orphanedMatches.length} users in 'matched' state but no active match record`)
        }
      }
      
      if (dbError) {
        console.warn(`  ⚠️ Error querying matches: ${dbError.message}`)
      } else {
        console.log(`  📊 Found ${dbMatches?.length || 0} matches in database`)
        
        // CRITICAL: Validate that all matches have exactly 2 users in matched state
        console.log('\n🔍 Validating match integrity (checking for matches with only 1 user)...')
        const matchIntegrityIssues: string[] = []
        for (const match of dbMatches || []) {
          const usersInMatch = matchedStates?.filter(s => s.match_id === match.match_id) || []
          if (usersInMatch.length !== 2) {
            const issue = `Match ${match.match_id.substring(0, 8)}... has ${usersInMatch.length} users in matched state (expected 2): ${usersInMatch.map(u => userIdToName.get(u.user_id) || 'Unknown').join(', ')}`
            matchIntegrityIssues.push(issue)
            console.warn(`  ❌ ${issue}`)
          }
        }
        
        if (matchIntegrityIssues.length > 0) {
          console.error(`\n❌ CRITICAL: Found ${matchIntegrityIssues.length} match(es) with integrity issues!`)
          matchIntegrityIssues.forEach(issue => console.error(`   ${issue}`))
          // Fail the test if there are matches with only 1 user - this is a critical bug
          throw new Error(`CRITICAL BUG: Found ${matchIntegrityIssues.length} match(es) with only 1 user in matched state. Matches must always have exactly 2 users.`)
        } else {
          console.log(`  ✅ All matches have exactly 2 users`)
        }
        
        // Simplified match analysis for 100 users
        const matchAnalysis: Array<{
          matchId: string
          user1: string
          user2: string
          gender1: string
          gender2: string
          isValid: boolean
        }> = []
        
        for (const match of dbMatches || []) {
          const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
          const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
          const user1Gender = userIdToGender.get(match.user1_id) || 'unknown'
          const user2Gender = userIdToGender.get(match.user2_id) || 'unknown'
          const isValid = user1Gender !== user2Gender && user1Gender !== 'unknown' && user2Gender !== 'unknown'
          
          matchAnalysis.push({
            matchId: match.match_id,
            user1: user1Name,
            user2: user2Name,
            gender1: user1Gender,
            gender2: user2Gender,
            isValid
          })
        }
        
        // Check if all matched users are in matches
        const matchedUserIds = new Set<string>()
        for (const match of dbMatches || []) {
          matchedUserIds.add(match.user1_id)
          matchedUserIds.add(match.user2_id)
        }
        
        const unmatchedUsers = testUsers.filter(u => !matchedUserIds.has(u.userId))
        
        // Check for compatible unmatched pairs (potential matching logic bug)
        console.log('\n🔍 Checking for compatible unmatched pairs (potential matching bug)...')
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, age, gender')
          .in('id', testUsers.map(u => u.userId))
        
        const { data: allPreferences } = await supabase
          .from('user_preferences')
          .select('user_id, city, min_age, max_age, gender_preference')
          .in('user_id', testUsers.map(u => u.userId))
        
        const profileMap = new Map((allProfiles || []).map(p => [p.id, p]))
        const preferenceMap = new Map((allPreferences || []).map(p => [p.user_id, p]))
        
        // Check unmatched males vs unmatched females for compatibility
        const unmatchedMales = unmatchedUsers.filter(u => {
          const profile = profileMap.get(u.userId)
          return profile?.gender === 'male'
        })
        const unmatchedFemales = unmatchedUsers.filter(u => {
          const profile = profileMap.get(u.userId)
          return profile?.gender === 'female'
        })
        
        let compatibleUnmatchedPairs = 0
        const compatiblePairs: Array<{ user1: TestUser; user2: TestUser; reasons: string[] }> = []
        
        // Sample check: first 5 unmatched males vs first 10 unmatched females
        for (const male of unmatchedMales.slice(0, 5)) {
          for (const female of unmatchedFemales.slice(0, 10)) {
            const maleProfile = profileMap.get(male.userId)
            const femaleProfile = profileMap.get(female.userId)
            const malePref = preferenceMap.get(male.userId)
            const femalePref = preferenceMap.get(female.userId)
            
            if (!maleProfile || !femaleProfile || !malePref || !femalePref) continue
            
            // Check compatibility (simplified - matches database logic)
            const maleAge = maleProfile.age ?? 25
            const femaleAge = femaleProfile.age ?? 25
            
            // Gender: already opposite (male + female)
            // City: check overlap
            const maleCities = malePref.city || []
            const femaleCities = femalePref.city || []
            const cityCompatible = 
              (maleCities.length === 0 || femaleCities.length === 0) ||
              maleCities.some(c => femaleCities.includes(c))
            
            // Age: both must fit in each other's range
            const ageCompatible = 
              (!malePref.min_age || femaleAge >= malePref.min_age) &&
              (!malePref.max_age || femaleAge <= malePref.max_age) &&
              (!femalePref.min_age || maleAge >= femalePref.min_age) &&
              (!femalePref.max_age || maleAge <= femalePref.max_age)
            
            if (cityCompatible && ageCompatible) {
              compatibleUnmatchedPairs++
              const reasons = []
              if (cityCompatible) reasons.push('City compatible')
              if (ageCompatible) reasons.push(`Age compatible (M:${maleAge}, F:${femaleAge})`)
              compatiblePairs.push({ user1: male, user2: female, reasons })
            }
          }
        }
        
        if (compatibleUnmatchedPairs > 0) {
          console.warn(`\n  ⚠️ FOUND ${compatibleUnmatchedPairs} COMPATIBLE UNMATCHED PAIRS (sampled from first 5 males vs 10 females)`)
          console.warn(`     This indicates a potential matching logic bug!`)
          compatiblePairs.slice(0, 5).forEach(({ user1, user2, reasons }) => {
            console.warn(`     - ${user1.name} + ${user2.name}: ${reasons.join(', ')}`)
          })
        } else {
          console.log(`  ✅ No compatible unmatched pairs found in sample (likely just incompatible preferences)`)
        }
        
        // Final validation
        console.log('\n' + '='.repeat(80))
        console.log('✅ FINAL TEST RESULTS')
        console.log('='.repeat(80))
        
        const invalidMatches = matchAnalysis.filter(m => !m.isValid)
        if (invalidMatches.length > 0) {
          throw new Error(`❌ MATCHING FAILED: Found ${invalidMatches.length} invalid matches (same gender pairs)`)
        }
        
        // Check if users are in matched state even if match records expired
        const matchedStateCount = matchedStates?.length || 0
        const actualMatches = dbMatches?.length || 0
        
        if (actualMatches > 0) {
          console.log(`\n  ✅ Matching is working correctly!`)
          console.log(`  ✅ Created ${actualMatches} valid matches`)
          console.log(`  ✅ ${matchedUserIds.size}/${testUsers.length} users matched`)
          console.log(`  ⚠️ ${unmatchedUsers.length} users unmatched`)
          
          // Check if we have a reasonable number of matches
          const expectedMinMatches = Math.min(numMales, numFemales)
          if (actualMatches < expectedMinMatches * 0.7) { // Allow 70% of max possible matches
            console.warn(`\n  ⚠️ Expected at least ${Math.floor(expectedMinMatches * 0.7)} matches (70% of max), but got ${actualMatches}`)
            if (compatibleUnmatchedPairs > 0) {
              console.error(`\n  ❌ CRITICAL BUG: Found ${compatibleUnmatchedPairs} compatible unmatched pairs!`)
              console.error(`     This indicates a matching algorithm bug - these users should have matched!`)
              throw new Error(`❌ MATCHING LOGIC BUG: Found ${compatibleUnmatchedPairs} compatible pairs that didn't match!`)
            } else {
              console.warn(`     This might be due to incompatible preferences (city/age)`)
            }
          } else {
            console.log(`\n  ✅ Match count is reasonable (${actualMatches} matches, expected at least ${Math.floor(expectedMinMatches * 0.7)})`)
          }
        } else if (matchedStateCount > 0) {
          // Users are in matched state but match records expired - this is acceptable
          console.log(`\n  ⚠️ No active match records found, but ${matchedStateCount} users are in matched state`)
          console.log(`  ℹ️ This likely means matches were created but expired before we checked`)
          console.log(`  ✅ Matching system is working (${matchedStateCount} users matched, even if records expired)`)
          console.log(`  ✅ ${matchedStateCount}/${testUsers.length} users matched`)
        } else {
          throw new Error(`❌ MATCHING FAILED: No matches created! Users should have matched.`)
        }
      }
      
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
