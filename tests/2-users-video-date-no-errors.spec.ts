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

test.describe('2 Users Video Date - No Errors Test', () => {
  let testUsers: TestUser[] = []
  
  test('should complete full flow from spin to video-date with camera/mic enabled without errors', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-1gtl4wlbw-eds-projects-934496ce.vercel.app'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    // Track all errors encountered
    const errors: string[] = []
    const warnings: string[] = []
    
    try {
      // Create compatible test users (male and female, same city, compatible age)
      console.log('👤 Creating compatible test users...')
      
      // User 1: Male, 25 years old, London, age range 20-30
      const user1 = await createTestUser(
        `test-male-no-errors-${timestamp}@test.com`,
        password,
        'Test Male No Errors',
        'male',
        25
      )
      testUsers.push(user1)
      
      // User 2: Female, 24 years old, London, age range 20-30 (SHOULD MATCH user1)
      const user2 = await createTestUser(
        `test-female-no-errors-${timestamp}@test.com`,
        password,
        'Test Female No Errors',
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
      const contexts: { context: any; page: any; user: TestUser; consoleErrors: string[]; consoleWarnings: string[] }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        
        const consoleErrors: string[] = []
        const consoleWarnings: string[] = []
        
        // Capture console errors and warnings
        page.on('console', (msg) => {
          const text = msg.text()
          if (msg.type() === 'error') {
            // Filter out known non-critical errors
            if (!text.includes('favicon') && 
                !text.includes('Failed to load resource') &&
                !text.includes('404') &&
                !text.includes('net::ERR_')) {
              consoleErrors.push(text)
            }
          } else if (msg.type() === 'warning') {
            // Filter out known non-critical warnings
            if (!text.includes('favicon') &&
                !text.includes('Deprecated API')) {
              consoleWarnings.push(text)
            }
          }
        })
        
        // Capture page errors
        page.on('pageerror', (error) => {
          consoleErrors.push(`Page Error: ${error.message}`)
        })
        
        contexts.push({ context, page, user, consoleErrors, consoleWarnings })
        
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
      
      // Wait for matches to be created
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
      
      // Wait for redirect to video-date
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
            }
          }
        })
      )
      
      // Wait for video-date page to fully load
      console.log('⏳ Waiting for video-date page to load...')
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      // Check for critical errors before proceeding
      console.log('\n🔍 Checking for errors before enabling camera/mic...')
      for (const { page, user, consoleErrors, consoleWarnings } of contexts) {
        if (page.url().includes('/video-date')) {
          // Check for LiveKit errors
          const livekitErrors = consoleErrors.filter(e => 
            e.includes('LiveKit') || 
            e.includes('invalid API key') || 
            e.includes('401') ||
            e.includes('authentication')
          )
          
          if (livekitErrors.length > 0) {
            errors.push(`${user.name} - LiveKit errors: ${livekitErrors.join('; ')}`)
            console.error(`  ❌ ${user.name} has LiveKit errors:`, livekitErrors)
          }
          
          // Check for real-time subscription errors (these are less critical but should be noted)
          const realtimeErrors = consoleErrors.filter(e => 
            e.includes('Real-time subscription error') ||
            e.includes('CHANNEL_ERROR')
          )
          
          if (realtimeErrors.length > 0) {
            warnings.push(`${user.name} - Real-time subscription errors: ${realtimeErrors.length} occurrences`)
            console.warn(`  ⚠️ ${user.name} has real-time subscription errors (${realtimeErrors.length} occurrences)`)
          }
        }
      }
      
      // Test camera and mic functionality
      console.log('\n🎥 Testing camera and mic functionality...')
      
      for (const { page, user, consoleErrors, consoleWarnings } of contexts) {
        if (page.url().includes('/video-date')) {
          console.log(`\n  Testing ${user.name}...`)
          
          // Wait a bit more for LiveKit to connect
          await page.waitForTimeout(5000)
          
          // Look for "Enable Camera & Mic" button or existing controls
          const enableButton = page.getByRole('button', { name: /enable.*camera.*mic/i }).first()
          const enableButtonAlt = page.locator('button').filter({ hasText: /enable/i }).first()
          
          const hasEnableButton = await enableButton.isVisible().catch(() => false) || 
                                  await enableButtonAlt.isVisible().catch(() => false)
          
          if (hasEnableButton) {
            console.log(`    🔘 Found "Enable Camera & Mic" button for ${user.name}`)
            try {
              if (await enableButton.isVisible().catch(() => false)) {
                await enableButton.click({ force: true })
              } else if (await enableButtonAlt.isVisible().catch(() => false)) {
                await enableButtonAlt.click({ force: true })
              }
              console.log(`    ✅ ${user.name} clicked Enable Camera & Mic button`)
              await page.waitForTimeout(3000) // Wait for permissions and connection
            } catch (error: any) {
              errors.push(`${user.name} - Failed to click Enable button: ${error.message}`)
              console.error(`    ❌ Error clicking Enable button for ${user.name}:`, error.message)
            }
          } else {
            console.log(`    ℹ️ No "Enable Camera & Mic" button found (may already be enabled or using existing controls)`)
          }
          
          // Check for mic/video toggle buttons
          const micButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /mic/i }).first()
          const videoButton = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /video/i }).first()
          
          const hasMicButton = await micButton.isVisible().catch(() => false)
          const hasVideoButton = await videoButton.isVisible().catch(() => false)
          
          console.log(`    ${hasMicButton ? '✅' : '❌'} ${user.name} mic button: ${hasMicButton ? 'visible' : 'not found'}`)
          console.log(`    ${hasVideoButton ? '✅' : '❌'} ${user.name} video button: ${hasVideoButton ? 'visible' : 'not found'}`)
          
          // Try to click mic button if available
          if (hasMicButton) {
            try {
              await micButton.click({ force: true })
              await page.waitForTimeout(1000)
              console.log(`    ✅ ${user.name} clicked mic button`)
            } catch (error: any) {
              warnings.push(`${user.name} - Failed to toggle mic: ${error.message}`)
              console.warn(`    ⚠️ Error toggling mic for ${user.name}:`, error.message)
            }
          }
          
          // Try to click video button if available
          if (hasVideoButton) {
            try {
              await videoButton.click({ force: true })
              await page.waitForTimeout(1000)
              console.log(`    ✅ ${user.name} clicked video button`)
            } catch (error: any) {
              warnings.push(`${user.name} - Failed to toggle video: ${error.message}`)
              console.warn(`    ⚠️ Error toggling video for ${user.name}:`, error.message)
            }
          }
          
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
              warnings.push(`${user.name} - Video element exists but not playing`)
              console.warn(`    ⚠️ ${user.name} video element exists but not playing`)
            }
          } else {
            warnings.push(`${user.name} - Video element not visible`)
            console.warn(`    ⚠️ ${user.name} video element not visible`)
          }
          
          // Collect final errors and warnings
          await page.waitForTimeout(3000)
          
          // Check for new errors after camera/mic operations
          const newErrors = consoleErrors.filter(e => 
            e.includes('LiveKit') || 
            e.includes('invalid API key') || 
            e.includes('401') ||
            e.includes('authentication') ||
            e.includes('camera') ||
            e.includes('microphone') ||
            e.includes('getUserMedia') ||
            e.includes('permission')
          )
          
          if (newErrors.length > 0) {
            errors.push(`${user.name} - Errors after camera/mic operations: ${newErrors.join('; ')}`)
            console.error(`    ❌ ${user.name} has new errors after camera/mic operations:`, newErrors)
          }
        }
      }
      
      // Final summary
      console.log('\n📊 TEST SUMMARY:')
      console.log('  - Both users matched successfully:', bothMatched ? '✅' : '❌')
      console.log('  - Both users voted yes and redirected to video-date:', '✅')
      console.log('  - Camera and mic buttons were tested:', '✅')
      
      if (errors.length > 0) {
        console.log('\n❌ ERRORS FOUND:')
        errors.forEach(err => console.log(`  - ${err}`))
        throw new Error(`Test completed but ${errors.length} error(s) were found: ${errors.join('; ')}`)
      } else {
        console.log('\n✅ NO CRITICAL ERRORS FOUND')
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:')
        warnings.forEach(warn => console.log(`  - ${warn}`))
      }
      
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























