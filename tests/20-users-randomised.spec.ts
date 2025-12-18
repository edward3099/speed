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

test.describe('20 Users Randomised Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match 20 random users with random genders, cities, preferences, and votes', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes (20 users need more time)
    
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
    
    // Randomize genders (ensure total is 20)
    const totalUsers = 20
    const numMales = Math.floor(Math.random() * (totalUsers - 2)) + 1 // At least 1 male, at least 1 female
    const numFemales = totalUsers - numMales
    
    console.log(`\n🎲 RANDOMIZATION:`)
    console.log(`   - Total users: ${totalUsers}`)
    console.log(`   - Males: ${numMales}`)
    console.log(`   - Females: ${numFemales}`)
    
    try {
      // 1. Create users with random genders
      console.log('\n👤 Creating 20 test users with random genders...')
      
      for (let i = 0; i < totalUsers; i++) {
        const gender = i < numMales ? 'male' : 'female'
        const age = Math.floor(Math.random() * 11) + 20 // Age 20-30
        const user = await createTestUser(
          `test-${gender}-${i}-${timestamp}@test.com`,
          password,
          `Test ${gender === 'male' ? 'Male' : 'Female'} ${i + 1}`,
          gender as 'male' | 'female',
          age
        )
        testUsers.push(user)
        
        // Update profile with age
        await supabase.from('profiles').update({ age }).eq('id', user.userId)
      }
      
      console.log('✅ All 20 test users created')
      
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
        vote: 'yes' | 'pass'
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
        
        // Random vote (yes or respin)
        const vote = Math.random() > 0.5 ? 'yes' : 'pass'
        
        userConfigs.push({
          userId: user.userId,
          name: user.name,
          gender: user.gender,
          age: user.age || 25,
          city: userCity,
          cityPref,
          minAge,
          maxAge,
          genderPref,
          vote
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
        console.log(`      Will vote: ${config.vote}`)
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
      const contexts: { context: any; page: any; user: TestUser; config: typeof userConfigs[0] }[] = []
      
      for (let i = 0; i < testUsers.length; i++) {
        const user = testUsers[i]
        const config = userConfigs[i]
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user, config })
        
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
      console.log('\n🎰 All 20 users clicking Start Spin simultaneously...')
      const spinResults = await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/spin') && response.request().method() === 'POST',
            { timeout: 15000 }
          ).catch(() => null)
          
          await spinButton.click({ force: true })
          
          const response = await responsePromise
          let responseData: any = {}
          if (response) {
            responseData = await response.json().catch(() => ({}))
            const status = response.status()
            if (status === 200 && responseData.matched) {
              console.log(`  ✅ ${user.name}: Matched immediately (match_id: ${responseData.match_id?.substring(0, 8)}...)`)
            }
          }
          
          try {
            await page.waitForURL(/\/spinning|\/voting-window/, { timeout: 15000 })
            return { user, url: page.url(), matched: responseData.matched, matchId: responseData.match_id }
          } catch {
            return { user, url: page.url(), matched: false, matchId: null }
          }
        } catch (error: any) {
          console.error(`  ❌ Failed to click spin for ${user.name}:`, error.message || error)
          return { user, url: page.url(), matched: false, matchId: null, error: error.message }
        }
      }))
      
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
      
      // Query database directly to see all matches
      console.log('\n🔍 Querying database for all matches...')
      const { data: dbMatches, error: dbError } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id, status, created_at, vote_window_expires_at')
        .gte('created_at', new Date(Date.now() - 120000).toISOString()) // Matches created in last 2 minutes
        .order('created_at', { ascending: false })
      
      if (dbError) {
        console.warn(`  ⚠️ Error querying matches: ${dbError.message}`)
      } else {
        console.log(`  📊 Found ${dbMatches?.length || 0} matches in database`)
        
        // Map user IDs to names
        const userIdToName = new Map(testUsers.map(u => [u.userId, u.name]))
        
        for (const match of dbMatches || []) {
          const user1Name = userIdToName.get(match.user1_id) || 'Unknown'
          const user2Name = userIdToName.get(match.user2_id) || 'Unknown'
          const expiresAt = match.vote_window_expires_at ? new Date(match.vote_window_expires_at).toISOString() : 'N/A'
          console.log(`  📋 Match ${match.match_id.substring(0, 8)}...: ${user1Name} + ${user2Name} (status: ${match.status}, expires: ${expiresAt})`)
        }
      }
      
      // Check user states
      console.log('\n🔍 Checking user states after wait...')
      const votingWindowUsers: typeof contexts = []
      const spinningUsers: typeof contexts = []
      const otherUsers: typeof contexts = []
      
      for (const ctx of contexts) {
        try {
          const currentUrl = ctx.page.url()
          if (currentUrl.includes('/voting-window')) {
            votingWindowUsers.push(ctx)
          } else if (currentUrl.includes('/spinning')) {
            spinningUsers.push(ctx)
          } else {
            otherUsers.push(ctx)
          }
        } catch (e) {
          console.log(`  ❌ Error checking ${ctx.user.name}:`, e)
        }
      }
      
      console.log(`  📊 Users in voting-window: ${votingWindowUsers.length}`)
      console.log(`  📊 Users still spinning: ${spinningUsers.length}`)
      if (otherUsers.length > 0) {
        console.log(`  ⚠️ Users on other pages: ${otherUsers.length}`)
        otherUsers.forEach(ctx => console.log(`     - ${ctx.user.name}: ${ctx.page.url()}`))
      }
      
      // 5. Collect all matches from URLs
      console.log('\n📊 Collecting match information from URLs...')
      const matchResults: Map<string, typeof contexts> = new Map() // matchId -> contexts
      
      for (const ctx of votingWindowUsers) {
        const url = ctx.page.url()
        const matchIdMatch = url.match(/matchId=([^&]+)/)
        if (matchIdMatch) {
          const matchId = matchIdMatch[1]
          if (!matchResults.has(matchId)) {
            matchResults.set(matchId, [])
          }
          matchResults.get(matchId)!.push(ctx)
        }
      }
      
      console.log(`\n📈 MATCH ANALYSIS FROM URLS:`)
      console.log(`  ✅ Found ${matchResults.size} matches in voting-window URLs`)
      
      for (const [matchId, matchUsers] of matchResults.entries()) {
        if (matchUsers.length === 2) {
          const user1 = matchUsers[0].user
          const user2 = matchUsers[1].user
          const hasMale = user1.gender === 'male' || user2.gender === 'male'
          const hasFemale = user1.gender === 'female' || user2.gender === 'female'
          
          console.log(`  ✅ Match ${matchId.substring(0, 8)}...: ${user1.name} (${user1.gender}) + ${user2.name} (${user2.gender})`)
          
          if (!hasMale || !hasFemale) {
            console.warn(`     ⚠️ WARNING: Match should be male+female, but got: ${user1.gender}+${user2.gender}`)
          }
        } else {
          console.warn(`  ⚠️ Match ${matchId.substring(0, 8)}... has ${matchUsers.length} users (expected 2): ${matchUsers.map(u => u.user.name).join(', ')}`)
        }
      }
      
      // Compare matches from spin vs database vs URLs
      console.log(`\n📊 MATCH COMPARISON:`)
      console.log(`  - Matches from spin responses: ${matchesFromSpin.size}`)
      console.log(`  - Matches in database: ${dbMatches?.length || 0}`)
      console.log(`  - Matches in voting-window URLs: ${matchResults.size}`)
      
      if (matchesFromSpin.size !== (dbMatches?.length || 0)) {
        console.warn(`  ⚠️ MISMATCH: Spin responses show ${matchesFromSpin.size} matches but database shows ${dbMatches?.length || 0}`)
      }
      
      // 6. All users vote (random yes or respin)
      console.log('\n🗳️ All users voting (random yes or respin)...')
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const voteResults = await Promise.all(votingWindowUsers.map(async (ctx) => {
        try {
          const { page, user, config } = ctx
          const voteType = config.vote
          
          console.log(`  ${user.name}: Voting "${voteType}"...`)
          
          let button
          if (voteType === 'yes') {
            button = page.getByRole('button', { name: /yes|accept|like/i }).first()
          } else {
            button = page.getByRole('button', { name: /respin|pass/i }).first()
          }
          
          await expect(button).toBeVisible({ timeout: 10000 })
          
          const voteResponsePromise = page.waitForResponse(response => 
            response.url().includes('/api/vote') && response.request().method() === 'POST',
            { timeout: 10000 }
          ).catch(() => null)
          
          await button.click({ force: true })
          console.log(`  ✅ ${user.name} clicked "${voteType}"`)
          
          const voteResponse = await voteResponsePromise
          if (voteResponse) {
            const voteData = await voteResponse.json().catch(() => ({}))
            const status = voteResponse.status()
            if (voteData.outcome) {
              console.log(`     ${user.name}: Outcome = ${voteData.outcome}`)
            }
          }
          
          return { user, voted: true, voteType }
        } catch (error: any) {
          console.error(`  ❌ Failed to vote for ${ctx.user.name}:`, error.message || error)
          return { user: ctx.user, voted: false, error: error.message }
        }
      }))
      
      const failedVotes = voteResults.filter(r => !r.voted)
      if (failedVotes.length > 0) {
        console.warn(`  ⚠️ ${failedVotes.length} users failed to vote: ${failedVotes.map(r => r.user.name).join(', ')}`)
      }
      
      // Wait for vote resolution
      console.log('\n⏳ Waiting for vote resolution and redirects (15 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 15000))
      
      // 7. Check final states
      console.log('\n🔍 Checking final user states...')
      const finalStates = {
        spinning: [] as string[],
        videoDate: [] as string[],
        votingWindow: [] as string[],
        other: [] as Array<{ name: string; url: string }>
      }
      
      for (const ctx of contexts) {
        try {
          const currentUrl = ctx.page.url()
          if (currentUrl.includes('/spinning')) {
            finalStates.spinning.push(ctx.user.name)
          } else if (currentUrl.includes('/video-date')) {
            finalStates.videoDate.push(ctx.user.name)
          } else if (currentUrl.includes('/voting-window')) {
            finalStates.votingWindow.push(ctx.user.name)
          } else {
            finalStates.other.push({ name: ctx.user.name, url: currentUrl })
          }
        } catch (e) {
          console.log(`  ❌ Error checking ${ctx.user.name}:`, e)
        }
      }
      
      console.log('\n📊 FINAL STATE ANALYSIS:')
      console.log(`  ✅ Users in spinning: ${finalStates.spinning.length}`)
      console.log(`  ✅ Users in video-date: ${finalStates.videoDate.length}`)
      if (finalStates.votingWindow.length > 0) {
        console.log(`  ⚠️ Users still in voting-window: ${finalStates.votingWindow.length}`)
      }
      if (finalStates.other.length > 0) {
        console.log(`  ⚠️ Users on other pages: ${finalStates.other.length}`)
        finalStates.other.forEach(p => console.log(`     - ${p.name}: ${p.url}`))
      }
      
      // Validate: All users should be in spinning or video-date (not stuck in voting-window)
      if (finalStates.votingWindow.length > 0) {
        throw new Error(`❌ ISSUE: ${finalStates.votingWindow.length} users still in voting-window! They should have been redirected. Users: ${finalStates.votingWindow.join(', ')}`)
      }
      
      // Validate: Matches should have been created
      if (matchResults.size === 0) {
        throw new Error('❌ ISSUE: No matches found! Users should have matched.')
      }
      
      // Validate: At least some users should be in video-date (yes+yes matches) or spinning (other outcomes)
      const totalProcessed = finalStates.spinning.length + finalStates.videoDate.length
      if (totalProcessed < testUsers.length * 0.8) {
        throw new Error(`❌ ISSUE: Only ${totalProcessed}/${testUsers.length} users processed (expected at least 80%). This indicates matches/votes may not have completed.`)
      }
      
      console.log('\n✅ TEST PASSED: 20 users matched, voted randomly, and redirected correctly!')
      console.log(`   - ${matchResults.size} matches created`)
      console.log(`   - ${finalStates.videoDate.length} users in video-date (yes+yes matches)`)
      console.log(`   - ${finalStates.spinning.length} users in spinning (other outcomes)`)
      
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



