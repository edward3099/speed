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

test.describe('Video Date Self-Video Fix Test', () => {
  let testUsers: TestUser[] = []
  
  test('should verify users can see their own video after enabling camera', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-rp125sf7n-eds-projects-934496ce.vercel.app'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    // Track all issues found
    const issues: string[] = []
    const errors: string[] = []
    const warnings: string[] = []
    
    try {
      // Create compatible test users
      console.log('👤 Creating compatible test users...')
      
      const user1 = await createTestUser(
        `test-male-self-video-${timestamp}@test.com`,
        password,
        'Test Male Self Video',
        'male',
        25
      )
      testUsers.push(user1)
      
      const user2 = await createTestUser(
        `test-female-self-video-${timestamp}@test.com`,
        password,
        'Test Female Self Video',
        'female',
        24
      )
      testUsers.push(user2)
      
      console.log('✅ All test users created')
      
      // Update profiles with correct ages
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user2.userId)
      
      // Set up preferences
      const preferencesUrl = `${supabaseUrl}/rest/v1/user_preferences`
      const headers = {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }
      
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
      
      // Create browser contexts and sign in
      console.log('🌐 Opening browser contexts and signing in users...')
      const contexts: { 
        context: any
        page: any
        user: TestUser
        consoleErrors: string[]
        consoleWarnings: string[]
        videoIssues: string[]
      }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        
        const consoleErrors: string[] = []
        const consoleWarnings: string[] = []
        const videoIssues: string[] = []
        
        // Capture all console messages
        page.on('console', (msg) => {
          const text = msg.text()
          if (msg.type() === 'error') {
            if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
              consoleErrors.push(text)
            }
          } else if (msg.type() === 'warning') {
            consoleWarnings.push(text)
          }
        })
        
        page.on('pageerror', (error) => {
          consoleErrors.push(`Page Error: ${error.message}`)
        })
        
        contexts.push({ context, page, user, consoleErrors, consoleWarnings, videoIssues })
        
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
      
      // Start spinning
      console.log('🎰 All users clicking Start Spin...')
      await Promise.all(contexts.map(async ({ page, user }) => {
        try {
          const spinButton = page.getByRole('button', { name: /start spin/i }).first()
          await expect(spinButton).toBeVisible({ timeout: 20000 })
          await spinButton.click({ force: true })
          console.log(`  ✅ ${user.name} clicked Start Spin`)
        } catch (error) {
          errors.push(`Failed to click spin for ${user.name}: ${error}`)
        }
      }))
      
      // Wait for matching - be more patient
      console.log('⏳ Waiting for users to match...')
      let bothMatched = false
      let attempts = 0
      const maxAttempts = 20
      
      while (!bothMatched && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        const matchResults = await Promise.all(
          contexts.map(async ({ page, user }) => {
            await page.waitForTimeout(500)
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
          console.log('✅ Both users matched')
        } else if (matchedUsers.length === 1 && attempts >= 10) {
          // If one user matched, wait a bit more for the other
          console.log(`  ⏳ One user matched, waiting for second user...`)
        }
        attempts++
      }
      
      if (!bothMatched) {
        // Log the issue but continue - we can still test video if at least one user gets there
        const matchResults = await Promise.all(
          contexts.map(async ({ page, user }) => {
            const currentUrl = page.url()
            return { user, url: currentUrl }
          })
        )
        console.warn(`⚠️ Not both users matched after ${maxAttempts} attempts`)
        matchResults.forEach(r => {
          console.warn(`  ${r.user.name}: ${r.url}`)
        })
        issues.push(`Matching issue: Only ${matchResults.filter(r => r.url.includes('/voting-window')).length}/2 users reached voting window`)
      }
      
      // Vote yes
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
            errors.push(`Failed to vote yes for ${user.name}: ${error}`)
          }
        }
      }
      
      // Wait for video-date
      console.log('⏳ Waiting for redirect to video-date...')
      const matchIdFromUrl = contexts[0].page.url().match(/matchId=([^&]+)/)?.[1]
      
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          try {
            await page.waitForURL(/\/video-date/, { timeout: 30000 })
            console.log(`  ✅ ${user.name} redirected to video-date`)
          } catch (error) {
            if (matchIdFromUrl) {
              await page.goto(`${BASE_URL}/video-date?matchId=${matchIdFromUrl}`, { waitUntil: 'networkidle' })
              await page.waitForTimeout(2000)
              console.log(`  ✅ ${user.name} manually navigated to video-date`)
            }
          }
        })
      )
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      // CRITICAL TEST: Enable camera and check if users can see their own video
      console.log('\n🎥 CRITICAL TEST: Enabling camera and checking self-video visibility...')
      
      for (const { page, user, consoleErrors, videoIssues } of contexts) {
        if (page.url().includes('/video-date')) {
          console.log(`\n  Testing ${user.name}...`)
          
          // Wait for LiveKit connection
          await page.waitForTimeout(5000)
          
          // Find and click "Enable Camera & Mic" button
          const enableButton = page.getByRole('button', { name: /enable.*camera.*mic/i }).first()
          const enableButtonAlt = page.locator('button').filter({ hasText: /enable/i }).first()
          
          const hasEnableButton = await enableButton.isVisible().catch(() => false) || 
                                  await enableButtonAlt.isVisible().catch(() => false)
          
          if (hasEnableButton) {
            console.log(`    🔘 Clicking "Enable Camera & Mic" for ${user.name}...`)
            try {
              if (await enableButton.isVisible().catch(() => false)) {
                await enableButton.click({ force: true })
              } else if (await enableButtonAlt.isVisible().catch(() => false)) {
                await enableButtonAlt.click({ force: true })
              }
              console.log(`    ✅ ${user.name} clicked Enable button`)
              
              // Wait for permissions and track publishing - longer wait for periodic checks
              await page.waitForTimeout(8000)
            } catch (error: any) {
              errors.push(`${user.name} - Failed to click Enable: ${error.message}`)
              console.error(`    ❌ Error: ${error.message}`)
            }
          } else {
            console.log(`    ℹ️ No Enable button found (may already be enabled)`)
          }
          
          // CRITICAL: Check if user can see their own video
          console.log(`    🔍 Checking if ${user.name} can see their own video...`)
          
          // Wait longer for periodic checks to find tracks (they run for 10 seconds)
          await page.waitForTimeout(6000)
          
          // Find all video elements
          const videoElements = await page.locator('video').all()
          console.log(`    📹 Found ${videoElements.length} video element(s)`)
          
          if (videoElements.length === 0) {
            videoIssues.push(`${user.name} - No video elements found on page`)
            issues.push(`${user.name} - No video elements found`)
            console.error(`    ❌ ${user.name} - NO VIDEO ELEMENTS FOUND`)
            continue
          }
          
          // Check each video element
          let foundLocalVideo = false
          let localVideoPlaying = false
          let localVideoHasSrcObject = false
          
          for (let i = 0; i < videoElements.length; i++) {
            const video = videoElements[i]
            const isVisible = await video.isVisible().catch(() => false)
            const computedStyle = await video.evaluate((el: HTMLVideoElement) => {
              const style = window.getComputedStyle(el)
              return {
                opacity: style.opacity,
                visibility: style.visibility,
                display: style.display,
                hasSrcObject: !!el.srcObject
              }
            }).catch(() => null)
            
            const hasSrcObject = await video.evaluate((el: HTMLVideoElement) => {
              return !!el.srcObject
            }).catch(() => false)
            
            const isPlaying = await video.evaluate((el: HTMLVideoElement) => {
              return !el.paused && el.readyState >= 2
            }).catch(() => false)
            
            const trackCount = await video.evaluate((el: HTMLVideoElement) => {
              if (el.srcObject instanceof MediaStream) {
                return el.srcObject.getVideoTracks().length
              }
              return 0
            }).catch(() => 0)
            
            console.log(`    Video ${i + 1}: visible=${isVisible}, playing=${isPlaying}, srcObject=${hasSrcObject}, tracks=${trackCount}`)
            if (computedStyle) {
              console.log(`      Style: opacity=${computedStyle.opacity}, visibility=${computedStyle.visibility}, display=${computedStyle.display}`)
            }
            
            // Check if this is the local video (muted video is typically local)
            const isMuted = await video.evaluate((el: HTMLVideoElement) => {
              return el.muted
            }).catch(() => false)
            
            // Local video is usually muted
            if (isMuted && hasSrcObject) {
              foundLocalVideo = true
              localVideoHasSrcObject = hasSrcObject
              localVideoPlaying = isPlaying
              
              console.log(`    ✅ Found local video element (muted, has srcObject)`)
              
              // Check if video is actually visible
              if (!isVisible) {
                videoIssues.push(`${user.name} - Local video element exists but is not visible`)
                issues.push(`${user.name} - Local video not visible (opacity/visibility issue)`)
                console.error(`    ❌ ${user.name} - Local video element exists but NOT VISIBLE`)
              } else if (!isPlaying) {
                videoIssues.push(`${user.name} - Local video element visible but not playing`)
                issues.push(`${user.name} - Local video visible but not playing`)
                console.warn(`    ⚠️ ${user.name} - Local video visible but NOT PLAYING`)
              } else {
                console.log(`    ✅ ${user.name} - Local video is VISIBLE and PLAYING`)
              }
            }
          }
          
          if (!foundLocalVideo) {
            videoIssues.push(`${user.name} - No local video element found (no muted video with srcObject)`)
            issues.push(`${user.name} - Cannot see own video (no local video element)`)
            console.error(`    ❌ ${user.name} - CANNOT SEE OWN VIDEO - No local video element found`)
          } else if (!localVideoHasSrcObject) {
            videoIssues.push(`${user.name} - Local video element exists but has no srcObject`)
            issues.push(`${user.name} - Local video element has no srcObject`)
            console.error(`    ❌ ${user.name} - Local video element has NO srcObject`)
          } else if (!localVideoPlaying) {
            videoIssues.push(`${user.name} - Local video has srcObject but not playing`)
            issues.push(`${user.name} - Local video not playing`)
            console.warn(`    ⚠️ ${user.name} - Local video has srcObject but NOT PLAYING`)
          }
          
          // Check for "video off" placeholder
          const videoOffPlaceholder = page.locator('text=/video off/i').first()
          const hasPlaceholder = await videoOffPlaceholder.isVisible().catch(() => false)
          
          if (hasPlaceholder && foundLocalVideo && localVideoHasSrcObject) {
            videoIssues.push(`${user.name} - "Video off" placeholder showing even though video track exists`)
            issues.push(`${user.name} - Placeholder showing incorrectly`)
            console.error(`    ❌ ${user.name} - "Video off" placeholder is showing even though track exists!`)
          }
          
          // Check console for video-related errors
          const videoErrors = consoleErrors.filter(e => 
            e.includes('video') || 
            e.includes('camera') || 
            e.includes('getUserMedia') ||
            e.includes('TrackPublished') ||
            e.includes('localVideoTrack') ||
            e.includes('srcObject')
          )
          
          if (videoErrors.length > 0) {
            console.error(`    ❌ ${user.name} - Video-related console errors:`)
            videoErrors.forEach(err => {
              console.error(`      - ${err}`)
              errors.push(`${user.name} - ${err}`)
            })
          }
        }
      }
      
      // Final summary
      console.log('\n' + '='.repeat(80))
      console.log('📊 TEST SUMMARY')
      console.log('='.repeat(80))
      console.log(`✅ Both users matched: ${bothMatched ? 'YES' : 'NO'}`)
      console.log(`✅ Both users in video-date: ${contexts.every(c => c.page.url().includes('/video-date')) ? 'YES' : 'NO'}`)
      
      console.log('\n🎥 VIDEO VISIBILITY RESULTS:')
      for (const { user, videoIssues } of contexts) {
        if (videoIssues.length === 0) {
          console.log(`  ✅ ${user.name}: Can see own video`)
        } else {
          console.log(`  ❌ ${user.name}: CANNOT see own video`)
          videoIssues.forEach(issue => console.log(`     - ${issue}`))
        }
      }
      
      if (issues.length > 0) {
        console.log('\n❌ ISSUES FOUND:')
        issues.forEach(issue => console.log(`  - ${issue}`))
      }
      
      if (errors.length > 0) {
        console.log('\n❌ ERRORS FOUND:')
        errors.forEach(err => console.log(`  - ${err}`))
      }
      
      if (warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:')
        warnings.forEach(warn => console.log(`  - ${warn}`))
      }
      
      // Fail test if critical issues found
      if (issues.length > 0 || errors.length > 0) {
        throw new Error(`Test found ${issues.length} issue(s) and ${errors.length} error(s). Check output above for details.`)
      }
      
      console.log('\n✅ TEST PASSED: All users can see their own video!')
      
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





















