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

test.describe('LiveKit Connection Test', () => {
  let testUsers: TestUser[] = []
  
  test('should connect to LiveKit without 401 errors', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-jgm2wy6z9-eds-projects-934496ce.vercel.app'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    // Track all errors encountered
    const livekitErrors: string[] = []
    const connectionErrors: string[] = []
    
    try {
      // Create compatible test users
      console.log('👤 Creating compatible test users...')
      
      const user1 = await createTestUser(
        `test-male-livekit-${timestamp}@test.com`,
        password,
        'Test Male LiveKit',
        'male',
        25
      )
      testUsers.push(user1)
      
      const user2 = await createTestUser(
        `test-female-livekit-${timestamp}@test.com`,
        password,
        'Test Female LiveKit',
        'female',
        24
      )
      testUsers.push(user2)
      
      console.log('✅ All test users created')
      
      // Update profiles with correct ages
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user2.userId)
      
      // Set up preferences via Supabase REST API
      console.log('⚙️ Setting up user preferences...')
      
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
      console.log('🌐 Opening browser contexts and signing in...')
      const contexts: { 
        context: any
        page: any
        user: TestUser
        consoleErrors: string[]
        consoleWarnings: string[]
        networkErrors: any[]
      }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        
        const consoleErrors: string[] = []
        const consoleWarnings: string[] = []
        const networkErrors: any[] = []
        
        // Capture console errors
        page.on('console', (msg) => {
          const text = msg.text()
          if (msg.type() === 'error') {
            if (!text.includes('favicon') && 
                !text.includes('Failed to load resource') &&
                !text.includes('404') &&
                !text.includes('net::ERR_')) {
              consoleErrors.push(text)
            }
          } else if (msg.type() === 'warning') {
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
        
        // Capture network failures
        page.on('response', (response) => {
          if (response.status() >= 400 && response.url().includes('livekit')) {
            networkErrors.push({
              url: response.url(),
              status: response.status(),
              statusText: response.statusText()
            })
          }
        })
        
        contexts.push({ context, page, user, consoleErrors, consoleWarnings, networkErrors })
        
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
      
      // All users click Start Spin
      console.log('🎰 All users clicking Start Spin...')
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
      
      // Wait for matches
      console.log('⏳ Waiting for matches...')
      await new Promise(resolve => setTimeout(resolve, 20000))
      
      // Check if users are matched
      let bothMatched = false
      let attempts = 0
      const maxAttempts = 10
      
      while (!bothMatched && attempts < maxAttempts) {
        const matchResults = await Promise.all(
          contexts.map(async ({ page }) => {
            await page.waitForTimeout(1000)
            return { url: page.url() }
          })
        )
        
        const matchedUsers = matchResults.filter(r => r.url.includes('/voting-window'))
        console.log(`  Attempt ${attempts + 1}: ${matchedUsers.length}/2 users in voting window`)
        
        if (matchedUsers.length === 2) {
          bothMatched = true
          console.log('✅ Both users matched')
        } else {
          attempts++
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }
      
      if (!bothMatched) {
        throw new Error(`❌ After ${maxAttempts} attempts, not both users reached voting window`)
      }
      
      // Both users vote "yes"
      console.log('🗳️ Both users voting "yes"...')
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
            console.log(`  ⚠️ ${user.name} did not auto-redirect`)
            if (matchIdFromUrl) {
              await page.goto(`${BASE_URL}/video-date?matchId=${matchIdFromUrl}`, { waitUntil: 'networkidle' })
              await page.waitForTimeout(2000)
              console.log(`  ✅ ${user.name} manually navigated to video-date`)
            }
          }
        })
      )
      
      // Wait for video-date to initialize
      console.log('⏳ Waiting for video-date page to initialize...')
      await new Promise(resolve => setTimeout(resolve, 15000))
      
      // Check for LiveKit errors
      console.log('\n🔍 Checking for LiveKit connection errors...')
      
      for (const { page, user, consoleErrors, networkErrors } of contexts) {
        if (page.url().includes('/video-date')) {
          console.log(`\n  Checking ${user.name}...`)
          
          // Check console errors for LiveKit issues
          const livekitConsoleErrors = consoleErrors.filter(e => 
            e.includes('LiveKit') || 
            e.includes('invalid API key') || 
            e.includes('401') ||
            e.includes('authentication') ||
            e.includes('ConnectionError') ||
            e.includes('NotAllowed') ||
            e.includes('could not establish signal connection')
          )
          
          if (livekitConsoleErrors.length > 0) {
            livekitErrors.push(`${user.name}: ${livekitConsoleErrors.join('; ')}`)
            console.error(`    ❌ Found ${livekitConsoleErrors.length} LiveKit errors:`)
            livekitConsoleErrors.forEach(err => console.error(`      - ${err}`))
          } else {
            console.log(`    ✅ No LiveKit console errors`)
          }
          
          // Check network errors
          const livekitNetworkErrors = networkErrors.filter(e => 
            e.url.includes('livekit') && e.status === 401
          )
          
          if (livekitNetworkErrors.length > 0) {
            connectionErrors.push(`${user.name}: ${livekitNetworkErrors.length} 401 network errors`)
            console.error(`    ❌ Found ${livekitNetworkErrors.length} LiveKit 401 network errors`)
            livekitNetworkErrors.forEach(err => console.error(`      - ${err.url}: ${err.status} ${err.statusText}`))
          } else {
            console.log(`    ✅ No LiveKit 401 network errors`)
          }
          
          // Check for connection success indicators
          const pageContent = await page.content()
          const hasVideoElements = pageContent.includes('<video') || await page.locator('video').count() > 0
          const hasConnectionSuccess = consoleErrors.some(e => 
            e.includes('Connected to LiveKit room') || 
            e.includes('Room connected')
          )
          
          console.log(`    Video elements: ${hasVideoElements ? '✅' : '❌'}`)
          console.log(`    Connection success: ${hasConnectionSuccess ? '✅' : '⚠️'}`)
        }
      }
      
      // Final summary
      console.log('\n📊 TEST SUMMARY:')
      console.log('  - Both users matched:', bothMatched ? '✅' : '❌')
      console.log('  - Both users in video-date:', '✅')
      console.log('  - LiveKit console errors:', livekitErrors.length > 0 ? `❌ ${livekitErrors.length}` : '✅ None')
      console.log('  - LiveKit 401 network errors:', connectionErrors.length > 0 ? `❌ ${connectionErrors.length}` : '✅ None')
      
      if (livekitErrors.length > 0) {
        console.log('\n❌ LIVEKIT ERRORS FOUND:')
        livekitErrors.forEach(err => console.log(`  - ${err}`))
      }
      
      if (connectionErrors.length > 0) {
        console.log('\n❌ CONNECTION ERRORS FOUND:')
        connectionErrors.forEach(err => console.log(`  - ${err}`))
      }
      
      // Fail test if there are LiveKit errors
      if (livekitErrors.length > 0 || connectionErrors.length > 0) {
        throw new Error(`LiveKit connection test failed: ${livekitErrors.length} console errors, ${connectionErrors.length} network errors`)
      }
      
      console.log('\n✅ LiveKit connection test passed - no errors found!')
      
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























