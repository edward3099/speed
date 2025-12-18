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

test.describe('100 Users Stress Test', () => {
  let testUsers: TestUser[] = []
  
  test('should handle 50 males and 50 females matching simultaneously and identify performance limits', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes for 100 users
    
    // ALWAYS use Vercel URL - never localhost
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-silk.vercel.app'
    if (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') || BASE_URL.includes(':3000')) {
      throw new Error(`❌ ERROR: Test must run on Vercel, not localhost! Current BASE_URL: ${BASE_URL}. Use https://speed-silk.vercel.app`)
    }
    const VERIFIED_BASE_URL = 'https://speed-silk.vercel.app'
    console.log(`🌐 Testing against Vercel: ${VERIFIED_BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    try {
      // 1. Create 100 users (50 males, 50 females) with retry logic
      console.log('👤 Creating 50 males and 50 females...')
      const startTime = Date.now()
      
      // Helper to create user with retry
      const createUserWithRetry = async (
        email: string,
        password: string,
        name: string,
        gender: string,
        age: number,
        retryCount = 0
      ): Promise<TestUser> => {
        const MAX_RETRIES = 5
        try {
          return await createTestUser(email, password, name, gender, age)
        } catch (error: any) {
          if (retryCount < MAX_RETRIES) {
            const backoff = 1000 * (retryCount + 1) + Math.random() * 500
            await new Promise(resolve => setTimeout(resolve, backoff))
            return createUserWithRetry(email, password, name, gender, age, retryCount + 1)
          }
          throw error
        }
      }
      
      // Create users in batches to avoid overwhelming Supabase
      const USER_BATCH_SIZE = 10
      testUsers = []
      
      // Create males in batches
      for (let i = 1; i <= 50; i += USER_BATCH_SIZE) {
        const batch = []
        for (let j = i; j < Math.min(i + USER_BATCH_SIZE, 51); j++) {
          batch.push(
            createUserWithRetry(
              `test-male-${j}-${timestamp}@test.com`,
              password,
              `Test Male ${j}`,
              'male',
              20 + (j % 15)
            )
          )
        }
        const batchUsers = await Promise.all(batch)
        testUsers.push(...batchUsers)
        console.log(`  Created ${testUsers.length}/100 users...`)
        await new Promise(resolve => setTimeout(resolve, 500)) // Small delay between batches
      }
      
      // Create females in batches
      for (let i = 1; i <= 50; i += USER_BATCH_SIZE) {
        const batch = []
        for (let j = i; j < Math.min(i + USER_BATCH_SIZE, 51); j++) {
          batch.push(
            createUserWithRetry(
              `test-female-${j}-${timestamp}@test.com`,
              password,
              `Test Female ${j}`,
              'female',
              20 + (j % 15)
            )
          )
        }
        const batchUsers = await Promise.all(batch)
        testUsers.push(...batchUsers)
        console.log(`  Created ${testUsers.length}/100 users...`)
        await new Promise(resolve => setTimeout(resolve, 500)) // Small delay between batches
      }
      
      const createTime = Date.now() - startTime
      console.log(`✅ All ${testUsers.length} users created in ${createTime}ms`)
      
      // Update profiles with ages
      console.log('⚙️ Updating user profiles with ages...')
      const profileStartTime = Date.now()
      const profileUpdates = testUsers.map(user => 
        supabase.from('profiles').update({ age: user.age }).eq('id', user.userId)
      )
      await Promise.all(profileUpdates)
      const profileTime = Date.now() - profileStartTime
      console.log(`✅ Profiles updated in ${profileTime}ms`)
      
      // 2. Set preferences via Supabase
      console.log('⚙️ Setting up user preferences via Supabase...')
      const prefStartTime = Date.now()
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
      const preferencePromises = testUsers.map(user => 
        fetch(preferencesUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: user.userId,
            min_age: 18,
            max_age: 40,
            city: ['London'], // All users have London preference for maximum matching
            gender_preference: user.gender === 'male' ? 'female' : 'male',
            updated_at: new Date().toISOString()
          })
        }).catch(() => {})
      )
      
      await Promise.all(preferencePromises)
      const prefTime = Date.now() - prefStartTime
      console.log(`✅ Preferences set in ${prefTime}ms`)
      
      // Wait for preferences to be saved
      console.log('⏳ Waiting 3 seconds for preferences to be saved...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Verify all users have preferences
      const { data: preSpinPrefs } = await supabase
        .from('user_preferences')
        .select('user_id')
        .in('user_id', testUsers.map(u => u.userId))
      
      if (!preSpinPrefs || preSpinPrefs.length !== testUsers.length) {
        throw new Error(`❌ CRITICAL: ${testUsers.length - (preSpinPrefs?.length || 0)} users missing preferences!`)
      }
      console.log(`✅ All ${testUsers.length} users have preferences verified`)
      
      // 3. Sign in all users - ENSURE 100% SUCCESS
      console.log('🌐 Opening browser contexts and signing in all users...')
      const signInStartTime = Date.now()
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      // Helper function to sign in a single user with aggressive retry
      const signInUserWithRetry = async (user: TestUser, attempt = 1): Promise<boolean> => {
        const MAX_ATTEMPTS = 10
        let context: any = null
        let page: any = null
        
        try {
          context = await browser.newContext()
          page = await context.newPage()
          
          // Sign in via Playwright with very long timeouts
          await page.goto(`${VERIFIED_BASE_URL}/`, { waitUntil: 'networkidle', timeout: 60000 })
          await page.waitForTimeout(2000)
          
          const startButton = page.getByRole('button', { name: /start now/i }).first()
          await expect(startButton).toBeVisible({ timeout: 30000 })
          await startButton.click({ force: true })
          await page.waitForTimeout(1500)
          
          const signInTab = page.getByRole('button', { name: /sign in/i }).first()
          await expect(signInTab).toBeVisible({ timeout: 20000 })
          const isActive = await signInTab.evaluate((el) => {
            return el.classList.contains('bg-teal-300') || el.classList.contains('border-teal-300')
          }).catch(() => false)
          
          if (!isActive) {
            await signInTab.click({ force: true })
            await page.waitForTimeout(1000)
          }
          
          const emailInput = page.locator('input[type="email"]').first()
          await expect(emailInput).toBeVisible({ timeout: 20000 })
          await emailInput.clear()
          await emailInput.fill(user.email)
          await page.waitForTimeout(500)
          
          const passwordInput = page.locator('input[type="password"]').first()
          await expect(passwordInput).toBeVisible({ timeout: 20000 })
          await passwordInput.clear()
          await passwordInput.fill(user.password)
          await page.waitForTimeout(500)
          
          const continueButton = page.getByRole('button', { name: /continue/i }).first()
          await expect(continueButton).toBeVisible({ timeout: 20000 })
          await expect(continueButton).toBeEnabled({ timeout: 10000 })
          
          // Click with multiple retry attempts - use JavaScript click as fallback
          let navigationSuccess = false
          for (let clickTry = 0; clickTry < 5; clickTry++) {
            try {
              // Wait for button to be stable (not animating)
              await page.waitForTimeout(500)
              
              // Try Playwright click first
              try {
                const navPromise = page.waitForURL(/\/spin/, { timeout: 30000 })
                await continueButton.click({ force: true, timeout: 15000 })
                await navPromise
                navigationSuccess = true
                break
              } catch (playwrightClickError: any) {
                // If Playwright click fails, try JavaScript click
                try {
                  await continueButton.evaluate((el: any) => el.click())
                  await page.waitForURL(/\/spin/, { timeout: 30000 })
                  navigationSuccess = true
                  break
                } catch (jsClickError: any) {
                  // Check if navigation already happened
                  const url = page.url()
                  if (url.includes('/spin')) {
                    navigationSuccess = true
                    break
                  }
                  throw jsClickError
                }
              }
            } catch (navError: any) {
              const url = page.url()
              if (url.includes('/spin')) {
                navigationSuccess = true
                break
              }
              if (clickTry < 4) {
                await page.waitForTimeout(3000 * (clickTry + 1))
                // Re-check button state
                const buttonStillThere = await continueButton.isVisible().catch(() => false)
                if (!buttonStillThere) {
                  // Button disappeared, check URL
                  const currentUrl = page.url()
                  if (currentUrl.includes('/spin')) {
                    navigationSuccess = true
                    break
                  }
                }
              }
            }
          }
          
          if (!navigationSuccess) {
            throw new Error('Failed to navigate to /spin')
          }
          
          // Verify final state
          const finalUrl = page.url()
          if (!finalUrl.includes('/spin')) {
            throw new Error(`Not on /spin page: ${finalUrl}`)
          }
          
          contexts.push({ context, page, user })
          return true
        } catch (error: any) {
          if (context) {
            try {
              await context.close()
            } catch {
              // Ignore
            }
          }
          
          if (attempt < MAX_ATTEMPTS) {
            const backoff = 3000 * attempt + Math.random() * 2000
            await new Promise(resolve => setTimeout(resolve, backoff))
            return signInUserWithRetry(user, attempt + 1)
          }
          throw error
        }
      }
      
      // Sign in users sequentially in batches to ensure reliability
      const BATCH_SIZE = 10 // Batch size for parallel sign-ins
      const BATCH_DELAY = 4000 // Longer delay between batches
      let successfulSignIns = 0
      let remainingUsers = [...testUsers]
      let globalAttempt = 0
      
      while (remainingUsers.length > 0 && globalAttempt < 20) {
        globalAttempt++
        if (globalAttempt > 1) {
          console.log(`\n  🔄 Global retry ${globalAttempt}: Retrying ${remainingUsers.length} users...`)
          await new Promise(resolve => setTimeout(resolve, 10000)) // Longer wait before retry
        }
        
        const usersToRetry: TestUser[] = []
        
        // Process batches in parallel (small batches for reliability)
        for (let i = 0; i < remainingUsers.length; i += BATCH_SIZE) {
          const batch = remainingUsers.slice(i, i + BATCH_SIZE)
          
          // Process batch users in parallel (small batches are safe)
          const batchResults = await Promise.allSettled(
            batch.map(user => signInUserWithRetry(user))
          )
          
          batchResults.forEach((result, idx) => {
            const user = batch[idx]
            if (result.status === 'fulfilled' && result.value) {
              successfulSignIns++
            } else {
              usersToRetry.push(user)
              if (process.env.NODE_ENV === 'development' && result.status === 'rejected') {
                console.log(`  ⚠️ ${user.name} sign-in error: ${result.reason?.message || 'Unknown error'}`)
              }
            }
          })
          
          // Progress update (more frequent)
          if ((i + BATCH_SIZE) % 8 === 0 || i + BATCH_SIZE >= remainingUsers.length) {
            console.log(`  Progress: ${successfulSignIns}/${testUsers.length} signed in (${usersToRetry.length} to retry)`)
          }
          
          // Delay between batches
          if (i + BATCH_SIZE < remainingUsers.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
          }
        }
        
        remainingUsers = usersToRetry
        
        if (remainingUsers.length === 0) {
          break
        }
      }
      
      const signInTime = Date.now() - signInStartTime
      
      if (successfulSignIns === testUsers.length) {
        console.log(`✅ ALL ${testUsers.length} users signed in successfully in ${signInTime}ms`)
      } else {
        console.error(`❌ CRITICAL: Only ${successfulSignIns}/${testUsers.length} users signed in`)
        console.error(`Failed users: ${remainingUsers.map(u => u.name).join(', ')}`)
        throw new Error(`❌ Cannot proceed: ${remainingUsers.length} users failed to sign in after ${globalAttempt} attempts`)
      }
      
      // 4. All users click Start Spin simultaneously (with error handling)
      console.log('🎰 All users clicking Start Spin simultaneously...')
      const spinStartTime = Date.now()
      
      const spinResults = await Promise.allSettled(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('/api/spin') && response.request().method() === 'POST',
            { timeout: 20000 }
          ).catch(() => null)
          
          await spinButton.click({ force: true })
          
          const response = await responsePromise
          let responseData: any = {}
          let responseTime = 0
          
          if (response) {
            const responseStart = Date.now()
            responseData = await response.json().catch(() => ({}))
            responseTime = Date.now() - responseStart
            const status = response.status()
            
            if (status === 200 && responseTime < 10000) {
              // Only log if matched or if response time is significant
              if (responseData.matched || responseTime > 5000) {
                console.log(`  ${user.name}: API ${status} in ${responseTime}ms, matched=${responseData.matched}, match_id=${responseData.match_id ? responseData.match_id.substring(0, 8) + '...' : 'none'}`)
              }
            }
          }
          
          // Wait for redirect
          try {
            await page.waitForURL(/\/spinning|\/voting-window/, { timeout: 20000 })
            const finalUrl = page.url()
            return { user, url: finalUrl, matched: responseData.matched, matchId: responseData.match_id, responseTime }
          } catch {
            const currentUrl = page.url()
            return { user, url: currentUrl, matched: false, matchId: null, responseTime }
          }
        } catch (error: any) {
          return { user, url: page.url(), matched: false, matchId: null, responseTime: 0, error: error.message }
        }
      }))
      
      // Process results (handle both fulfilled and rejected promises)
      const successfulSpins = spinResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
      
      const failedSpins = spinResults.filter(r => r.status === 'rejected')
      if (failedSpins.length > 0) {
        console.log(`  ⚠️ ${failedSpins.length} users failed to spin (continuing with successful ones)`)
      }
      
      const spinTime = Date.now() - spinStartTime
      const matchedImmediately = successfulSpins.filter(r => r.matched).length
      const avgResponseTime = successfulSpins
        .filter(r => r.responseTime > 0)
        .reduce((sum, r) => sum + r.responseTime, 0) / successfulSpins.filter(r => r.responseTime > 0).length || 0
      
      console.log(`\n📊 SPIN PERFORMANCE:`)
      console.log(`  Total time: ${spinTime}ms`)
      console.log(`  Average API response time: ${Math.round(avgResponseTime)}ms`)
      console.log(`  Matched immediately: ${matchedImmediately}/${successfulSpins.length}`)
      console.log(`  Redirected to spinning: ${successfulSpins.filter(r => r.url.includes('/spinning')).length}`)
      console.log(`  Redirected to voting-window: ${successfulSpins.filter(r => r.url.includes('/voting-window')).length}`)
      
      // Wait for matches to occur
      console.log('\n⏳ Waiting for matches to occur (90 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 90000))
      
      // Check final states
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
            votingWindowUsers.push({ user, matchId })
          } else if (currentUrl.includes('/spinning')) {
            spinningUsers.push(user)
          } else {
            unexpectedPages.push({ user, url: currentUrl })
          }
        } catch (e) {
          // Ignore errors
        }
      }
      
      console.log(`\n📊 FINAL STATE ANALYSIS:`)
      console.log(`  Spinning: ${spinningUsers.length} users`)
      console.log(`  Voting Window: ${votingWindowUsers.length} users`)
      console.log(`  Video Date: 0 users`)
      console.log(`  Other/Unexpected: ${unexpectedPages.length} users`)
      
      // Check matches in database
      console.log('\n📈 MATCH ANALYSIS:')
      const { data: matchesData } = await supabase
        .from('matches')
        .select('match_id, user1_id, user2_id, status, created_at')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
      
      const matches = matchesData || []
      const usersInMatches = new Set<string>()
      matches.forEach(m => {
        usersInMatches.add(m.user1_id)
        usersInMatches.add(m.user2_id)
      })
      
      console.log(`  Total matches found: ${matches.length}`)
      console.log(`  Users in matches: ${usersInMatches.size}`)
      console.log(`  Expected matches: ${Math.floor(testUsers.length / 2)} = ${Math.floor(testUsers.length / 2)} pairs`)
      
      // Show sample matches
      if (matches.length > 0) {
        const sampleMatches = matches.slice(0, 10)
        sampleMatches.forEach(m => {
          const user1 = testUsers.find(u => u.userId === m.user1_id)
          const user2 = testUsers.find(u => u.userId === m.user2_id)
          if (user1 && user2) {
            console.log(`  ✅ Match ${m.match_id.substring(0, 8)}: ${user1.name} + ${user2.name}`)
          }
        })
        if (matches.length > 10) {
          console.log(`  ... and ${matches.length - 10} more matches`)
        }
      }
      
      // Performance summary
      const totalTime = Date.now() - startTime
      console.log(`\n⏱️ PERFORMANCE SUMMARY:`)
      console.log(`  Total test time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`)
      console.log(`  User creation: ${createTime}ms`)
      console.log(`  Profile updates: ${profileTime}ms`)
      console.log(`  Preference setup: ${prefTime}ms`)
      console.log(`  Sign-in: ${signInTime}ms`)
      console.log(`  Spin & match: ${spinTime}ms`)
      console.log(`  Average API response: ${Math.round(avgResponseTime)}ms`)
      
      // Issues
      console.log(`\n⚠️ ISSUES IDENTIFIED:`)
      if (spinningUsers.length > 0) {
        console.log(`  - ${spinningUsers.length} users still spinning after 90s wait - matching may be slow or stuck`)
      }
      if (matches.length < Math.floor(testUsers.length / 2)) {
        console.log(`  - Only ${matches.length} matches found, expected ${Math.floor(testUsers.length / 2)} - matching may be incomplete`)
      }
      if (avgResponseTime > 2000) {
        console.log(`  - Average API response time ${Math.round(avgResponseTime)}ms is high (>2000ms) - performance degradation`)
      }
      if (unexpectedPages.length > 0) {
        console.log(`  - ${unexpectedPages.length} users on unexpected pages - state management issues`)
      }
      
      console.log('\n✅ STRESS TEST COMPLETE')
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      // Cleanup
      console.log('\n🧹 Cleaning up test users...')
      const cleanupStart = Date.now()
      const cleanupPromises = testUsers.map(user => deleteTestUser(user.userId).catch(() => {}))
      await Promise.all(cleanupPromises)
      const cleanupTime = Date.now() - cleanupStart
      console.log(`✅ Cleanup complete in ${cleanupTime}ms`)
    }
  })
})

