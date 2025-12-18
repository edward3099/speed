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

test.describe('LiveKit Error Detection Test', () => {
  let testUsers: TestUser[] = []
  
  test('should detect and capture LiveKit errors including UI notifications', async ({ browser }) => {
    test.setTimeout(300000) // 5 minutes
    
    const BASE_URL = process.env.TEST_BASE_URL || 'https://speed-jgm2wy6z9-eds-projects-934496ce.vercel.app'
    console.log(`🌐 Testing against: ${BASE_URL}`)
    
    const timestamp = Date.now()
    const password = 'TestPassword123!'
    
    // Track all errors
    const allErrors: any[] = []
    
    try {
      // Create compatible test users
      console.log('👤 Creating compatible test users...')
      
      const user1 = await createTestUser(
        `test-male-error-detection-${timestamp}@test.com`,
        password,
        'Test Male Error',
        'male',
        25
      )
      testUsers.push(user1)
      
      const user2 = await createTestUser(
        `test-female-error-detection-${timestamp}@test.com`,
        password,
        'Test Female Error',
        'female',
        24
      )
      testUsers.push(user2)
      
      // Update profiles and preferences
      await supabase.from('profiles').update({ age: 25 }).eq('id', user1.userId)
      await supabase.from('profiles').update({ age: 24 }).eq('id', user2.userId)
      
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
      
      // Create browser contexts
      console.log('🌐 Opening browser contexts...')
      const contexts: { 
        context: any
        page: any
        user: TestUser
        errors: any[]
        screenshots: string[]
      }[] = []
      
      for (const user of testUsers) {
        const context = await browser.newContext()
        const page = await context.newPage()
        
        const errors: any[] = []
        const screenshots: string[] = []
        
        // Capture ALL console messages
        page.on('console', (msg) => {
          const text = msg.text()
          const type = msg.type()
          
          // Capture all errors and warnings
          if (type === 'error' || type === 'warning') {
            if (text.includes('LiveKit') || 
                text.includes('401') ||
                text.includes('invalid API key') ||
                text.includes('authentication') ||
                text.includes('ConnectionError') ||
                text.includes('NotAllowed') ||
                text.includes('could not establish') ||
                text.includes('Toast not available')) {
              errors.push({
                type: 'console',
                level: type,
                message: text,
                timestamp: new Date().toISOString()
              })
            }
          }
        })
        
        // Capture page errors
        page.on('pageerror', (error) => {
          const errorMsg = error.message
          if (errorMsg.includes('LiveKit') || 
              errorMsg.includes('401') ||
              errorMsg.includes('invalid') ||
              errorMsg.includes('authentication')) {
            errors.push({
              type: 'pageerror',
              message: errorMsg,
              stack: error.stack,
              timestamp: new Date().toISOString()
            })
          }
        })
        
        // Capture network failures
        page.on('response', async (response) => {
          const url = response.url()
          const status = response.status()
          
          if (url.includes('livekit') && status >= 400) {
            let errorBody = ''
            try {
              errorBody = await response.text()
            } catch {}
            
            errors.push({
              type: 'network',
              url: url,
              status: status,
              statusText: response.statusText(),
              body: errorBody.substring(0, 200),
              timestamp: new Date().toISOString()
            })
          }
        })
        
        contexts.push({ context, page, user, errors, screenshots })
        
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
      
      // Start spin
      console.log('🎰 Starting spin...')
      await Promise.all(contexts.map(async ({ page, user }) => {
        const spinButton = page.getByRole('button', { name: /start spin/i }).first()
        await expect(spinButton).toBeVisible({ timeout: 20000 })
        await spinButton.click({ force: true })
        console.log(`  ✅ ${user.name} clicked Start Spin`)
      }))
      
      // Wait for matches (with faster polling)
      await new Promise(resolve => setTimeout(resolve, 15000))
      
      let bothMatched = false
      for (let i = 0; i < 8; i++) {
        const matchResults = await Promise.all(
          contexts.map(async ({ page }) => ({ url: page.url() }))
        )
        const matched = matchResults.filter(r => r.url.includes('/voting-window'))
        if (matched.length === 2) {
          bothMatched = true
          break
        }
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      
      if (!bothMatched) {
        throw new Error('Users did not match')
      }
      
      // Vote yes
      console.log('🗳️ Voting yes...')
      for (const { page, user } of contexts) {
        if (page.url().includes('/voting-window')) {
          const yesButton = page.getByRole('button', { name: /yes/i }).first()
          await expect(yesButton).toBeVisible({ timeout: 10000 })
          await yesButton.click({ force: true })
          console.log(`  ✅ ${user.name} voted yes`)
        }
      }
      
      // Wait for video-date
      const matchIdFromUrl = contexts[0].page.url().match(/matchId=([^&]+)/)?.[1]
      
      await Promise.all(
        contexts.map(async ({ page, user }) => {
          try {
            await page.waitForURL(/\/video-date/, { timeout: 30000 })
          } catch {
            if (matchIdFromUrl) {
              await page.goto(`${BASE_URL}/video-date?matchId=${matchIdFromUrl}`, { waitUntil: 'networkidle' })
            }
          }
        })
      )
      
      // Wait and monitor for errors
      console.log('⏳ Monitoring for errors (30 seconds)...')
      
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        for (const { page, user, errors, screenshots } of contexts) {
          if (page.url().includes('/video-date')) {
            // Look for the red ErrorDebugger button at bottom right (the one that turns red)
            const errorDebuggerButton = page.locator('button').filter({ 
              has: page.locator('svg'), // Has an icon
            }).filter({
              hasText: /errors/i
            }).or(
              page.locator('button[class*="red"]').filter({
                has: page.locator('svg')
              })
            ).or(
              page.locator('button').filter({
                has: page.locator('[class*="AlertCircle"]')
              })
            )
            
            // Also try to find it by position (bottom right)
            const bottomRightButtons = await page.locator('button[class*="fixed"][class*="bottom"]').all()
            
            for (const button of bottomRightButtons) {
              const classes = await button.getAttribute('class').catch(() => '')
              const hasRed = classes.includes('red') || classes.includes('bg-red')
              const hasBadge = await button.locator('span[class*="absolute"]').isVisible().catch(() => false)
              
              if (hasRed || hasBadge) {
                const badgeText = await button.locator('span').textContent().catch(() => '')
                const isVisible = await button.isVisible().catch(() => false)
                
                if (isVisible) {
                  console.log(`    🔴 Found red error button for ${user.name} (badge: ${badgeText})`)
                  
                  errors.push({
                    type: 'error_debugger_button',
                    message: `Red error debugger button appeared (badge: ${badgeText})`,
                    timestamp: new Date().toISOString()
                  })
                  
                  // Click the button to open the debugger
                  await button.click({ force: true }).catch(() => {})
                  await page.waitForTimeout(500)
                  
                  // Now look for the debugger panel that opens (quick check)
                  const debuggerPanel = page.locator('[class*="bg-black"][class*="backdrop-blur"]').filter({
                    hasText: /Errors|Error/i
                  }).first()
                  
                  const panelVisible = await debuggerPanel.isVisible().catch(() => false)
                  if (panelVisible) {
                    const panelText = await debuggerPanel.textContent().catch(() => '')
                    errors.push({
                      type: 'error_debugger_panel',
                      message: `Error debugger panel opened: ${panelText?.substring(0, 300)}`,
                      timestamp: new Date().toISOString()
                    })
                    
                    // Get error messages from the panel (quick scan, no expansion)
                    const errorItems = await debuggerPanel.locator('text=/LiveKit|401|invalid/i').all()
                    for (const item of errorItems.slice(0, 5)) { // Limit to first 5
                      const text = await item.textContent().catch(() => '')
                      if (text) {
                        errors.push({
                          type: 'error_debugger_item',
                          message: text.substring(0, 150),
                          timestamp: new Date().toISOString()
                        })
                      }
                    }
                  }
                }
              }
            }
            
            // Look for error toasts/notifications
            const errorToasts = await page.locator('[class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"]').filter({ 
              hasText: /LiveKit|API key|401|invalid|authentication|connection failed/i 
            }).all()
            
            if (errorToasts.length > 0) {
              for (const toast of errorToasts) {
                const text = await toast.textContent().catch(() => '')
                errors.push({
                  type: 'ui_toast',
                  message: text,
                  timestamp: new Date().toISOString()
                })
              }
            }
            
            // Check for any visible error messages
            const errorMessages = await page.locator('text=/LiveKit|invalid API key|401|authentication failed/i').all()
            for (const msg of errorMessages) {
              const text = await msg.textContent().catch(() => '')
              const isVisible = await msg.isVisible().catch(() => false)
              if (isVisible && text) {
                errors.push({
                  type: 'ui_message',
                  message: text,
                  timestamp: new Date().toISOString()
                })
              }
            }
          }
        }
      }
      
      // Collect all errors
      for (const { user, errors } of contexts) {
        if (errors.length > 0) {
          allErrors.push({
            user: user.name,
            errors: errors
          })
        }
      }
      
      // Take final screenshots if errors found
      if (allErrors.length > 0) {
        console.log('\n📸 Taking screenshots of error states...')
        for (const { page, user, screenshots } of contexts) {
          if (page.url().includes('/video-date')) {
            const screenshot = await page.screenshot({ 
              path: `test-results/error-${user.name}-${Date.now()}.png`,
              fullPage: true 
            }).catch(() => null)
            if (screenshot) {
              screenshots.push(`error-${user.name}-${Date.now()}.png`)
            }
          }
        }
      }
      
      // Report results
      console.log('\n📊 ERROR DETECTION SUMMARY:')
      console.log(`  Total error sources: ${allErrors.length}`)
      
      for (const errorGroup of allErrors) {
        console.log(`\n  ${errorGroup.user}:`)
        const byType = errorGroup.errors.reduce((acc: any, err: any) => {
          acc[err.type] = (acc[err.type] || 0) + 1
          return acc
        }, {})
        
        for (const [type, count] of Object.entries(byType)) {
          console.log(`    ${type}: ${count} errors`)
        }
        
        // Show sample errors
        const sampleErrors = errorGroup.errors.slice(0, 5)
        sampleErrors.forEach((err: any) => {
          console.log(`    - [${err.type}] ${err.message?.substring(0, 100)}`)
        })
      }
      
      if (allErrors.length > 0) {
        // Log all errors before throwing
        console.log('\n❌ ERRORS DETECTED:')
        for (const errorGroup of allErrors) {
          console.log(`\n  ${errorGroup.user}:`)
          const livekitErrors = errorGroup.errors.filter((e: any) => 
            e.message?.includes('LiveKit') || 
            e.message?.includes('401') ||
            e.message?.includes('invalid') ||
            e.message?.includes('authentication') ||
            e.type === 'error_debugger_button' ||
            e.type === 'error_debugger_panel'
          )
          
          if (livekitErrors.length > 0) {
            console.log(`    🔴 LiveKit-related errors: ${livekitErrors.length}`)
            livekitErrors.slice(0, 5).forEach((err: any) => {
              console.log(`      - [${err.type}] ${err.message?.substring(0, 150)}`)
            })
          }
        }
        
        throw new Error(`Found ${allErrors.length} error source(s) with ${allErrors.reduce((sum, g) => sum + g.errors.length, 0)} total errors`)
      }
      
      console.log('\n✅ No errors detected!')
      
    } finally {
      // Cleanup
      for (const user of testUsers) {
        await deleteTestUser(user.userId).catch(() => {})
      }
    }
  })
})























