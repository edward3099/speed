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

test.describe('10 Users Matching Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match 10 random users correctly', async ({ browser }) => {
    test.setTimeout(600000) // 10 minutes - enough time for analysis
    
    // ALWAYS use Vercel URL - never localhost
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes(':3000')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Use https://speed-silk.vercel.app`)
    }
    const VERIFIED_BASE_URL = 'https://speed-silk.vercel.app'
    console.log(`🌐 Testing against Vercel: ${VERIFIED_BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    const totalUsers = 10
    
    // Randomize genders (ensure total is 10, at least 1 male and 1 female)
    const numMales = Math.floor(Math.random() * (totalUsers - 2)) + 1
    const numFemales = totalUsers - numMales
    
    console.log(`\n🎲 RANDOMIZATION:`)
    console.log(`   - Total users: ${totalUsers}`)
    console.log(`   - Males: ${numMales}`)
    console.log(`   - Females: ${numFemales}`)
    
    try {
      // 1. Create users with random genders
      console.log('\n👤 Creating 10 test users with random genders...')
      
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
      }
      
      console.log('✅ All 10 test users created')
      
      // 2. Assign random cities and preferences
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
      
      for (const user of testUsers) {
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
        
        userConfigs.push({
          userId: user.userId,
          name: user.name,
          gender: user.gender,
          age: user.age || 25,
          city: userCity,
          cityPref,
          minAge,
          maxAge,
          genderPref
        })
        
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
      }
      
      // Log user configurations
      console.log('\n📋 User Configurations:')
      userConfigs.forEach((config, idx) => {
        console.log(`   ${idx + 1}. ${config.name} (${config.gender}, age ${config.age}):`)
        console.log(`      City: [${config.city.join(', ')}]`)
        console.log(`      Prefers: [${config.cityPref.join(', ')}], age ${config.minAge}-${config.maxAge}, ${config.genderPref}`)
      })
      
      // Verify preferences were saved
      console.log('\n⏳ Waiting 2 seconds for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age, gender_preference')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (verifyData && verifyData.length === testUsers.length) {
        console.log(`✅ All ${testUsers.length} users have preferences saved`)
      } else {
        console.warn(`⚠️ Only ${verifyData?.length || 0} users have preferences (expected ${testUsers.length})`)
      }
      
      // 3. Sign in all users
      console.log('\n🌐 Opening browser contexts and signing in all users...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      for (let i = 0; i < testUsers.length; i++) {
        const user = testUsers[i]
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user })
        
        // Sign in via Playwright
        await page.goto(`${VERIFIED_BASE_URL}/`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(500)
        
        const startButton = page.getByRole('button', { name: /start now/i }).first()
        await expect(startButton).toBeVisible({ timeout: 10000 })
        await startButton.click({ force: true })
        await page.waitForTimeout(500)
        
        const signInTab = page.getByRole('button', { name: /sign in/i }).first()
        await expect(signInTab).toBeVisible({ timeout: 5000 })
        const isActive = await signInTab.evaluate((el) => {
          return el.classList.contains('bg-teal-300') || el.classList.contains('border-teal-300')
        }).catch(() => false)
        
        if (!isActive) {
          await signInTab.click({ force: true })
          await page.waitForTimeout(200)
        }
        
        const emailInput = page.locator('input[type="email"]').first()
        await expect(emailInput).toBeVisible({ timeout: 5000 })
        await emailInput.fill(user.email)
        await page.waitForTimeout(100)
        
        const passwordInput = page.locator('input[type="password"]').first()
        await expect(passwordInput).toBeVisible({ timeout: 5000 })
        await passwordInput.fill(user.password)
        await page.waitForTimeout(100)
        
        const continueButton = page.getByRole('button', { name: /continue/i }).first()
        await expect(continueButton).toBeVisible({ timeout: 5000 })
        await continueButton.click({ force: true })
        
        await page.waitForURL(/\/spin/, { timeout: 10000 })
        if ((i + 1) % 5 === 0) {
          console.log(`  ✅ ${i + 1}/${testUsers.length} users signed in`)
        }
      }
      console.log(`  ✅ All ${testUsers.length} users signed in`)
      
      // 4. All users click Start Spin simultaneously
      console.log('\n🎰 All 10 users clicking Start Spin simultaneously...')
      const spinStartTimes = new Map<string, number>()
      const spinResults = await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          
          const spinStartTime = Date.now()
          spinStartTimes.set(user.userId, spinStartTime)
          
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/spin') && response.request().method() === 'POST',
            { timeout: 15000 }
          ).catch(() => null)
          
          await spinButton.click({ force: true })
          
          const response = await responsePromise
          const responseTime = response ? Date.now() : null
          let responseData: any = {}
          if (response) {
            responseData = await response.json().catch(() => ({}))
            const status = response.status()
            const responseDelay = responseTime ? responseTime - spinStartTime : null
            if (status === 200 && responseData.matched) {
              console.log(`  ✅ ${user.name}: Matched immediately (match_id: ${responseData.match_id?.substring(0, 8)}..., response time: ${responseDelay}ms)`)
            } else if (status === 200) {
              console.log(`  ⏳ ${user.name}: Not matched immediately (response time: ${responseDelay}ms)`)
            }
          }
          
          try {
            await page.waitForURL(/\/spinning|\/voting-window/, { timeout: 15000 })
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
      
      // Show spin timing analysis
      console.log(`\n⏰ SPIN TIMING ANALYSIS:`)
      const sortedSpins = [...spinResults].sort((a, b) => (a.spinStartTime || 0) - (b.spinStartTime || 0))
      sortedSpins.forEach((result, idx) => {
        const delay = idx > 0 ? (result.spinStartTime || 0) - (sortedSpins[idx - 1].spinStartTime || 0) : 0
        const responseDelay = result.responseTime && result.spinStartTime ? result.responseTime - result.spinStartTime : null
        console.log(`   ${idx + 1}. ${result.user.name}: Spin at ${result.spinStartTime ? new Date(result.spinStartTime).toISOString() : 'N/A'} (${delay}ms after previous), Response: ${responseDelay ? responseDelay + 'ms' : 'N/A'}, Matched: ${result.matched ? 'YES' : 'NO'}`)
      })
      
      const matchedImmediately = spinResults.filter(r => r.matched).length
      console.log(`\n📊 Initial matching: ${matchedImmediately}/${testUsers.length} users matched immediately`)
      
      // Track matches from spin responses
      const matchesFromSpin: Map<string, Array<{ user: TestUser; matchId: string }>> = new Map()
      for (const result of spinResults) {
        if (result.matched && result.matchId) {
          if (!matchesFromSpin.has(result.matchId)) {
            matchesFromSpin.set(result.matchId, [])
          }
          matchesFromSpin.get(result.matchId)!.push({ user: result.user, matchId: result.matchId })
        }
      }
      
      console.log(`\n📈 MATCHES FROM SPIN RESPONSES:`)
      for (const [matchId, users] of matchesFromSpin.entries()) {
        if (users.length === 2) {
          console.log(`  ✅ Match ${matchId.substring(0, 8)}...: ${users[0].user.name} + ${users[1].user.name}`)
        } else {
          console.warn(`  ⚠️ Match ${matchId.substring(0, 8)}... has ${users.length} users (expected 2): ${users.map(u => u.user.name).join(', ')}`)
        }
      }
      
      // Wait for all matches to occur
      console.log('\n⏳ Waiting for all matches to occur (60 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 60000))
      
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
      
      if (!statesError && userStates) {
        console.log(`\n📊 USER STATES FROM DATABASE:`)
        for (const state of userStates) {
          const userName = userIdToName.get(state.user_id) || 'Unknown'
          const partnerName = state.partner_id ? (userIdToName.get(state.partner_id) || 'Unknown') : 'None'
          console.log(`   ${userName}:`)
          console.log(`      - State: ${state.state}`)
          console.log(`      - Match ID: ${state.match_id ? state.match_id.substring(0, 8) + '...' : 'None'}`)
          console.log(`      - Partner: ${partnerName}`)
          console.log(`      - Fairness: ${state.fairness}`)
          console.log(`      - Waiting since: ${state.waiting_since || 'N/A'}`)
          console.log(`      - Last active: ${state.last_active ? new Date(state.last_active).toISOString() : 'N/A'}`)
        }
      }
      
      // Query database directly to see all matches
      console.log('\n🔍 Querying database for all matches...')
      const { data: dbMatches, error: dbError } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id, status, created_at, vote_window_expires_at, vote_window_started_at')
        .gte('created_at', new Date(Date.now() - 120000).toISOString()) // Matches created in last 2 minutes
        .order('created_at', { ascending: true }) // Order by creation time to see order
      
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
          console.log(`  ⚠️ Found ${orphanedMatches.length} users in 'matched' state but no active match record:`)
          matchedStates.filter(s => orphanedMatches.includes(s.match_id)).forEach(s => {
            const userName = userIdToName.get(s.user_id) || 'Unknown'
            console.log(`     - ${userName}: match_id=${s.match_id?.substring(0, 8)}...`)
          })
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
          } else {
            const userNames = usersInMatch.map(u => userIdToName.get(u.user_id) || 'Unknown')
            console.log(`  ✅ Match ${match.match_id.substring(0, 8)}... has 2 users: ${userNames.join(' + ')}`)
          }
        }
        
        if (matchIntegrityIssues.length > 0) {
          console.error(`\n❌ CRITICAL: Found ${matchIntegrityIssues.length} match(es) with integrity issues!`)
          matchIntegrityIssues.forEach(issue => console.error(`   ${issue}`))
          // Fail the test if there are matches with only 1 user - this is a critical bug
          throw new Error(`CRITICAL BUG: Found ${matchIntegrityIssues.length} match(es) with only 1 user in matched state. Matches must always have exactly 2 users.`)
        }
        
        const matchAnalysis: Array<{
          matchId: string
          user1: string
          user2: string
          gender1: string
          user2: string
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
          
          const expiresAt = match.vote_window_expires_at ? new Date(match.vote_window_expires_at).toISOString() : 'N/A'
          console.log(`  📋 Match ${match.match_id.substring(0, 8)}...: ${user1Name} (${user1Gender}) + ${user2Name} (${user2Gender}) (status: ${match.status}, expires: ${expiresAt})`)
          
          if (!isValid) {
            console.warn(`     ⚠️ WARNING: Invalid match - both users have same gender or unknown gender!`)
          }
        }
        
      // Fetch all user profiles and preferences for detailed analysis
      console.log('\n🔍 Fetching user profiles and preferences for detailed analysis...')
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, age, gender')
        .in('id', testUsers.map(u => u.userId))
      
      if (profilesError) {
        console.warn(`⚠️ Error fetching profiles: ${profilesError.message}`)
      }
      
      // Log actual ages from database for debugging
      if (allProfiles) {
        console.log('\n📊 ACTUAL AGES FROM DATABASE:')
        allProfiles.forEach(p => {
          const userName = userIdToName.get(p.id) || 'Unknown'
          console.log(`   ${userName}: age ${p.age}`)
        })
      }
        
        const { data: allPreferences } = await supabase
          .from('user_preferences')
          .select('user_id, city, min_age, max_age, gender_preference')
          .in('user_id', testUsers.map(u => u.userId))
        
        // Create lookup maps
        const profileMap = new Map((allProfiles || []).map(p => [p.id, p]))
        const preferenceMap = new Map((allPreferences || []).map(p => [p.user_id, p]))
        const userIdToConfig = new Map(userConfigs.map(c => [c.userId, c]))
        
        // Helper function to check compatibility (simulates database matching logic)
        const checkCompatibility = (user1Id: string, user2Id: string, includeDetailedBreakdown: boolean = false) => {
          const user1Profile = profileMap.get(user1Id)
          const user2Profile = profileMap.get(user2Id)
          const user1Pref = preferenceMap.get(user1Id)
          const user2Pref = preferenceMap.get(user2Id)
          const user1Config = userIdToConfig.get(user1Id)
          const user2Config = userIdToConfig.get(user2Id)
          
          const reasons: string[] = []
          const blockers: string[] = []
          const detailedBreakdown: Array<{ check: string; result: boolean; details: string }> = []
          
          // 1. Gender compatibility
          if (!user1Profile || !user2Profile) {
            blockers.push('Missing profile data')
            if (includeDetailedBreakdown) {
              detailedBreakdown.push({ check: 'Profile exists', result: false, details: `User1: ${!!user1Profile}, User2: ${!!user2Profile}` })
            }
            return { compatible: false, reasons, blockers, detailedBreakdown }
          }
          
          const genderCompatible = user1Profile.gender !== user2Profile.gender && 
                                   user1Profile.gender !== null && 
                                   user2Profile.gender !== null &&
                                   user1Profile.gender !== undefined &&
                                   user2Profile.gender !== undefined
          
          if (includeDetailedBreakdown) {
            detailedBreakdown.push({ 
              check: 'Gender compatibility', 
              result: genderCompatible, 
              details: `User1: ${user1Profile.gender}, User2: ${user2Profile.gender}, Compatible: ${genderCompatible}` 
            })
          }
          
          if (!genderCompatible) {
            blockers.push(`Same gender (${user1Profile.gender}) or invalid`)
          } else {
            reasons.push(`✅ Opposite genders (${user1Profile.gender} + ${user2Profile.gender})`)
          }
          
          // 2. City preference matching (simulates database logic exactly)
          const user1Cities = user1Pref?.city || []
          const user2Cities = user2Pref?.city || []
          const user1HasCities = Array.isArray(user1Cities) && user1Cities.length > 0 && user1Cities[0] !== null
          const user2HasCities = Array.isArray(user2Cities) && user2Cities.length > 0 && user2Cities[0] !== null
          
          // Database logic: match if both have no preference OR one has no preference OR there's overlap
          let cityCompatible = false
          let cityReason = ''
          
          if (!user1HasCities && !user2HasCities) {
            cityCompatible = true
            cityReason = 'Both have no city preference (match anyone)'
            reasons.push(`✅ ${cityReason}`)
          } else if (!user1HasCities) {
            cityCompatible = true
            cityReason = `User1 has no city preference (matches ${user2Cities.join(', ')})`
            reasons.push(`✅ ${cityReason}`)
          } else if (!user2HasCities) {
            cityCompatible = true
            cityReason = `User2 has no city preference (matches ${user1Cities.join(', ')})`
            reasons.push(`✅ ${cityReason}`)
          } else {
            // Check for overlap using database logic: EXISTS (SELECT 1 FROM unnest(up1.city) WHERE city = ANY(up2.city))
            const commonCities = user1Cities.filter(c => user2Cities.includes(c))
            if (commonCities.length > 0) {
              cityCompatible = true
              cityReason = `City overlap: ${commonCities.join(', ')}`
              reasons.push(`✅ ${cityReason}`)
            } else {
              cityCompatible = false
              cityReason = `No city overlap`
              blockers.push(`No city overlap (User1: [${user1Cities.join(', ')}], User2: [${user2Cities.join(', ')}])`)
            }
          }
          
          if (includeDetailedBreakdown) {
            detailedBreakdown.push({ 
              check: 'City preference', 
              result: cityCompatible, 
              details: `User1 cities: [${user1Cities.join(', ') || 'none'}], User2 cities: [${user2Cities.join(', ') || 'none'}], ${cityReason}` 
            })
          }
          
          // 3. Age range matching - use profile age first, fallback to config age
          // Database logic: (up1.min_age IS NULL OR p2.age >= up1.min_age) AND (up1.max_age IS NULL OR p2.age <= up1.max_age)
          const user1Age = user1Profile.age ?? user1Config?.age ?? 25
          const user2Age = user2Profile.age ?? user2Config?.age ?? 25
          const user1MinAge = user1Pref?.min_age || null
          const user1MaxAge = user1Pref?.max_age || null
          const user2MinAge = user2Pref?.min_age || null
          const user2MaxAge = user2Pref?.max_age || null
          
          // Database logic: Check if user2's age is within user1's range
          const user2InUser1Range = (user1MinAge === null || user2Age >= user1MinAge) && (user1MaxAge === null || user2Age <= user1MaxAge)
          // Database logic: Check if user1's age is within user2's range
          const user1InUser2Range = (user2MinAge === null || user1Age >= user2MinAge) && (user2MaxAge === null || user1Age <= user2MaxAge)
          
          const ageCompatible = user2InUser1Range && user1InUser2Range
          
          if (includeDetailedBreakdown) {
            detailedBreakdown.push({ 
              check: 'Age range (User2 in User1 range)', 
              result: user2InUser1Range, 
              details: `User2 age ${user2Age} in User1 range (${user1MinAge || 'NULL'}-${user1MaxAge || 'NULL'}): ${user2InUser1Range ? 'YES' : 'NO'}` 
            })
            detailedBreakdown.push({ 
              check: 'Age range (User1 in User2 range)', 
              result: user1InUser2Range, 
              details: `User1 age ${user1Age} in User2 range (${user2MinAge || 'NULL'}-${user2MaxAge || 'NULL'}): ${user1InUser2Range ? 'YES' : 'NO'}` 
            })
          }
          
          if (ageCompatible) {
            reasons.push(`✅ Age compatible (User1 age ${user1Age} fits in User2's preferred range ${user2MinAge || 'any'}-${user2MaxAge || 'any'}, User2 age ${user2Age} fits in User1's preferred range ${user1MinAge || 'any'}-${user1MaxAge || 'any'})`)
          } else {
            if (!user2InUser1Range) {
              blockers.push(`User2's age (${user2Age}) is not within User1's preferred range (${user1MinAge || 'any'}-${user1MaxAge || 'any'})`)
            }
            if (!user1InUser2Range) {
              blockers.push(`User1's age (${user1Age}) is not within User2's preferred range (${user2MinAge || 'any'}-${user2MaxAge || 'any'})`)
            }
          }
          
          // 4. Match history check (would be done in database)
          // This is simulated - in real matching, it checks match_history table
          
          const compatible = blockers.length === 0 && genderCompatible
          
          if (includeDetailedBreakdown) {
            detailedBreakdown.push({ 
              check: 'Overall compatibility', 
              result: compatible, 
              details: `Gender: ${genderCompatible}, City: ${cityCompatible}, Age: ${ageCompatible}, Blockers: ${blockers.length}` 
            })
          }
          
          return { compatible, reasons, blockers, detailedBreakdown }
        }
        
        // Detailed analysis of each match
        console.log('\n' + '='.repeat(80))
        console.log('📊 DETAILED MATCH ANALYSIS')
        console.log('='.repeat(80))
        
        const matchDetails: Array<{
          matchId: string
          user1: { id: string; name: string; gender: string; age: number; city: string[]; cityPref: string[]; minAge: number; maxAge: number }
          user2: { id: string; name: string; gender: string; age: number; city: string[]; cityPref: string[]; minAge: number; maxAge: number }
          compatibility: ReturnType<typeof checkCompatibility>
        }> = []
        
        for (const match of dbMatches || []) {
          const user1Id = match.user1_id
          const user2Id = match.user2_id
          const user1Name = userIdToName.get(user1Id) || 'Unknown'
          const user2Name = userIdToName.get(user2Id) || 'Unknown'
          const user1Config = userIdToConfig.get(user1Id)
          const user2Config = userIdToConfig.get(user2Id)
          const user1Profile = profileMap.get(user1Id)
          const user2Profile = profileMap.get(user2Id)
          const user1Age = user1Profile?.age ?? user1Config?.age ?? 25
          const user2Age = user2Profile?.age ?? user2Config?.age ?? 25
          
          const compatibility = checkCompatibility(user1Id, user2Id, true) // Include detailed breakdown
          
          if (user1Config && user2Config) {
            matchDetails.push({
              matchId: match.match_id,
              user1: {
                id: user1Id,
                name: user1Name,
                gender: user1Config.gender,
                age: user1Age,
                city: user1Config.city,
                cityPref: user1Config.cityPref,
                minAge: user1Config.minAge,
                maxAge: user1Config.maxAge
              },
              user2: {
                id: user2Id,
                name: user2Name,
                gender: user2Config.gender,
                age: user2Age,
                city: user2Config.city,
                cityPref: user2Config.cityPref,
                minAge: user2Config.minAge,
                maxAge: user2Config.maxAge
              },
              compatibility
            })
            
            console.log(`\n🔗 MATCH #${matchDetails.length}: ${user1Name} + ${user2Name}`)
            console.log(`   Match ID: ${match.match_id.substring(0, 8)}...`)
            console.log(`   Status: ${match.status}`)
            console.log(`   Created: ${new Date(match.created_at).toISOString()}`)
            
            console.log(`\n   👤 USER 1: ${user1Name}`)
            console.log(`      - Gender: ${user1Config.gender}`)
            console.log(`      - Age: ${user1Age} (from database: ${user1Profile?.age ?? 'N/A'}, from config: ${user1Config.age})`)
            console.log(`      - City: [${user1Config.city.join(', ')}]`)
            console.log(`      - Prefers cities: [${user1Config.cityPref.join(', ')}]`)
            console.log(`      - Prefers age range: ${user1Config.minAge}-${user1Config.maxAge}`)
            console.log(`      - Prefers gender: ${user1Config.genderPref}`)
            
            console.log(`\n   👤 USER 2: ${user2Name}`)
            console.log(`      - Gender: ${user2Config.gender}`)
            console.log(`      - Age: ${user2Age} (from database: ${user2Profile?.age ?? 'N/A'}, from config: ${user2Config.age})`)
            console.log(`      - City: [${user2Config.city.join(', ')}]`)
            console.log(`      - Prefers cities: [${user2Config.cityPref.join(', ')}]`)
            console.log(`      - Prefers age range: ${user2Config.minAge}-${user2Config.maxAge}`)
            console.log(`      - Prefers gender: ${user2Config.genderPref}`)
            
            console.log(`\n   ✅ COMPATIBILITY ANALYSIS:`)
            console.log(`      ${compatibility.reasons.length} compatibility factors:`)
            compatibility.reasons.forEach((r, idx) => console.log(`      ${idx + 1}. ${r}`))
            
            // Detailed compatibility breakdown
            const user1Cities = user1Config.cityPref || []
            const user2Cities = user2Config.cityPref || []
            const commonCities = user1Cities.filter(c => user2Cities.includes(c))
            const user1HasNoCityPref = !user1Cities || user1Cities.length === 0
            const user2HasNoCityPref = !user2Cities || user2Cities.length === 0
            
            console.log(`\n   📋 DETAILED COMPATIBILITY BREAKDOWN:`)
            console.log(`      1. Gender: ✅ ${user1Config.gender} + ${user2Config.gender} (opposite genders)`)
            
            if (user1HasNoCityPref && user2HasNoCityPref) {
              console.log(`      2. City: ✅ Both have no preference (match anyone)`)
            } else if (user1HasNoCityPref) {
              console.log(`      2. City: ✅ User1 has no preference (matches User2's cities: [${user2Cities.join(', ')}])`)
            } else if (user2HasNoCityPref) {
              console.log(`      2. City: ✅ User2 has no preference (matches User1's cities: [${user1Cities.join(', ')}])`)
            } else if (commonCities.length > 0) {
              console.log(`      2. City: ✅ Overlap found: [${commonCities.join(', ')}]`)
              console.log(`         - User1 wants: [${user1Cities.join(', ')}]`)
              console.log(`         - User2 wants: [${user2Cities.join(', ')}]`)
            } else {
              console.log(`      2. City: ❌ No overlap`)
              console.log(`         - User1 wants: [${user1Cities.join(', ')}]`)
              console.log(`         - User2 wants: [${user2Cities.join(', ')}]`)
            }
            
            // Age compatibility
            const user1AgeInRange = (!user2Config.minAge || user1Age >= user2Config.minAge) && (!user2Config.maxAge || user1Age <= user2Config.maxAge)
            const user2AgeInRange = (!user1Config.minAge || user2Age >= user1Config.minAge) && (!user1Config.maxAge || user2Age <= user1Config.maxAge)
            
            console.log(`      3. Age: ${user1AgeInRange && user2AgeInRange ? '✅' : '❌'} Both ages fit in each other's range`)
            console.log(`         - User1 age ${user1Age} in User2's range (${user2Config.minAge || 'any'}-${user2Config.maxAge || 'any'}): ${user1AgeInRange ? '✅' : '❌'}`)
            console.log(`         - User2 age ${user2Age} in User1's range (${user1Config.minAge || 'any'}-${user1Config.maxAge || 'any'}): ${user2AgeInRange ? '✅' : '❌'}`)
            
            if (compatibility.blockers.length > 0) {
              console.log(`\n   ⚠️ WARNING: Found blockers but users matched anyway:`)
              compatibility.blockers.forEach(b => console.log(`      ❌ ${b}`))
            }
          }
        }
        
        // Summary of all matches
        console.log(`\n` + '='.repeat(80))
        console.log(`📊 MATCH SUMMARY`)
        console.log('='.repeat(80))
        console.log(`\n✅ TOTAL MATCHES CREATED: ${matchDetails.length}`)
        for (let i = 0; i < matchDetails.length; i++) {
          const m = matchDetails[i]
          console.log(`\n   Match ${i + 1}: ${m.user1.name} (${m.user1.gender}, age ${m.user1.age}) + ${m.user2.name} (${m.user2.gender}, age ${m.user2.age})`)
          console.log(`   - Match ID: ${m.matchId.substring(0, 8)}...`)
          console.log(`   - Compatibility: ${m.compatibility.reasons.length} factors`)
        }
        
        // Check if all matched users are in matches
        const matchedUserIds = new Set<string>()
        for (const match of dbMatches || []) {
          matchedUserIds.add(match.user1_id)
          matchedUserIds.add(match.user2_id)
        }
        
        const unmatchedUsers = testUsers.filter(u => !matchedUserIds.has(u.userId))
        
        // Detailed analysis of unmatched users
        if (unmatchedUsers.length > 0) {
          console.log('\n' + '='.repeat(80))
          console.log('❌ UNMATCHED USERS ANALYSIS')
          console.log('='.repeat(80))
          
          for (const unmatchedUser of unmatchedUsers) {
            const unmatchedConfig = userIdToConfig.get(unmatchedUser.userId)
            const unmatchedProfile = profileMap.get(unmatchedUser.userId)
            const unmatchedAge = unmatchedProfile?.age ?? unmatchedConfig?.age ?? 25
            console.log(`\n👤 UNMATCHED USER: ${unmatchedUser.name} (${unmatchedUser.gender})`)
            
            if (unmatchedConfig) {
              console.log(`   - Age: ${unmatchedAge} (from database: ${unmatchedProfile?.age ?? 'N/A'}, from config: ${unmatchedConfig.age})`)
              console.log(`   - City: [${unmatchedConfig.city.join(', ')}]`)
              console.log(`   - Prefers: [${unmatchedConfig.cityPref.join(', ')}], age ${unmatchedConfig.minAge}-${unmatchedConfig.maxAge}, ${unmatchedConfig.genderPref}`)
            }
            
            // Check compatibility with all other users (with detailed breakdown)
            const potentialPartners = testUsers.filter(u => u.userId !== unmatchedUser.userId)
            const compatiblePartners: Array<{ user: TestUser; compatibility: ReturnType<typeof checkCompatibility> }> = []
            const incompatiblePartners: Array<{ user: TestUser; compatibility: ReturnType<typeof checkCompatibility> }> = []
            
            for (const partner of potentialPartners) {
              const compatibility = checkCompatibility(unmatchedUser.userId, partner.userId, true) // Include detailed breakdown
              if (compatibility.compatible) {
                compatiblePartners.push({ user: partner, compatibility })
              } else {
                incompatiblePartners.push({ user: partner, compatibility })
              }
            }
            
            console.log(`\n   🔍 COMPATIBILITY CHECK:`)
            console.log(`      ✅ Compatible with ${compatiblePartners.length} users:`)
            for (const { user, compatibility } of compatiblePartners) {
              const partnerProfile = profileMap.get(user.userId)
              const partnerConfig = userIdToConfig.get(user.userId)
              const partnerAge = partnerProfile?.age ?? partnerConfig?.age ?? 25
              console.log(`         - ${user.name} (${user.gender}, age ${partnerAge}):`)
              compatibility.reasons.forEach(r => console.log(`           ${r}`))
            }
            
            if (compatiblePartners.length === 0) {
              console.log(`      ❌ No compatible partners found!`)
              console.log(`\n      🔍 DETAILED COMPATIBILITY ANALYSIS FOR EACH POTENTIAL PARTNER:`)
              // Limit to first 5 incompatible partners to avoid getting stuck
              for (const { user, compatibility } of incompatiblePartners.slice(0, 5)) {
                const partnerProfile = profileMap.get(user.userId)
                const partnerConfig = userIdToConfig.get(user.userId)
                const partnerAge = partnerProfile?.age ?? partnerConfig?.age ?? 25
                const unmatchedProfile = profileMap.get(unmatchedUser.userId)
                const unmatchedConfig = userIdToConfig.get(unmatchedUser.userId)
                const unmatchedAge = unmatchedProfile?.age ?? unmatchedConfig?.age ?? 25
                const partnerPref = preferenceMap.get(user.userId)
                const unmatchedPref = preferenceMap.get(unmatchedUser.userId)
                
                console.log(`\n         ${user.name} (${user.gender}, age ${partnerAge}):`)
                console.log(`           (${unmatchedUser.name} is age ${unmatchedAge})`)
                
                // Show partner's preferences
                console.log(`\n           📋 PARTNER'S PREFERENCES:`)
                console.log(`              - Cities: [${(partnerPref?.city || []).join(', ') || 'none'}]`)
                console.log(`              - Age range: ${partnerPref?.min_age || 'any'}-${partnerPref?.max_age || 'any'}`)
                console.log(`              - Gender: ${partnerPref?.gender || 'any'}`)
                
                // Show unmatched user's preferences
                console.log(`\n           📋 ${unmatchedUser.name.toUpperCase()}'S PREFERENCES:`)
                console.log(`              - Cities: [${(unmatchedPref?.city || []).join(', ') || 'none'}]`)
                console.log(`              - Age range: ${unmatchedPref?.min_age || 'any'}-${unmatchedPref?.max_age || 'any'}`)
                console.log(`              - Gender: ${unmatchedPref?.gender || 'any'}`)
                
                // Show detailed breakdown
                if (compatibility.detailedBreakdown && compatibility.detailedBreakdown.length > 0) {
                  console.log(`\n           🔍 COMPATIBILITY CHECKS (Step-by-step):`)
                  compatibility.detailedBreakdown.forEach((check, idx) => {
                    const icon = check.result ? '✅' : '❌'
                    console.log(`              ${idx + 1}. ${icon} ${check.check}`)
                    console.log(`                 → ${check.details}`)
                  })
                }
                
                console.log(`\n           ❌ BLOCKERS:`)
                if (compatibility.blockers.length === 0) {
                  console.log(`              (No blockers listed, but compatibility check failed)`)
                } else {
                  compatibility.blockers.forEach((b, idx) => console.log(`              ${idx + 1}. ${b}`))
                }
              }
            } else {
              // Check if compatible partners were already matched
              const compatibleButMatched = compatiblePartners.filter(({ user }) => matchedUserIds.has(user.userId))
              const compatibleAndAvailable = compatiblePartners.filter(({ user }) => !matchedUserIds.has(user.userId))
              
              console.log(`\n      📊 COMPATIBLE PARTNERS STATUS:`)
              console.log(`         - Already matched: ${compatibleButMatched.length}`)
              console.log(`         - Available but didn't match: ${compatibleAndAvailable.length}`)
              
              if (compatibleAndAvailable.length > 0) {
                console.log(`\n      ⚠️ CRITICAL ISSUE: Found ${compatibleAndAvailable.length} compatible partners who are also unmatched!`)
                console.log(`         This indicates a matching logic bug - these users should have matched!`)
                for (const { user, compatibility } of compatibleAndAvailable) {
                  const partnerProfile = profileMap.get(user.userId)
                  const partnerConfig = userIdToConfig.get(user.userId)
                  const partnerAge = partnerProfile?.age ?? partnerConfig?.age ?? 25
                  console.log(`         - ${user.name} (${user.gender}, age ${partnerAge}):`)
                  compatibility.reasons.forEach(r => console.log(`           ${r}`))
                  
                  // Check if this partner also considers unmatchedUser compatible
                  const reverseCompatibility = checkCompatibility(user.userId, unmatchedUser.userId)
                  if (reverseCompatibility.compatible) {
                    console.log(`           ✅ REVERSE CHECK: ${user.name} also considers ${unmatchedUser.name} compatible!`)
                    console.log(`           ⚠️ BUG: Both users are compatible but didn't match - this is a matching algorithm issue!`)
                  } else {
                    console.log(`           ❌ REVERSE CHECK: ${user.name} does NOT consider ${unmatchedUser.name} compatible:`)
                    reverseCompatibility.blockers.forEach(b => console.log(`              ${b}`))
                  }
                }
              }
            }
          }
        }
        
        // Validate matching
        console.log('\n' + '='.repeat(80))
        console.log('📊 MATCHING VALIDATION SUMMARY')
        console.log('='.repeat(80))
        
        const validMatches = matchAnalysis.filter(m => m.isValid)
        const invalidMatches = matchAnalysis.filter(m => !m.isValid)
        
        console.log(`\n  ✅ Valid matches: ${validMatches.length}`)
        console.log(`  ⚠️ Invalid matches: ${invalidMatches.length}`)
        console.log(`  ✅ Matched users: ${matchedUserIds.size}/${testUsers.length}`)
        console.log(`  ⚠️ Unmatched users: ${unmatchedUsers.length}`)
        
        if (invalidMatches.length > 0) {
          console.log(`\n  ❌ INVALID MATCHES FOUND:`)
          invalidMatches.forEach(m => {
            console.log(`     - Match ${m.matchId.substring(0, 8)}...: ${m.user1} (${m.gender1}) + ${m.user2} (${m.gender2})`)
          })
        }
        
        // Check for matching logic bugs: compatible but unmatched pairs
        console.log('\n' + '='.repeat(80))
        console.log('🔍 MATCHING LOGIC ANALYSIS')
        console.log('='.repeat(80))
        
        // Find all pairs of unmatched users who are compatible with each other (with detailed breakdown)
        // Limit to avoid performance issues with large numbers of unmatched users
        console.log(`\n  🔍 Checking for compatible unmatched pairs (limited to first 10 unmatched users)...`)
        const compatibleUnmatchedPairs: Array<{ user1: TestUser; user2: TestUser; compatibility: ReturnType<typeof checkCompatibility> }> = []
        const maxUnmatchedToCheck = Math.min(unmatchedUsers.length, 10) // Limit to first 10
        for (let i = 0; i < maxUnmatchedToCheck; i++) {
          for (let j = i + 1; j < maxUnmatchedToCheck; j++) {
            const user1 = unmatchedUsers[i]
            const user2 = unmatchedUsers[j]
            const compatibility = checkCompatibility(user1.userId, user2.userId, true) // Include detailed breakdown
            if (compatibility.compatible) {
              compatibleUnmatchedPairs.push({ user1, user2, compatibility })
            }
          }
        }
        
        if (compatibleUnmatchedPairs.length > 0) {
          console.log(`\n  ⚠️ FOUND ${compatibleUnmatchedPairs.length} COMPATIBLE BUT UNMATCHED PAIRS:`)
          console.log(`     This indicates a matching algorithm bug - these users should have matched!`)
          for (const { user1, user2, compatibility } of compatibleUnmatchedPairs) {
            const user1Profile = profileMap.get(user1.userId)
            const user2Profile = profileMap.get(user2.userId)
            const user1Age = user1Profile?.age ?? userIdToConfig.get(user1.userId)?.age ?? 25
            const user2Age = user2Profile?.age ?? userIdToConfig.get(user2.userId)?.age ?? 25
            console.log(`\n     🔗 ${user1.name} (${user1.gender}, age ${user1Age}) + ${user2.name} (${user2.gender}, age ${user2Age}):`)
            console.log(`        ✅ Compatibility factors:`)
            compatibility.reasons.forEach(r => console.log(`           ${r}`))
            
            if (compatibility.detailedBreakdown && compatibility.detailedBreakdown.length > 0) {
              console.log(`        📋 Detailed breakdown:`)
              compatibility.detailedBreakdown.forEach((check, idx) => {
                const icon = check.result ? '✅' : '❌'
                console.log(`           ${idx + 1}. ${icon} ${check.check}: ${check.details}`)
              })
            }
            
            // Check if they have match history
            const { data: matchHistory } = await supabase
              .from('match_history')
              .select('match_id, created_at')
              .or(`and(user1_id.eq.${user1.userId},user2_id.eq.${user2.userId}),and(user1_id.eq.${user2.userId},user2_id.eq.${user1.userId})`)
            
            if (matchHistory && matchHistory.length > 0) {
              console.log(`        ⚠️ ISSUE: They have match history! This should prevent matching:`)
              matchHistory.forEach(mh => console.log(`           - Match ID: ${mh.match_id.substring(0, 8)}..., Created: ${mh.created_at}`))
            } else {
              console.log(`        ℹ️ No match history - they should be able to match`)
            }
          }
        } else {
          console.log(`\n  ✅ No compatible unmatched pairs found - all unmatched users are incompatible with each other`)
          
          // Show why unmatched users can't match each other
          if (unmatchedUsers.length >= 2) {
            console.log(`\n  🔍 DETAILED ANALYSIS: Why unmatched users can't match each other:`)
            for (let i = 0; i < Math.min(unmatchedUsers.length, 3); i++) {
              for (let j = i + 1; j < Math.min(unmatchedUsers.length, 3); j++) {
                const user1 = unmatchedUsers[i]
                const user2 = unmatchedUsers[j]
                const compatibility = checkCompatibility(user1.userId, user2.userId, true)
                const user1Profile = profileMap.get(user1.userId)
                const user2Profile = profileMap.get(user2.userId)
                const user1Age = user1Profile?.age ?? userIdToConfig.get(user1.userId)?.age ?? 25
                const user2Age = user2Profile?.age ?? userIdToConfig.get(user2.userId)?.age ?? 25
                
                console.log(`\n     ${user1.name} (${user1.gender}, age ${user1Age}) vs ${user2.name} (${user2.gender}, age ${user2Age}):`)
                if (compatibility.detailedBreakdown && compatibility.detailedBreakdown.length > 0) {
                  compatibility.detailedBreakdown.forEach((check, idx) => {
                    const icon = check.result ? '✅' : '❌'
                    console.log(`        ${idx + 1}. ${icon} ${check.check}: ${check.details}`)
                  })
                }
                if (compatibility.blockers.length > 0) {
                  console.log(`        Blockers:`)
                  compatibility.blockers.forEach(b => console.log(`           ❌ ${b}`))
                }
              }
            }
          }
        }
        
        // ============================================================================
        // PLATFORM ISSUE ANALYSIS
        // ============================================================================
        console.log('\n' + '='.repeat(80))
        console.log('🔍 PLATFORM ISSUE ANALYSIS')
        console.log('='.repeat(80))
        
        // Issue 1: Check fairness scores
        const allFairnessZero = userStates?.every(s => s.fairness === 0 || s.fairness === null)
        if (allFairnessZero && unmatchedUsers.length > 0) {
          console.log(`\n⚠️ ISSUE #1: All users have fairness = 0`)
          console.log(`   - Fairness should increase over time to prioritize users who wait longer`)
          console.log(`   - All ${testUsers.length} users have fairness = 0, meaning no fairness prioritization`)
          console.log(`   - This could cause matching to be random rather than fair`)
          console.log(`   - Recommendation: Check if fairness is being calculated/updated correctly`)
        }
        
        // Issue 2: Check if compatible users exist but didn't match
        const matchedUserIdsSet = new Set((dbMatches || []).flatMap(m => [m.user1_id, m.user2_id]))
        const unmatchedMales = unmatchedUsers.filter(u => {
          const profile = profileMap.get(u.userId)
          return profile?.gender === 'male'
        })
        const unmatchedFemales = unmatchedUsers.filter(u => {
          const profile = profileMap.get(u.userId)
          return profile?.gender === 'female'
        })
        
        if (unmatchedMales.length > 0 && unmatchedFemales.length > 0) {
          console.log(`\n⚠️ ISSUE #2: Compatible users exist but didn't match`)
          console.log(`   - Unmatched males: ${unmatchedMales.length}`)
          console.log(`   - Unmatched females: ${unmatchedFemales.length}`)
          console.log(`   - These users should potentially match if they're compatible`)
          
          // Check if any unmatched male-female pairs are compatible
          let compatibleUnmatchedPairs = 0
          for (const male of unmatchedMales.slice(0, 3)) {
            for (const female of unmatchedFemales.slice(0, 3)) {
              const compatibility = checkCompatibility(male.userId, female.userId, false)
              if (compatibility.compatible) {
                compatibleUnmatchedPairs++
                const maleProfile = profileMap.get(male.userId)
                const femaleProfile = profileMap.get(female.userId)
                const maleAge = maleProfile?.age ?? userIdToConfig.get(male.userId)?.age ?? 25
                const femaleAge = femaleProfile?.age ?? userIdToConfig.get(female.userId)?.age ?? 25
                console.log(`\n   🔗 Compatible but unmatched: ${male.name} (age ${maleAge}) + ${female.name} (age ${femaleAge})`)
                compatibility.reasons.forEach(r => console.log(`      ${r}`))
              }
            }
          }
          
          if (compatibleUnmatchedPairs > 0) {
            console.log(`\n   ❌ CRITICAL BUG: Found ${compatibleUnmatchedPairs} compatible unmatched pairs!`)
            console.log(`      These users should have matched but didn't - this is a matching algorithm bug!`)
          }
        }
        
        // Issue 3: Check matching order/fairness (simplified to avoid performance issues)
        if (dbMatches && dbMatches.length > 0 && userStates && spinResults.length > 0) {
          console.log(`\n⚠️ ISSUE #3: Matching order analysis (simplified check)`)
          // Just check if the first user to spin matched
          const firstSpinner = spinResults.sort((a, b) => (a.spinStartTime || 0) - (b.spinStartTime || 0))[0]
          const firstSpinnerMatched = firstSpinner?.matched || false
          
          if (!firstSpinnerMatched && matchedUserIds.size > 0) {
            console.log(`   - First user to spin (${firstSpinner?.user.name}) did NOT match`)
            console.log(`   - But ${matchedUserIds.size} other users did match`)
            console.log(`   - This suggests matching may not prioritize users who spun first`)
          } else if (firstSpinnerMatched) {
            console.log(`   - First user to spin (${firstSpinner?.user.name}) DID match ✅`)
          }
        }
        
        // Issue 4: Check for race conditions (simplified)
        if (spinResults.length > 0) {
          const spinsWithTiming = spinResults.filter(r => r.spinStartTime).length
          const matchedCount = matchedUserIds.size
          if (spinsWithTiming >= 8 && matchedCount < spinsWithTiming / 2) {
            console.log(`\n⚠️ ISSUE #4: Potential race condition with simultaneous spins`)
            console.log(`   - ${spinsWithTiming} users spun, but only ${matchedCount} matched`)
            console.log(`   - This could indicate race conditions preventing matches`)
          }
        }
        
        // Issue 5: Check user states consistency (already checked above, skip duplicate)
        
        // Summary
        console.log(`\n📋 ISSUE SUMMARY:`)
        const firstSpinner = spinResults.length > 0 ? spinResults.sort((a, b) => (a.spinStartTime || 0) - (b.spinStartTime || 0))[0] : null
        const firstSpinnerMatched = firstSpinner?.matched || false
        const matchingOrderIssue = !firstSpinnerMatched && matchedUserIds.size > 0
        const raceConditionIssue = spinResults.length >= 8 && matchedUserIds.size < spinResults.length / 2
        const orphanedMatches = matchedStates ? matchedStates.filter(s => {
          const matchIdsFromMatches = new Set((dbMatches || []).map(m => m.match_id))
          return s.match_id && !matchIdsFromMatches.has(s.match_id)
        }).length : 0
        
        const issuesFound = [
          allFairnessZero && unmatchedUsers.length > 0 ? 'Fairness scores all zero' : null,
          compatibleUnmatchedPairs > 0 ? 'Compatible users not matching' : null,
          matchingOrderIssue ? 'Matching order not fair (first spinner did not match)' : null,
          raceConditionIssue ? 'Potential race conditions' : null,
          orphanedMatches > 0 ? 'State inconsistency (matched state without match record)' : null
        ].filter(Boolean)
        
        if (issuesFound.length === 0) {
          console.log(`   ✅ No issues detected - matching logic appears to be working correctly`)
        } else {
          console.log(`   ⚠️ Found ${issuesFound.length} potential issue(s):`)
          issuesFound.forEach((issue, idx) => console.log(`      ${idx + 1}. ${issue}`))
        }
        
        // Comprehensive final analysis
        console.log('\n' + '='.repeat(80))
        console.log('📊 COMPREHENSIVE ANALYSIS SUMMARY')
        console.log('='.repeat(80))
        
        console.log(`\n👥 USER DISTRIBUTION:`)
        console.log(`   - Total users: ${testUsers.length}`)
        console.log(`   - Males: ${numMales}`)
        console.log(`   - Females: ${numFemales}`)
        console.log(`   - Matched: ${matchedUserIds.size}`)
        console.log(`   - Unmatched: ${unmatchedUsers.length}`)
        
        console.log(`\n🔗 MATCHES CREATED: ${matchDetails.length}`)
        for (let i = 0; i < matchDetails.length; i++) {
          const m = matchDetails[i]
          console.log(`\n   Match ${i + 1}:`)
          console.log(`   ├─ ${m.user1.name} (${m.user1.gender}, age ${m.user1.age})`)
          console.log(`   │  └─ Wants: [${m.user1.cityPref.join(', ')}], age ${m.user1.minAge}-${m.user1.maxAge}, ${m.user1.genderPref}`)
          console.log(`   └─ ${m.user2.name} (${m.user2.gender}, age ${m.user2.age})`)
          console.log(`      └─ Wants: [${m.user2.cityPref.join(', ')}], age ${m.user2.minAge}-${m.user2.maxAge}, ${m.user2.genderPref}`)
          console.log(`   ✅ Match reason: ${m.compatibility.reasons.join('; ')}`)
        }
        
        console.log(`\n❌ UNMATCHED USERS: ${unmatchedUsers.length}`)
        for (const unmatched of unmatchedUsers) {
          const unmatchedProfile = profileMap.get(unmatched.userId)
          const unmatchedConfig = userIdToConfig.get(unmatched.userId)
          const unmatchedAge = unmatchedProfile?.age ?? unmatchedConfig?.age ?? 25
          const unmatchedPref = preferenceMap.get(unmatched.userId)
          
          console.log(`\n   ${unmatched.name} (${unmatched.gender}, age ${unmatchedAge}):`)
          console.log(`   └─ Wants: [${unmatchedPref?.city?.join(', ') || 'any'}], age ${unmatchedPref?.min_age || 'any'}-${unmatchedPref?.max_age || 'any'}, ${unmatchedPref?.gender_preference || 'any'}`)
          
          // Find why they didn't match
          const compatiblePartners = testUsers
            .filter(u => u.userId !== unmatched.userId && !matchedUserIds.has(u.userId))
            .map(u => ({ user: u, compatibility: checkCompatibility(unmatched.userId, u.userId) }))
            .filter(({ compatibility }) => compatibility.compatible)
          
          if (compatiblePartners.length > 0) {
            console.log(`   ⚠️ Has ${compatiblePartners.length} compatible unmatched partner(s) - should have matched!`)
            compatiblePartners.forEach(({ user, compatibility }) => {
              const partnerProfile = profileMap.get(user.userId)
              const partnerAge = partnerProfile?.age ?? userIdToConfig.get(user.userId)?.age ?? 25
              console.log(`      - ${user.name} (${user.gender}, age ${partnerAge}): ${compatibility.reasons.join('; ')}`)
            })
          } else {
            // Check against matched users to see why they didn't match
            const matchedCompatible = testUsers
              .filter(u => u.userId !== unmatched.userId && matchedUserIds.has(u.userId))
              .map(u => ({ user: u, compatibility: checkCompatibility(unmatched.userId, u.userId) }))
              .filter(({ compatibility }) => compatibility.compatible)
            
            if (matchedCompatible.length > 0) {
              console.log(`   ℹ️ Compatible with ${matchedCompatible.length} already-matched user(s) - missed opportunity`)
            } else {
              console.log(`   ℹ️ No compatible partners available (preferences too strict or incompatible)`)
            }
          }
        }
        
        // Final validation
        console.log('\n' + '='.repeat(80))
        console.log('✅ FINAL TEST RESULTS')
        console.log('='.repeat(80))
        
        if (invalidMatches.length > 0) {
          throw new Error(`❌ MATCHING FAILED: Found ${invalidMatches.length} invalid matches (same gender pairs)`)
        }
        
        if (compatibleUnmatchedPairs.length > 0) {
          throw new Error(`❌ MATCHING LOGIC BUG: Found ${compatibleUnmatchedPairs.length} compatible pairs that didn't match! This indicates a bug in the matching algorithm.`)
        }
        
        if (dbMatches && dbMatches.length > 0) {
          console.log(`\n  ✅ Matching is working correctly!`)
          console.log(`  ✅ Created ${dbMatches.length} valid matches`)
          console.log(`  ✅ ${matchedUserIds.size}/${testUsers.length} users matched`)
          
          // Check if we have a reasonable number of matches
          const expectedMinMatches = Math.min(numMales, numFemales)
          if (dbMatches.length < expectedMinMatches) {
            console.warn(`\n  ⚠️ Expected at least ${expectedMinMatches} matches (min of males/females), but got ${dbMatches.length}`)
            console.warn(`     This might be due to incompatible preferences (city/age)`)
            console.warn(`     However, if compatible unmatched pairs exist, this is a matching algorithm bug.`)
          } else {
            console.log(`\n  ✅ Match count is reasonable (${dbMatches.length} matches, expected at least ${expectedMinMatches})`)
          }
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



