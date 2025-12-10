import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, TestUser } from './helpers/create-users'

test.describe('Load Test: 50 Males and 20 Females Spinning', () => {
  let maleUsers: TestUser[] = []
  let femaleUsers: TestUser[] = []
  const MALE_COUNT = 50
  const FEMALE_COUNT = 20

  test('should match 50 males and 20 females when all spin', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes for large scale test
    
    // Use environment variable or default to localhost
    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'

    try {
      console.log(`👤 Creating ${MALE_COUNT} male users via backend...`)
      for (let i = 0; i < MALE_COUNT; i++) {
        const maleUser = await createTestUser(
          `test-male-${timestamp}-${i}@test.com`,
          password,
          `Test Male ${i + 1}`,
          'male'
        )
        maleUsers.push(maleUser)
        if ((i + 1) % 10 === 0) {
          console.log(`✅ Created ${i + 1}/${MALE_COUNT} male users`)
        }
      }
      console.log(`✅ All ${MALE_COUNT} male users created`)

      console.log(`👤 Creating ${FEMALE_COUNT} female users via backend...`)
      for (let i = 0; i < FEMALE_COUNT; i++) {
        const femaleUser = await createTestUser(
          `test-female-${timestamp}-${i}@test.com`,
          password,
          `Test Female ${i + 1}`,
          'female'
        )
        femaleUsers.push(femaleUser)
        if ((i + 1) % 5 === 0) {
          console.log(`✅ Created ${i + 1}/${FEMALE_COUNT} female users`)
        }
      }
      console.log(`✅ All ${FEMALE_COUNT} female users created`)

      // Create browser contexts for all users
      console.log('🌐 Opening browser contexts for all users...')
      const contexts: { context: any; page: any; user: TestUser; matched: boolean; matchId: string | null; url: string; signedIn: boolean }[] = []
      
      for (const user of [...maleUsers, ...femaleUsers]) {
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user, matched: false, matchId: null, url: '', signedIn: false })
      }
      console.log(`✅ Created ${contexts.length} browser contexts`)

      // Sign in users in batches to avoid overwhelming server
      console.log('🔐 Signing in all users (batched to avoid server overload)...')
      // Smaller batches for production to avoid overwhelming server
      const BATCH_SIZE = process.env.TEST_BASE_URL ? 5 : 10 // Smaller batches for production
      const BATCH_DELAY = process.env.TEST_BASE_URL ? 5000 : 2000 // Longer delay for production (5s vs 2s)
      
      for (let i = 0; i < contexts.length; i += BATCH_SIZE) {
        const batch = contexts.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(contexts.length / BATCH_SIZE)
        
        console.log(`  Signing in batch ${batchNum}/${totalBatches} (${batch.length} users)...`)
        
        await Promise.all(batch.map(async (contextObj, batchIndex) => {
          const { page, user } = contextObj
          const globalIndex = i + batchIndex
          try {
            // Add stagger within batch
            await page.waitForTimeout(Math.random() * 500)
            
            await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await page.waitForTimeout(500)
            
            const startButton = page.getByRole('button', { name: /start now/i }).first()
            await expect(startButton).toBeVisible({ timeout: 15000 })
            await startButton.click()
            await page.waitForTimeout(300)
            
            const signInTab = page.getByRole('button', { name: /sign in/i }).first()
            if (await signInTab.isVisible({ timeout: 2000 }).catch(() => false)) {
              await signInTab.click()
              await page.waitForTimeout(300)
            }
            
            const emailInput = page.locator('input[type="email"]').first()
            await expect(emailInput).toBeVisible({ timeout: 15000 })
            await emailInput.fill(user.email)
            await page.waitForTimeout(200)
            
            const passwordInput = page.locator('input[type="password"]').first()
            await expect(passwordInput).toBeVisible({ timeout: 15000 })
            await passwordInput.fill(user.password)
            await page.waitForTimeout(200)
            
            const continueButton = page.getByRole('button', { name: /continue/i }).first()
            await continueButton.click()
            
            await page.waitForURL(/\/spin/, { timeout: 20000 })
            
            // Verify we're actually on /spin
            const url = page.url()
            if (url.includes('/spin')) {
              contexts[globalIndex].signedIn = true
              contexts[globalIndex].url = url
            } else {
              console.error(`❌ User ${user.email} not on /spin after sign-in, got: ${url}`)
            }
          } catch (error: any) {
            console.error(`❌ Failed to sign in user ${user.email}:`, error.message || error)
            if (contexts[globalIndex]) {
              contexts[globalIndex].signedIn = false
            }
          }
        }))
        
        const batchSuccessCount = batch.filter((_, idx) => contexts[i + idx].signedIn).length
        console.log(`  ✅ Batch ${batchNum} complete: ${batchSuccessCount}/${batch.length} users signed in`)
        
        // Wait between batches (except last one)
        if (i + BATCH_SIZE < contexts.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }
      
      const signedInCount = contexts.filter(c => c.signedIn).length
      console.log(`✅ Sign-in complete: ${signedInCount}/${contexts.length} users successfully signed in`)
      
      if (signedInCount < contexts.length) {
        const failedUsers = contexts.filter(c => !c.signedIn)
        console.log(`⚠️ ${failedUsers.length} users failed to sign in - continuing with ${signedInCount} users`)
      }
      
      // Only proceed with successfully signed-in users
      const signedInContexts = contexts.filter(c => c.signedIn)
      console.log(`🎰 ${signedInContexts.length} users clicking Start Spin (in batches)...`)
      
      if (signedInContexts.length === 0) {
        throw new Error('No users successfully signed in - cannot proceed with test')
      }
      
      // Click "Start Spin" in batches (smaller for production)
      const SPIN_BATCH_SIZE = process.env.TEST_BASE_URL ? 8 : 15
      for (let i = 0; i < signedInContexts.length; i += SPIN_BATCH_SIZE) {
        const batch = signedInContexts.slice(i, i + SPIN_BATCH_SIZE)
        const batchNum = Math.floor(i / SPIN_BATCH_SIZE) + 1
        const totalBatches = Math.ceil(signedInContexts.length / SPIN_BATCH_SIZE)
        
        console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} users clicking Start Spin...`)
        
        await Promise.all(batch.map(async ({ page, user }, index) => {
          try {
            await page.waitForTimeout(Math.floor(Math.random() * 500)) // Stagger within batch
            const spinButton = page.getByRole('button', { name: /start spin/i }).first()
            await expect(spinButton).toBeVisible({ timeout: 15000 })
            await spinButton.click({ force: true })
          } catch (error: any) {
            console.error(`❌ Failed to click spin for user ${user.email}:`, error.message || error)
          }
        }))
        
        console.log(`  ✅ Batch ${batchNum} complete`)
        
        // Small delay between batches
        if (i + SPIN_BATCH_SIZE < signedInContexts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      console.log(`✅ ${signedInContexts.length} users clicked Start Spin`)
      
      // Wait for matching to occur (give it time for all matches)
      console.log('⏳ Waiting for matches to occur (30 seconds)...')
      await new Promise(resolve => setTimeout(resolve, 30000))
      
      // Check status of all signed-in users
      console.log('📊 Checking match status for all signed-in users...')
      let matchedCount = 0
      let unmatchedCount = 0
      const matchedPairs = new Map<string, string[]>() // matchId -> userIds
      
      for (const context of signedInContexts) {
        try {
          const url = context.page.url()
          context.url = url
          
          if (url.includes('/voting-window')) {
            const matchIdMatch = url.match(/matchId=([^&]+)/)
            if (matchIdMatch && matchIdMatch[1]) {
              context.matched = true
              context.matchId = matchIdMatch[1]
              matchedCount++
              
              // Track pairs
              if (!matchedPairs.has(matchIdMatch[1])) {
                matchedPairs.set(matchIdMatch[1], [])
              }
              matchedPairs.get(matchIdMatch[1])!.push(context.user.userId)
            }
          } else if (url.includes('/spinning')) {
            unmatchedCount++
          } else if (url.includes('/spin')) {
            unmatchedCount++
          } else {
            unmatchedCount++
          }
        } catch (error: any) {
          console.error(`❌ Failed to check status for user ${context.user.email}:`, error.message || error)
          unmatchedCount++
        }
      }
      
      // Analyze results
      console.log('\n📈 MATCH ANALYSIS:')
      console.log(`Total users created: ${contexts.length}`)
      console.log(`Successfully signed in: ${signedInContexts.length}`)
      console.log(`Matched users: ${matchedCount}`)
      console.log(`Unmatched users: ${unmatchedCount}`)
      console.log(`Total matches created: ${matchedPairs.size}`)
      
      const signedInFemales = signedInContexts.filter(c => c.user.gender === 'female').length
      const signedInMales = signedInContexts.filter(c => c.user.gender === 'male').length
      console.log(`Signed-in females: ${signedInFemales}/${FEMALE_COUNT}`)
      console.log(`Signed-in males: ${signedInMales}/${MALE_COUNT}`)
      console.log(`Expected matches: ${Math.min(signedInFemales, signedInMales)} (one per signed-in female, limited by males)`)
      
      // Check for issues
      const issues: string[] = []
      
      // Issue 1: Sign-in failures
      const failedSignIns = contexts.length - signedInContexts.length
      if (failedSignIns > 0) {
        issues.push(`ISSUE: ${failedSignIns} users failed to sign in (${contexts.length - signedInContexts.length} out of ${contexts.length} total)`)
      }
      
      // Issue 2: Not all signed-in females matched
      const matchedFemales = signedInContexts.filter(c => c.user.gender === 'female' && c.matched).length
      
      if (signedInFemales > 0 && matchedFemales < signedInFemales) {
        const expectedMatches = Math.min(signedInFemales, signedInMales)
        if (matchedFemales < expectedMatches) {
          issues.push(`ISSUE: Only ${matchedFemales}/${expectedMatches} signed-in females matched (${signedInFemales} females and ${signedInMales} males signed in)`)
        }
      }
      
      // Issue 3: Too many unmatched males (if all females matched, should have excess unmatched males)
      const matchedMales = signedInContexts.filter(c => c.user.gender === 'male' && c.matched).length
      const unmatchedMales = signedInContexts.filter(c => c.user.gender === 'male' && !c.matched).length
      
      if (matchedFemales === signedInFemales && signedInFemales > 0 && signedInMales > signedInFemales) {
        const expectedUnmatchedMales = signedInMales - signedInFemales
        if (unmatchedMales !== expectedUnmatchedMales) {
          issues.push(`ISSUE: Expected ${expectedUnmatchedMales} unmatched males, but found ${unmatchedMales} unmatched males (${matchedMales} matched)`)
        }
      }
      
      // Issue 4: Matches with wrong user counts (should be 2 users per match)
      for (const [matchId, userIds] of matchedPairs.entries()) {
        if (userIds.length !== 2) {
          issues.push(`ISSUE: Match ${matchId} has ${userIds.length} users (expected 2)`)
        }
      }
      
      // Issue 5: Users in same-gender matches
      for (const [matchId, userIds] of matchedPairs.entries()) {
        const usersInMatch = contexts.filter(c => userIds.includes(c.user.userId))
        const genders = usersInMatch.map(c => c.user.gender)
        if (genders[0] === genders[1]) {
          issues.push(`ISSUE: Same-gender match detected - Match ${matchId} has two ${genders[0]} users`)
        }
      }
      
      // Issue 6: Users stuck on /spinning or /spin (signed-in users who didn't match)
      const stuckUsers = signedInContexts.filter(c => {
        return !c.matched && (c.url.includes('/spinning') || c.url.includes('/spin'))
      })
      if (stuckUsers.length > 0) {
        const stuckMale = stuckUsers.filter(c => c.user.gender === 'male').length
        const stuckFemale = stuckUsers.filter(c => c.user.gender === 'female').length
        if (stuckFemale > 0) {
          issues.push(`ISSUE: ${stuckFemale} females stuck waiting (still on /spin or /spinning) - they should have matched`)
        }
        // Unmatched males are expected if there are more males than females
      }
      
      // Issue 7: Signed-in users on unexpected pages
      const unexpectedPages = signedInContexts.filter(c => {
        const url = c.url
        return !url.includes('/voting-window') && 
               !url.includes('/spinning') && 
               !url.includes('/spin') &&
               !url.includes(BASE_URL)
      })
      if (unexpectedPages.length > 0) {
        issues.push(`ISSUE: ${unexpectedPages.length} signed-in users on unexpected pages: ${unexpectedPages.map(c => c.url).join(', ')}`)
      }
      
      // Report issues
      console.log('\n🔍 ISSUES FOUND:')
      if (issues.length === 0) {
        console.log('✅ No issues found - all expected matches occurred correctly!')
      } else {
        issues.forEach((issue, i) => {
          console.log(`${i + 1}. ${issue}`)
        })
      }
      
      // Detailed breakdown
      console.log('\n📋 DETAILED BREAKDOWN:')
      console.log(`Matched females: ${matchedFemales}/${signedInFemales} (${FEMALE_COUNT - signedInFemales} failed to sign in)`)
      console.log(`Matched males: ${matchedMales}/${signedInMales} (${MALE_COUNT - signedInMales} failed to sign in)`)
      console.log(`Unmatched females: ${signedInFemales - matchedFemales}`)
      console.log(`Unmatched males: ${unmatchedMales}`)
      
      // List unmatched signed-in users
      const unmatchedSignedIn = signedInContexts.filter(c => !c.matched)
      if (unmatchedSignedIn.length > 0) {
        console.log('\n👥 UNMATCHED SIGNED-IN USERS:')
        unmatchedSignedIn.slice(0, 20).forEach(c => {
          console.log(`  - ${c.user.gender} ${c.user.name} - Current URL: ${c.url}`)
        })
        if (unmatchedSignedIn.length > 20) {
          console.log(`  ... and ${unmatchedSignedIn.length - 20} more`)
        }
      }
      
      // List sign-in failures
      const failedSignInUsers = contexts.filter(c => !c.signedIn)
      if (failedSignInUsers.length > 0) {
        console.log(`\n⚠️ SIGN-IN FAILURES: ${failedSignInUsers.length} users`)
        failedSignInUsers.slice(0, 10).forEach(c => {
          console.log(`  - ${c.user.gender} ${c.user.name} (${c.user.email})`)
        })
        if (failedSignInUsers.length > 10) {
          console.log(`  ... and ${failedSignInUsers.length - 10} more`)
        }
      }
      
      // Cleanup
      console.log('\n🧹 Cleaning up all users...')
      for (const context of contexts) {
        await context.context.close().catch(() => {})
      }
      
      // Report final status
      if (issues.length > 0) {
        console.log(`\n❌ TEST COMPLETED WITH ${issues.length} ISSUE(S) - See above for details`)
      } else {
        console.log('\n🎉 TEST PASSED - All expected matches occurred correctly!')
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      throw error
    } finally {
      // Cleanup all test users
      console.log('🧹 Cleaning up test users...')
      for (const user of [...maleUsers, ...femaleUsers]) {
        await deleteTestUser(user.userId).catch(() => {})
      }
    }
  })
})
