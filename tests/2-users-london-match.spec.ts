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

test.describe('2 Users London Match Test', () => {
  let testUsers: TestUser[] = []
  
  test('should match young male with London and young female with London and Midlands, vote yes+yes, and redirect to video date', async ({ browser }) => {
    test.setTimeout(180000) // 3 minutes (includes voting and redirect)
    
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
      console.log('👤 Creating test users...')
      
      // User 1: Young male, 25 years old, London
      const user1 = await createTestUser(
        `test-male-london-${timestamp}@test.com`,
        password,
        'Test Male London',
        'male',
        25 // age
      )
      testUsers.push(user1)
      
      // User 2: Young female, 22 years old, London + Midlands
      const user2 = await createTestUser(
        `test-female-london-midlands-${timestamp}@test.com`,
        password,
        'Test Female London Midlands',
        'female',
        22 // age
      )
      testUsers.push(user2)
      
      console.log('✅ All test users created')
      
      // Update profiles with correct ages
      console.log('⚙️ Updating user profiles with ages...')
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 22 }).eq('id', user2.userId)
      
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
      
      // Verify preferences were saved correctly
      console.log('⏳ Waiting 2 seconds for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const { data: verifyData } = await supabase
        .from('user_preferences')
        .select('user_id, city, min_age, max_age')
        .in('user_id', [user1.userId, user2.userId])
      
      if (verifyData) {
        console.log('✅ Preferences set. Verification:', verifyData.map(v => ({
          userId: v.user_id.substring(0, 8),
          city: v.city,
          cityType: Array.isArray(v.city) ? 'array' : (v.city === null ? 'null' : typeof v.city),
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
      
      const cityStatus = preSpinPrefs.map(p => ({
        userId: p.user_id.substring(0, 8),
        hasCity: p.city && Array.isArray(p.city) && p.city.length > 0 ? `${p.city.length} cities: ${p.city.join(', ')}` : 'NULL (matches anyone)'
      }))
      console.log(`✅ All ${testUsers.length} users have preferences. City status:`, cityStatus)
      
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
      
      // 4. Click Start Spin
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
      
      // Wait for matches to occur
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
      
      // 5. Check matches
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
      if (matchResults.size === 0) {
        throw new Error('❌ ISSUE: No matches found! Users should have matched (London overlap, compatible ages)')
      }
      
      for (const [matchId, userIds] of matchResults.entries()) {
        if (userIds.length === 2) {
          const user1Match = testUsers.find(u => u.userId === userIds[0])
          const user2Match = testUsers.find(u => u.userId === userIds[1])
          
          if (user1Match && user2Match) {
            console.log(`  ✅ Match ${matchId.substring(0, 8)}...:`)
            console.log(`     - ${user1Match.name} (${user1Match.gender})`)
            console.log(`     - ${user2Match.name} (${user2Match.gender})`)
            
            // Verify match is correct
            const hasMale = user1Match.gender === 'male' || user2Match.gender === 'male'
            const hasFemale = user1Match.gender === 'female' || user2Match.gender === 'female'
            
            if (!hasMale || !hasFemale) {
              throw new Error(`❌ ISSUE: Match should be between male and female, but got: ${user1Match.gender} and ${user2Match.gender}`)
            }
            
            console.log(`     ✅ Valid match: Male and Female with London city overlap`)
          }
        } else {
          throw new Error(`❌ ISSUE: Match should have exactly 2 users, but found ${userIds.length}`)
        }
      }
      
      // 6. Both users vote "yes" and check video date redirect
      console.log('\n🗳️ Both users voting "yes"...')
      
      // Wait a bit for voting window to fully load
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Find users in voting window and have them vote
      const votingUsers = contexts.filter(({ page }) => page.url().includes('/voting-window'))
      
      if (votingUsers.length !== 2) {
        throw new Error(`❌ ISSUE: Expected 2 users in voting window, but found ${votingUsers.length}`)
      }
      
      // Both users click "yes" simultaneously
      const voteResults = await Promise.all(votingUsers.map(async ({ page, user }) => {
        try {
          console.log(`  ${user.name}: Looking for "yes" button...`)
          
          // Wait for voting buttons to be visible
          const yesButton = page.getByRole('button', { name: /yes|accept|like/i }).first()
          await expect(yesButton).toBeVisible({ timeout: 10000 })
          
          // Set up response listener for vote API
          const voteResponsePromise = page.waitForResponse(response => 
            response.url().includes('/api/vote') && response.request().method() === 'POST',
            { timeout: 10000 }
          ).catch(() => null)
          
          // Click yes
          await yesButton.click({ force: true })
          console.log(`  ✅ ${user.name} clicked "yes"`)
          
          // Wait for vote API response
          const voteResponse = await voteResponsePromise
          if (voteResponse) {
            const voteData = await voteResponse.json().catch(() => ({}))
            const status = voteResponse.status()
            console.log(`  ${user.name}: Vote API status=${status}, outcome=${voteData.outcome || 'none'}`)
            
            if (status !== 200) {
              const errorText = await voteResponse.text().catch(() => '')
              console.error(`  ❌ ${user.name} vote API error:`, errorText.substring(0, 200))
            }
          }
          
          return { user, voted: true }
        } catch (error: any) {
          console.error(`  ❌ Failed to vote for ${user.name}:`, error.message || error)
          return { user, voted: false, error: error.message }
        }
      }))
      
      // Check if all users voted successfully
      const failedVotes = voteResults.filter(r => !r.voted)
      if (failedVotes.length > 0) {
        throw new Error(`❌ ISSUE: ${failedVotes.length} users failed to vote! ${failedVotes.map(r => r.user.name).join(', ')}`)
      }
      
      // Wait for vote resolution and redirect to video date
      console.log('\n⏳ Waiting for vote resolution and redirect to video date (10 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      // Check if users are redirected to video date
      console.log('🔍 Checking if users are redirected to video date...')
      const videoDateUsers: string[] = []
      const stillVotingUsers: string[] = []
      const unexpectedPages: { user: string; url: string }[] = []
      
      for (const { page, user } of contexts) {
        try {
          const currentUrl = page.url()
          if (currentUrl.includes('/video-date')) {
            console.log(`  ✅ ${user.name} redirected to video-date: ${currentUrl}`)
            videoDateUsers.push(user.name)
          } else if (currentUrl.includes('/voting-window')) {
            console.log(`  ⚠️ ${user.name} still in voting-window: ${currentUrl}`)
            stillVotingUsers.push(user.name)
          } else {
            console.log(`  ⚠️ ${user.name} on unexpected page: ${currentUrl}`)
            unexpectedPages.push({ user: user.name, url: currentUrl })
          }
        } catch (e) {
          console.log(`  ❌ Error checking ${user.name}:`, e)
        }
      }
      
      // Validate results
      console.log('\n📊 VOTE & REDIRECT ANALYSIS:')
      if (videoDateUsers.length === 2) {
        console.log('  ✅ SUCCESS: Both users redirected to video-date page!')
        console.log(`     - ${videoDateUsers.join(' and ')} are in video-date`)
      } else if (videoDateUsers.length === 1) {
        throw new Error(`❌ ISSUE: Only 1 user redirected to video-date (${videoDateUsers[0]}). Both users should be redirected after yes+yes vote!`)
      } else if (stillVotingUsers.length > 0) {
        throw new Error(`❌ ISSUE: ${stillVotingUsers.length} users still in voting-window after yes+yes vote! Users: ${stillVotingUsers.join(', ')}. They should be redirected to video-date.`)
      } else if (unexpectedPages.length > 0) {
        throw new Error(`❌ ISSUE: Users on unexpected pages after yes+yes vote! ${unexpectedPages.map(p => `${p.user}: ${p.url}`).join(', ')}`)
      } else {
        throw new Error(`❌ ISSUE: No users redirected to video-date after yes+yes vote! This indicates a problem with vote resolution or redirect logic.`)
      }
      
      console.log('\n✅ TEST PASSED: Users matched, voted yes+yes, and redirected to video-date correctly!')
      
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


















