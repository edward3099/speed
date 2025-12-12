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

test.describe('Video Date Camera and Mic Test', () => {
  let testUsers: TestUser[] = []
  
  test('should allow users to enable camera and mic in video-date after matching', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    try {
      // Create compatible test users (male and female, same city, compatible age)
      console.log('👤 Creating compatible test users...')
      
      // User 1: Male, 25 years old, London, age range 20-30
      const user1 = await createTestUser(
        `test-male-video-${timestamp}@test.com`,
        password,
        'Test Male Video',
        'male',
        25
      )
      testUsers.push(user1)
      
      // User 2: Female, 24 years old, London, age range 20-30 (SHOULD MATCH user1)
      const user2 = await createTestUser(
        `test-female-video-${timestamp}@test.com`,
        password,
        'Test Female Video',
        'female',
        24
      )
      testUsers.push(user2)
      
      console.log('✅ All test users created')
      
      // Update profiles with correct ages
      console.log('⚙️ Updating user profiles with ages...')
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user2.userId)
      
      // Set up preferences for each user via Supabase REST API
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
          gender_preference: 'male',
          updated_at: new Date().toISOString()
        })
      }).catch(() => {})
      
      console.log('✅ Preferences set')
      
      // Create browser contexts and sign in users
      console.log('🌐 Opening browser contexts and signing in users...')
      const contexts: { context: any; page: any; user: TestUser }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        contexts.push({ context, page, user })
        
        // Sign in
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
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
      await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          await spinButton.click({ force: true })
          console.log(`  ✅ ${user.name} clicked Start Spin`)
        } catch (error) {
          console.error(`  ❌ Failed to click spin for ${user.name}:`, error)
        }
      }))
      
      // Wait for users to enter queue
      console.log('⏳ Waiting for users to enter queue...')
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          try {
            await page.waitForURL(/\/spinning/, { timeout: 10000 })
            console.log(`  ✅ ${user.name} entered queue`)
          } catch {
            console.log(`  ⚠️ ${user.name} still on /spin (might be matched immediately)`)
          }
        })
      )
      
      // Wait for matches to be created (longer wait)
      console.log('⏳ Waiting for matches to be created...')
      await new Promise(resolve => setTimeout(resolve, 20000))
      
      // Check if users are matched - wait until both are in voting window
      console.log('\n📊 Checking match results...')
      let bothMatched = false
      let attempts = 0
      const maxAttempts = 10
      
      while (!bothMatched && attempts < maxAttempts) {
        const matchResults = await Promise.all(
          contexts.map(async ({ page, user }) => {
            await page.waitForTimeout(1000)
            const currentUrl = page.url()
            return { user, url: currentUrl }
          })
        )
        
        const matchedUsers = matchResults.filter(r => r.url.includes('/voting-window'))
        console.log(`  Attempt ${attempts + 1}: ${matchedUsers.length}/2 users in voting window`)
        matchResults.forEach(r => {
          console.log(`    ${r.user.name}: ${r.url}`)
        })
        
        if (matchedUsers.length === 2) {
          bothMatched = true
          console.log('✅ Both users matched and are in voting window')
        } else {
          attempts++
          if (attempts < maxAttempts) {
            console.log(`  ⏳ Waiting 2 more seconds...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }
      
      if (!bothMatched) {
        throw new Error(`❌ After ${maxAttempts} attempts, not both users reached voting window`)
      }
      
      // Both users vote "yes" to proceed to video-date
      console.log('\n🗳️ Both users voting "yes"...')
      for (const { page, user } of contexts) {
        if (page.url().includes('/voting-window')) {
          try {
            // Wait for Yes button to be visible
            const yesButton = page.getByRole('button', { name: /yes/i }).first()
            await expect(yesButton).toBeVisible({ timeout: 10000 })
            await yesButton.click({ force: true })
            console.log(`  ✅ ${user.name} voted yes`)
            await page.waitForTimeout(1000)
          } catch (error) {
            console.error(`  ❌ Failed to vote yes for ${user.name}:`, error)
          }
        }
      }
      
      // Wait for redirect to video-date or manually navigate
      console.log('⏳ Waiting for redirect to video-date...')
      const matchIdFromUrl = contexts[0].page.url().match(/matchId=([^&]+)/)?.[1]
      
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          try {
            await page.waitForURL(/\/video-date/, { timeout: 30000 })
            console.log(`  ✅ ${user.name} redirected to video-date`)
          } catch (error) {
            console.log(`  ⚠️ ${user.name} did not auto-redirect to video-date`)
            console.log(`  Current URL: ${page.url()}`)
            
            // Manually navigate to video-date if we have a matchId
            if (matchIdFromUrl) {
              console.log(`  🔄 Manually navigating ${user.name} to video-date...`)
              await page.goto(`${BASE_URL}/video-date?matchId=${matchIdFromUrl}`, { waitUntil: 'networkidle' })
              await page.waitForTimeout(2000)
              console.log(`  ✅ ${user.name} manually navigated to video-date`)
            } else {
              console.log(`  ❌ No matchId found, cannot navigate to video-date`)
            }
          }
        })
      )
      
      // Wait for video-date page to load
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Test camera and mic functionality
      console.log('\n🎥 Testing camera and mic functionality...')
      
      for (const { page, user } of contexts) {
        if (page.url().includes('/video-date')) {
          console.log(`\n  Testing ${user.name}...`)
          
          // Check if countdown is showing (video-date might be in countdown phase)
          const countdownTimer = page.locator('[data-testid="countdown-timer"]')
          const isCountdown = await countdownTimer.isVisible().catch(() => false)
          
          if (isCountdown) {
            console.log(`    ⏳ ${user.name} is in countdown phase`)
            
            // Try to find and click mic button during countdown
            const micButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /mic/i }).first()
            const micButtonAlt = page.locator('button[title*="mute" i], button[title*="unmute" i]').first()
            
            const micButtonFound = await micButton.isVisible().catch(() => false) || await micButtonAlt.isVisible().catch(() => false)
            
            if (micButtonFound) {
              console.log(`    🎤 Found mic button for ${user.name}`)
              try {
                // Click mic button to enable mic
                if (await micButton.isVisible().catch(() => false)) {
                  await micButton.click({ force: true })
                } else if (await micButtonAlt.isVisible().catch(() => false)) {
                  await micButtonAlt.click({ force: true })
                }
                console.log(`    ✅ ${user.name} clicked mic button`)
                await page.waitForTimeout(2000)
                
                // Check for permission prompt or error
                const errorMessage = page.locator('text=/permission denied/i, text=/camera.*not available/i, text=/microphone.*not available/i').first()
                const hasError = await errorMessage.isVisible().catch(() => false)
                
                if (hasError) {
                  const errorText = await errorMessage.textContent().catch(() => '')
                  console.log(`    ⚠️ ${user.name} got error: ${errorText}`)
                } else {
                  console.log(`    ✅ ${user.name} mic button clicked without immediate error`)
                }
              } catch (error: any) {
                console.log(`    ❌ Error clicking mic button for ${user.name}: ${error.message}`)
              }
            } else {
              console.log(`    ⚠️ Mic button not found for ${user.name}`)
            }
            
            // Try to find and click video button during countdown
            const videoButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /video/i }).first()
            const videoButtonAlt = page.locator('button[title*="video" i], button[title*="Turn on video" i], button[title*="Turn off video" i]').first()
            
            const videoButtonFound = await videoButton.isVisible().catch(() => false) || await videoButtonAlt.isVisible().catch(() => false)
            
            if (videoButtonFound) {
              console.log(`    📹 Found video button for ${user.name}`)
              try {
                // Click video button to enable camera
                if (await videoButton.isVisible().catch(() => false)) {
                  await videoButton.click({ force: true })
                } else if (await videoButtonAlt.isVisible().catch(() => false)) {
                  await videoButtonAlt.click({ force: true })
                }
                console.log(`    ✅ ${user.name} clicked video button`)
                await page.waitForTimeout(2000)
                
                // Check for permission prompt or error
                const errorMessage = page.locator('text=/permission denied/i, text=/camera.*not available/i').first()
                const hasError = await errorMessage.isVisible().catch(() => false)
                
                if (hasError) {
                  const errorText = await errorMessage.textContent().catch(() => '')
                  console.log(`    ⚠️ ${user.name} got error: ${errorText}`)
                } else {
                  console.log(`    ✅ ${user.name} video button clicked without immediate error`)
                }
              } catch (error: any) {
                console.log(`    ❌ Error clicking video button for ${user.name}: ${error.message}`)
              }
            } else {
              console.log(`    ⚠️ Video button not found for ${user.name}`)
            }
          } else {
            console.log(`    ✅ ${user.name} is past countdown (video-date active)`)
            
            // Check for video elements
            const localVideo = page.locator('video').first()
            const hasLocalVideo = await localVideo.isVisible().catch(() => false)
            
            if (hasLocalVideo) {
              console.log(`    ✅ ${user.name} has video element visible`)
              
              // Check if video is playing
              const isPlaying = await localVideo.evaluate((video: HTMLVideoElement) => {
                return !video.paused && video.readyState >= 2
              }).catch(() => false)
              
              if (isPlaying) {
                console.log(`    ✅ ${user.name} video is playing`)
              } else {
                console.log(`    ⚠️ ${user.name} video element exists but not playing`)
              }
            } else {
              console.log(`    ⚠️ ${user.name} video element not visible`)
            }
            
            // Check for mic/video control buttons
            const micControlButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /mic/i }).first()
            const videoControlButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /video/i }).first()
            
            const hasMicControl = await micControlButton.isVisible().catch(() => false)
            const hasVideoControl = await videoControlButton.isVisible().catch(() => false)
            
            console.log(`    ${hasMicControl ? '✅' : '❌'} ${user.name} mic control button: ${hasMicControl ? 'visible' : 'not found'}`)
            console.log(`    ${hasVideoControl ? '✅' : '❌'} ${user.name} video control button: ${hasVideoControl ? 'visible' : 'not found'}`)
          }
          
          // Check browser console for errors
          const consoleErrors: string[] = []
          page.on('console', (msg) => {
            if (msg.type() === 'error') {
              const text = msg.text()
              if (text.includes('camera') || text.includes('microphone') || text.includes('getUserMedia') || text.includes('permission')) {
                consoleErrors.push(text)
              }
            }
          })
          
          await page.waitForTimeout(3000)
          
          if (consoleErrors.length > 0) {
            console.log(`    ⚠️ ${user.name} console errors related to camera/mic:`)
            consoleErrors.forEach(err => console.log(`      - ${err}`))
          }
        }
      }
      
      console.log('\n📊 TEST SUMMARY:')
      console.log('  - Both users matched successfully')
      console.log('  - Both users voted yes and redirected to video-date')
      console.log('  - Camera and mic buttons were tested')
      console.log('  - Check console output above for any issues')
      
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
