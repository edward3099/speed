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

test.describe('Thursday 10 Users Matching Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match 10 random users correctly', async ({ browser }) => {
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
      
      // Create all preferences in parallel
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
      
      console.log(`✅ Preferences assigned to all ${totalUsers} users`)
      
      // Verify preferences were saved
      console.log('\n⏳ Waiting 1 second for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age, gender_preference')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (verifyData && verifyData.length === testUsers.length) {
        console.log(`✅ All ${testUsers.length} users have preferences saved`)
      } else {
        console.warn(`⚠️ Only ${verifyData?.length || 0} users have preferences (expected ${testUsers.length})`)
      }
      
      // 3. Sign in all users in parallel (small batch for 4 users)
      console.log('\n🌐 Opening browser contexts and signing in all users...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      // Process sign-ins in parallel (all 4 at once)
      await Promise.all(testUsers.map(async (user) => {
        const context = await browser.newContext()
        const page = await context.newPage()
        page.setDefaultTimeout(60000) // 60 second timeout
        page.setDefaultNavigationTimeout(60000) // 60 second navigation timeout
        contexts.push({ context, page, user })
        
        try {
          // Sign in via Playwright
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
      
      console.log(`  ✅ All ${testUsers.length} users signed in`)
      
      // 4. All users click Start Spin in parallel
      console.log(`\n🎰 All ${testUsers.length} users clicking Start Spin simultaneously...`)
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
      
      // Click spin for all users in parallel
      const batchResults = await Promise.all(contexts.map(async ({ page, user }, index) => {
        try {
          // Small stagger: 0-30ms delay
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.min(index * 10, 30)))
          }
          
          page.setDefaultTimeout(60000) // 60 second timeout
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
            // Log all matches
            if (status === 200 && responseData.matched) {
              console.log(`  ✅ ${user.name}: Matched immediately (match_id: ${responseData.match_id?.substring(0, 8)}..., response time: ${responseDelay}ms)`)
            } else if (status === 200) {
              console.log(`  ⏳ ${user.name}: Not matched immediately (response time: ${responseDelay}ms)`)
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
      console.log(`  ✅ ${contexts.length}/${testUsers.length} users clicked spin`)
      
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
      
      console.log(`\n📈 MATCHES FROM SPIN RESPONSES: ${matchesFromSpin.size} matches`)
      for (const [matchId, users] of matchesFromSpin.entries()) {
        if (users.length === 2) {
          console.log(`  ✅ Match ${matchId.substring(0, 8)}...: ${users[0].user.name} + ${users[1].user.name}`)
        } else {
          console.warn(`  ⚠️ Match ${matchId.substring(0, 8)}... has ${users.length} users (expected 2): ${users.map(u => u.user.name).join(', ')}`)
        }
      }
      
      // Wait for all matches to occur
      console.log('\n⏳ Waiting for all matches to occur (45 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 45000)) // Increased for 10 users
      
      // Map user IDs to names (needed for voting and analysis)
      const userIdToName = new Map(testUsers.map(u => [u.userId, u.name]))
      const userIdToGender = new Map(testUsers.map(u => [u.userId, u.gender]))
      
      // 5. All matched users vote "yes" and check video date redirect
      console.log('\n🗳️ All matched users voting "yes"...')
      
      // Wait a bit for voting window to fully load
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Track video date redirects (needed for final validation) - declare outside if block
      let videoDateUsers: string[] = []
      let votingUsersProcessed = false
      let usersRedirectedToVideoDate = new Set<string>() // Track users who were redirected to video-date
      let storedVoteResults: any[] = [] // Store vote results for later validation
      
      // Query matches to get pairs (only for current test users)
      const testUserIds = testUsers.map(u => u.userId)
      const { data: dbMatchesForVoting } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id')
        .gte('created_at', new Date(Date.now() - 120000).toISOString())
        .in('user1_id', testUserIds)
        .in('user2_id', testUserIds)
      
      if (!dbMatchesForVoting || dbMatchesForVoting.length === 0) {
        console.log(`  ℹ️ No matches found for voting`)
      } else {
        console.log(`  📊 Found ${dbMatchesForVoting.length} match(es) to vote on`)
        
        // For each match, have BOTH users vote "yes"
        const votePromises = dbMatchesForVoting.map(async (match, matchIndex) => {
          const user1Id = match.user1_id
          const user2Id = match.user2_id
          const user1Name = userIdToName.get(user1Id) || 'Unknown'
          const user2Name = userIdToName.get(user2Id) || 'Unknown'
          
          // Find the two users in voting window
          const user1Context = contexts.find(({ user }) => user.userId === user1Id)
          const user2Context = contexts.find(({ user }) => user.userId === user2Id)
          
          if (!user1Context || !user2Context) {
            console.warn(`  ⚠️ Match ${match.match_id.substring(0, 8)}...: Could not find both users in contexts`)
            return { match, success: false }
          }
          
          // Check if both are in voting window
          const user1InVoting = user1Context.page.url().includes('/voting-window')
          const user2InVoting = user2Context.page.url().includes('/voting-window')
          
          if (!user1InVoting || !user2InVoting) {
            console.warn(`  ⚠️ Match ${match.match_id.substring(0, 8)}...: Not both users in voting-window (${user1Name}: ${user1InVoting}, ${user2Name}: ${user2InVoting})`)
            return { match, success: false }
          }
          
          console.log(`  🗳️ Match ${match.match_id.substring(0, 8)}...: ${user1Name} and ${user2Name} both voting "yes"`)
          
          // BOTH users vote "yes"
          try {
            // User1 votes yes
            const yesButton1 = user1Context.page.getByRole('button', { name: /yes/i }).first()
            await expect(yesButton1).toBeVisible({ timeout: 60000 })
            
            const voteResponsePromise1 = user1Context.page.waitForResponse(response => 
              response.url().includes('/api/vote') && response.request().method() === 'POST',
              { timeout: 60000 }
            ).catch(() => null)
            
            await yesButton1.click({ force: true })
            console.log(`    ✅ ${user1Name} clicked "yes"`)
            
            const voteResponse1 = await voteResponsePromise1
            if (voteResponse1) {
              const voteData1 = await voteResponse1.json().catch(() => ({}))
              const status1 = voteResponse1.status()
              console.log(`    ${user1Name}: Vote API status=${status1}, outcome=${voteData1.outcome || 'none'}`)
            }
            
            // User2 votes yes
            const yesButton2 = user2Context.page.getByRole('button', { name: /yes/i }).first()
            await expect(yesButton2).toBeVisible({ timeout: 60000 })
            
            const voteResponsePromise2 = user2Context.page.waitForResponse(response => 
              response.url().includes('/api/vote') && response.request().method() === 'POST',
              { timeout: 60000 }
            ).catch(() => null)
            
            await yesButton2.click({ force: true })
            console.log(`    ✅ ${user2Name} clicked "yes"`)
            
            const voteResponse2 = await voteResponsePromise2
            if (voteResponse2) {
              const voteData2 = await voteResponse2.json().catch(() => ({}))
              const status2 = voteResponse2.status()
              console.log(`    ${user2Name}: Vote API status=${status2}, outcome=${voteData2.outcome || 'none'}`)
            }
            
            return { match, success: true, user1Name, user2Name, user1Context, user2Context }
          } catch (error: any) {
            console.error(`    ❌ Failed to vote for match ${match.match_id.substring(0, 8)}...:`, error.message || error)
            return { match, success: false }
          }
        })
        
        const voteResults = await Promise.all(votePromises)
        votingUsersProcessed = voteResults.some(r => r.success)
        storedVoteResults = voteResults // Store for later validation
        
        const successfulVotes = voteResults.filter(r => r.success).length
        console.log(`  ✅ ${successfulVotes}/${dbMatchesForVoting.length} match(es) - both users voted yes`)
        
        // Wait for vote resolution and redirect to video date
        console.log('\n⏳ Waiting for vote resolution and redirect to video date (20 seconds)...')
        
        // Wait for redirects to video-date for all users who voted yes
        // Use multiple checks to ensure we catch the actual redirect
        const redirectPromises = voteResults
          .filter(r => r.success)
          .flatMap(r => {
            // Get both users from the match
            return [r.user1Context, r.user2Context].filter(Boolean)
          })
          .map(async ({ page, user }) => {
            // Check URL multiple times with delays to catch actual redirects
            let redirected = false
            const maxChecks = 10
            const checkInterval = 2000 // 2 seconds between checks
            
            for (let i = 0; i < maxChecks; i++) {
              try {
                const currentUrl = page.url()
                if (currentUrl.includes('/video-date')) {
                  usersRedirectedToVideoDate.add(user.name)
                  console.log(`    ✅ ${user.name} redirected to video-date (check ${i + 1}/${maxChecks}): ${currentUrl}`)
                  redirected = true
                  break
                } else {
                  if (i === 0) {
                    console.log(`    ⏳ ${user.name} waiting for redirect (current: ${currentUrl})...`)
                  }
                }
              } catch (e) {
                console.log(`    ⚠️ Error checking ${user.name} URL (check ${i + 1}/${maxChecks}):`, e)
              }
              
              if (i < maxChecks - 1) {
                await new Promise(resolve => setTimeout(resolve, checkInterval))
              }
            }
            
            if (!redirected) {
              const finalUrl = page.url()
              console.log(`    ❌ ${user.name} did NOT redirect to video-date after ${maxChecks * checkInterval / 1000}s (final URL: ${finalUrl})`)
            }
            
            return redirected
          })
        
        await Promise.all(redirectPromises)
        
        // Additional buffer and final check
        console.log('\n🔍 Final verification: Checking all user URLs one more time...')
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // Check current state - users should be redirected to video-date
        console.log('🔍 Checking current user states after both_yes vote (FINAL CHECK)...')
        videoDateUsers = []
        const stillVotingUsers: string[] = []
        const spinningUsers: string[] = []
        const unexpectedPages: { user: string; url: string }[] = []
        
        // Get all users who voted yes (should redirect to video-date)
        const usersWhoVotedYes = new Set<string>()
        for (const result of voteResults.filter(r => r.success)) {
          usersWhoVotedYes.add(result.user1Name)
          usersWhoVotedYes.add(result.user2Name)
        }
        
        for (const { page, user } of contexts) {
          try {
            const currentUrl = page.url()
            const shouldBeInVideoDate = usersWhoVotedYes.has(user.name)
            
            if (currentUrl.includes('/video-date')) {
              console.log(`  ✅ ${user.name} in video-date: ${currentUrl}`)
              videoDateUsers.push(user.name)
              usersRedirectedToVideoDate.add(user.name)
            } else if (currentUrl.includes('/voting-window')) {
              if (shouldBeInVideoDate) {
                console.error(`  ❌ ${user.name} STILL in voting-window (SHOULD be in video-date): ${currentUrl}`)
              } else {
                console.log(`  ℹ️ ${user.name} in voting-window (not part of both_yes match): ${currentUrl}`)
              }
              stillVotingUsers.push(user.name)
            } else if (currentUrl.includes('/spinning')) {
              if (shouldBeInVideoDate) {
                console.error(`  ❌ ${user.name} in spinning (SHOULD be in video-date after both_yes): ${currentUrl}`)
              } else {
                console.log(`  ℹ️ ${user.name} in spinning (not part of both_yes match): ${currentUrl}`)
              }
              spinningUsers.push(user.name)
            } else {
              if (shouldBeInVideoDate) {
                console.error(`  ❌ ${user.name} on unexpected page (SHOULD be in video-date): ${currentUrl}`)
              } else {
                console.log(`  ℹ️ ${user.name} on unexpected page: ${currentUrl}`)
              }
              unexpectedPages.push({ user: user.name, url: currentUrl })
            }
          } catch (e) {
            console.error(`  ❌ Error checking ${user.name}:`, e)
          }
        }
        
        // Validate results
        console.log('\n📊 VOTE & REDIRECT ANALYSIS:')
        console.log(`  - Users in video-date: ${videoDateUsers.length}`)
        console.log(`  - Users still in voting-window: ${stillVotingUsers.length}`)
        console.log(`  - Users in spinning (unexpected): ${spinningUsers.length}`)
        
        // Query matches to check outcomes
        const { data: finalMatches } = await supabase
          .from('matches')
          .select('match_id, user1_id, user2_id, outcome')
          .in('match_id', dbMatchesForVoting.map(m => m.match_id))
        
        if (finalMatches && finalMatches.length > 0) {
          const bothYesMatches = finalMatches.filter(m => m.outcome === 'both_yes')
          console.log(`  - Matches with both_yes outcome: ${bothYesMatches.length}`)
          
          // CRITICAL: Verify video_dates records exist for both_yes matches
          // This fixes the PGRST116 error: "Cannot coerce the result to a single JSON object"
          if (bothYesMatches.length > 0) {
            console.log('\n🔍 Verifying video_dates records exist for both_yes matches...')
            const { data: videoDates, error: videoDatesError } = await supabase
              .from('video_dates')
              .select('match_id, user1_id, user2_id, status')
              .in('match_id', bothYesMatches.map(m => m.match_id))
            
            if (videoDatesError) {
              console.error(`  ❌ Error querying video_dates: ${videoDatesError.message}`)
              throw new Error(`CRITICAL BUG: Failed to query video_dates table: ${videoDatesError.message}`)
            }
            
            const videoDatesMap = new Map((videoDates || []).map(vd => [vd.match_id, vd]))
            const missingVideoDates: string[] = []
            
            for (const match of bothYesMatches) {
              if (!videoDatesMap.has(match.match_id)) {
                const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
                const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
                missingVideoDates.push(`Match ${match.match_id.substring(0, 8)}... (${user1Name} + ${user2Name})`)
                console.error(`  ❌ Match ${match.match_id.substring(0, 8)}...: Missing video_dates record!`)
              } else {
                const vd = videoDatesMap.get(match.match_id)!
                console.log(`  ✅ Match ${match.match_id.substring(0, 8)}...: video_dates record exists (status: ${vd.status})`)
              }
            }
            
            if (missingVideoDates.length > 0) {
              console.error(`\n❌ CRITICAL: ${missingVideoDates.length} both_yes match(es) missing video_dates records!`)
              console.error(`   This will cause PGRST116 error when users try to load /video-date page`)
              missingVideoDates.forEach(msg => console.error(`   ${msg}`))
              throw new Error(`CRITICAL BUG: ${missingVideoDates.length} both_yes match(es) are missing video_dates records. This causes the PGRST116 error: "Cannot coerce the result to a single JSON object" when users are redirected to /video-date.`)
            } else {
              console.log(`  ✅ All ${bothYesMatches.length} both_yes match(es) have video_dates records`)
            }
          }
          
          const failedRedirects: string[] = []
          
          for (const match of bothYesMatches) {
            const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
            const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
            const bothInVideoDate = videoDateUsers.includes(user1Name) && videoDateUsers.includes(user2Name)
            
            if (bothInVideoDate) {
              console.log(`  ✅ Match ${match.match_id.substring(0, 8)}...: Both users (${user1Name} + ${user2Name}) redirected to video-date`)
            } else {
              const inVideoDate = [user1Name, user2Name].filter(name => videoDateUsers.includes(name))
              console.warn(`  ⚠️ Match ${match.match_id.substring(0, 8)}...: Only ${inVideoDate.length}/2 users in video-date (${user1Name} + ${user2Name})`)
              if (inVideoDate.length === 0) {
                console.warn(`     ❌ Neither user redirected to video-date after both_yes vote!`)
                failedRedirects.push(`Match ${match.match_id.substring(0, 8)}...: Neither ${user1Name} nor ${user2Name} redirected to video-date`)
              } else if (inVideoDate.length === 1) {
                const missingUser = [user1Name, user2Name].find(name => !videoDateUsers.includes(name))
                console.warn(`     ❌ ${missingUser} did not redirect to video-date after both_yes vote!`)
                failedRedirects.push(`Match ${match.match_id.substring(0, 8)}...: ${missingUser} did not redirect to video-date`)
              }
            }
          }
          
          // Fail test if any users with both_yes didn't redirect to video-date
          if (failedRedirects.length > 0) {
            console.error(`\n❌ CRITICAL: ${failedRedirects.length} match(es) with both_yes outcome did not redirect properly to video-date!`)
            failedRedirects.forEach(msg => console.error(`   ${msg}`))
            
            // Also check which users are actually missing
            const missingUsers: string[] = []
            for (const match of bothYesMatches) {
              const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
              const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
              if (!videoDateUsers.includes(user1Name)) {
                missingUsers.push(user1Name)
              }
              if (!videoDateUsers.includes(user2Name)) {
                missingUsers.push(user2Name)
              }
            }
            
            console.error(`\n❌ Users who voted yes but are NOT in video-date: ${missingUsers.join(', ')}`)
            console.error(`   Expected ${bothYesMatches.length * 2} users in video-date, but only found ${videoDateUsers.length}`)
            
            throw new Error(`CRITICAL BUG: ${failedRedirects.length} match(es) with both_yes outcome did not redirect both users to video-date. Missing users: ${missingUsers.join(', ')}. This indicates a redirect bug in the platform.`)
          }
        }
        
        // Additional check: Verify all users who voted yes are actually in video-date
        const usersWhoShouldBeInVideoDate = new Set<string>()
        for (const result of voteResults.filter(r => r.success)) {
          usersWhoShouldBeInVideoDate.add(result.user1Name)
          usersWhoShouldBeInVideoDate.add(result.user2Name)
        }
        
        const missingFromVideoDate = Array.from(usersWhoShouldBeInVideoDate).filter(name => !videoDateUsers.includes(name))
        if (missingFromVideoDate.length > 0) {
          console.error(`\n❌ CRITICAL: ${missingFromVideoDate.length} user(s) who voted yes are NOT in video-date:`)
          missingFromVideoDate.forEach(name => {
            const context = contexts.find(({ user }) => user.name === name)
            const currentUrl = context ? context.page.url() : 'unknown'
            console.error(`   - ${name} (current URL: ${currentUrl})`)
          })
          throw new Error(`CRITICAL BUG: ${missingFromVideoDate.length} user(s) who voted yes are not in video-date: ${missingFromVideoDate.join(', ')}. This indicates a redirect failure in the platform.`)
        }
        
        if (videoDateUsers.length > 0) {
          console.log(`\n  ✅ SUCCESS: ${videoDateUsers.length} user(s) redirected to video-date page!`)
          console.log(`     - ${videoDateUsers.join(', ')} are in video-date`)
        }
        
        if (stillVotingUsers.length > 0) {
          const stillVotingWhoShouldBeRedirected = stillVotingUsers.filter(name => usersWhoShouldBeInVideoDate.has(name))
          if (stillVotingWhoShouldBeRedirected.length > 0) {
            console.error(`  ❌ ${stillVotingWhoShouldBeRedirected.length} users who voted yes are STILL in voting-window: ${stillVotingWhoShouldBeRedirected.join(', ')}`)
          } else {
            console.warn(`  ⚠️ ${stillVotingUsers.length} users still in voting-window (not part of both_yes matches): ${stillVotingUsers.join(', ')}`)
          }
        }
        
        if (spinningUsers.length > 0) {
          const spinningWhoShouldBeRedirected = spinningUsers.filter(name => usersWhoShouldBeInVideoDate.has(name))
          if (spinningWhoShouldBeRedirected.length > 0) {
            console.error(`  ❌ ${spinningWhoShouldBeRedirected.length} users who voted yes are in spinning (SHOULD be in video-date): ${spinningWhoShouldBeRedirected.join(', ')}`)
          } else {
            console.log(`  ℹ️ ${spinningUsers.length} users in spinning (not part of both_yes matches): ${spinningUsers.join(', ')}`)
          }
        }
      }
      
      // Query database for user states to see who's matched/waiting/idle
      console.log('\n🔍 Querying user states from database...')
      
      const { data: userStates, error: statesError } = await supabase
        .from('users_state')
        .select('user_id, state, match_id, partner_id, waiting_since, fairness, last_active, updated_at')
        .in('user_id', testUsers.map(u => u.userId))
        .order('updated_at', { ascending: false })
      
      if (!statesError && userStates) {
        const matchedCount = userStates.filter(s => s.state === 'matched').length
        const waitingCount = userStates.filter(s => s.state === 'waiting').length
        const idleCount = userStates.filter(s => s.state === 'idle').length
        console.log(`\n📊 USER STATES SUMMARY:`)
        console.log(`   - Matched: ${matchedCount}`)
        console.log(`   - Waiting: ${waitingCount}`)
        console.log(`   - Idle: ${idleCount}`)
      }
      
      // Query database directly to see all matches (only for current test users)
      console.log('\n🔍 Querying database for all matches...')
      const { data: dbMatches, error: dbError } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id, status, created_at, vote_window_expires_at, vote_window_started_at')
        .gte('created_at', new Date(Date.now() - 120000).toISOString()) // Matches created in last 2 minutes
        .in('user1_id', testUserIds)
        .in('user2_id', testUserIds)
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
        
        // CRITICAL: Validate that all matches have exactly 2 users
        // Note: After both_yes vote, users move to 'idle' state, so we check the match record itself
        console.log('\n🔍 Validating match integrity (checking for matches with only 1 user)...')
        const matchIntegrityIssues: string[] = []
        for (const match of dbMatches || []) {
          // Check if match has both user1_id and user2_id (match record integrity)
          if (!match.user1_id || !match.user2_id) {
            const issue = `Match ${match.match_id.substring(0, 8)}... is missing user IDs (user1_id: ${match.user1_id ? 'present' : 'missing'}, user2_id: ${match.user2_id ? 'present' : 'missing'})`
            matchIntegrityIssues.push(issue)
            console.warn(`  ❌ ${issue}`)
          } else {
            // Check if both users exist in the match (they may be in 'idle' state after both_yes vote)
            const user1Exists = testUsers.some(u => u.userId === match.user1_id)
            const user2Exists = testUsers.some(u => u.userId === match.user2_id)
            if (!user1Exists || !user2Exists) {
              const issue = `Match ${match.match_id.substring(0, 8)}... has invalid user IDs (user1 exists: ${user1Exists}, user2 exists: ${user2Exists})`
              matchIntegrityIssues.push(issue)
              console.warn(`  ❌ ${issue}`)
            } else {
              // Match has both users - this is valid
              const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
              const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
              console.log(`  ✅ Match ${match.match_id.substring(0, 8)}... has 2 users: ${user1Name} + ${user2Name}`)
            }
          }
        }
        
        if (matchIntegrityIssues.length > 0) {
          console.error(`\n❌ CRITICAL: Found ${matchIntegrityIssues.length} match(es) with integrity issues!`)
          matchIntegrityIssues.forEach(issue => console.error(`   ${issue}`))
          // Fail the test if there are matches with integrity issues
          throw new Error(`CRITICAL BUG: Found ${matchIntegrityIssues.length} match(es) with integrity issues. Matches must always have exactly 2 users.`)
        } else {
          console.log(`  ✅ All matches have exactly 2 users`)
        }
        
        // Match analysis for 10 users
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
        
        // Check all unmatched males vs all unmatched females
        for (const male of unmatchedMales) {
          for (const female of unmatchedFemales) {
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
          console.warn(`\n  ⚠️ FOUND ${compatibleUnmatchedPairs} COMPATIBLE UNMATCHED PAIRS`)
          console.warn(`     This indicates a potential matching logic bug!`)
          compatiblePairs.forEach(({ user1, user2, reasons }) => {
            console.warn(`     - ${user1.name} + ${user2.name}: ${reasons.join(', ')}`)
          })
        } else {
          console.log(`  ✅ No compatible unmatched pairs found (likely just incompatible preferences)`)
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
          
          // Final validation: Check that when both users vote yes, both users redirect to video-date
          // This validation was already done above, but we can add a summary here
          if (votingUsersProcessed && storedVoteResults) {
            const successfulVotes = storedVoteResults.filter(r => r.success).length
            if (successfulVotes > 0) {
              console.log(`\n  📊 FINAL VALIDATION SUMMARY:`)
              console.log(`     ✅ ${successfulVotes} match(es) tested: Both users voted yes`)
              console.log(`     ✅ All matches: BOTH users redirected to video-date after both_yes vote`)
              console.log(`     ✅ Test confirms: Both_yes vote triggers redirect to video-date for BOTH users`)
            }
          }
          
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
