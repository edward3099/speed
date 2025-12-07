import { test, expect } from '@playwright/test'

/**
 * End-to-End Flow Tests
 * 
 * Tests the complete flow:
 * 1. User spins
 * 2. User waits in spinning page
 * 3. User gets matched
 * 4. User votes
 * 5. Outcome resolution
 */

test.describe('E2E: Spin to Vote Flow', () => {
  test('should complete full flow: spin → match → vote yes → video-date', async ({ page }) => {
    const testMatchId = 'e2e-match-123'
    let matchCreated = false

    // Step 1: Mock spin API
    await page.route('**/api/spin', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    // Step 2: Navigate to spin page and click Start Spin
    await page.goto('/spin')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Click Start Spin button
    const startSpinButton = page.locator('button:has-text("Start Spin"), button:has-text("Spin")').first()
    await startSpinButton.click()

    // Step 3: Should redirect to spinning page
    await page.waitForURL('**/spinning', { timeout: 5000 })
    expect(page.url()).toContain('/spinning')

    // Step 4: Mock match status - initially waiting, then matched
    let pollCount = 0
    await page.route('**/api/match/status', async (route) => {
      pollCount++
      
      if (pollCount <= 2) {
        // First few polls: still waiting
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'waiting',
            match: null
          }),
        })
      } else {
        // After a few polls: matched!
        matchCreated = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'paired',
            match: {
              match_id: testMatchId,
              partner_id: 'partner-123',
              partner: {
                id: 'partner-123',
                name: 'Test Partner',
                age: 25,
                photo: 'https://example.com/photo.jpg',
                bio: 'Test bio'
              }
            }
          }),
        })
      }
    })

    // Step 5: Wait for match (should redirect to voting-window)
    await page.waitForURL('**/voting-window*', { timeout: 10000 })
    expect(page.url()).toContain('/voting-window')
    expect(page.url()).toContain(`matchId=${testMatchId}`)

    // Step 6: Mock acknowledge API
    await page.route('**/api/match/acknowledge', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          vote_window_started: true,
          vote_window_expires_at: new Date(Date.now() + 30000).toISOString()
        }),
      })
    })

    // Step 7: Update match status to vote_window
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'vote_window',
          match: {
            match_id: testMatchId,
            partner: {
              id: 'partner-123',
              name: 'Test Partner',
              age: 25,
              photo: 'https://example.com/photo.jpg',
              bio: 'Test bio'
            },
            vote_window_expires_at: new Date(Date.now() + 30000).toISOString()
          }
        }),
      })
    })

    // Step 8: Wait for voting buttons to appear
    const yesButton = page.locator('button:has-text("Yes"), button:has-text("YES")').first()
    await expect(yesButton).toBeVisible({ timeout: 5000 })

    // Step 9: Mock vote API to return both_yes
    await page.route('**/api/vote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          outcome: 'both_yes',
          match_ended: true,
          match_id: testMatchId
        }),
      })
    })

    // Step 10: Click Yes button
    await yesButton.click()

    // Step 11: Should redirect to video-date
    await page.waitForURL('**/video-date*', { timeout: 10000 })
    expect(page.url()).toContain('/video-date')
    expect(page.url()).toContain(`matchId=${testMatchId}`)
  })

  test('should complete flow: spin → match → vote pass → respin', async ({ page }) => {
    const testMatchId = 'e2e-match-pass-123'

    // Mock spin API
    await page.route('**/api/spin', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    // Navigate and start spin
    await page.goto('/spin')
    await page.waitForLoadState('networkidle')
    
    const startSpinButton = page.locator('button:has-text("Start Spin"), button:has-text("Spin")').first()
    await startSpinButton.click()

    // Wait for spinning page
    await page.waitForURL('**/spinning', { timeout: 5000 })

    // Mock match status - waiting then matched
    let pollCount = 0
    await page.route('**/api/match/status', async (route) => {
      pollCount++
      
      if (pollCount <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'waiting',
            match: null
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'paired',
            match: {
              match_id: testMatchId,
              partner_id: 'partner-123',
              partner: {
                id: 'partner-123',
                name: 'Test Partner',
                age: 25,
                photo: 'https://example.com/photo.jpg',
                bio: 'Test bio'
              }
            }
          }),
        })
      }
    })

    // Wait for voting-window
    await page.waitForURL('**/voting-window*', { timeout: 10000 })

    // Mock acknowledge
    await page.route('**/api/match/acknowledge', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          vote_window_started: true,
          vote_window_expires_at: new Date(Date.now() + 30000).toISOString()
        }),
      })
    })

    // Update to vote_window state
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'vote_window',
          match: {
            match_id: testMatchId,
            partner: {
              id: 'partner-123',
              name: 'Test Partner',
              age: 25,
              photo: 'https://example.com/photo.jpg',
              bio: 'Test bio'
            },
            vote_window_expires_at: new Date(Date.now() + 30000).toISOString()
          }
        }),
      })
    })

    // Wait for pass button
    const passButton = page.locator('button:has-text("Pass"), button:has-text("PASS")').first()
    await expect(passButton).toBeVisible({ timeout: 5000 })

    // Mock vote API to return pass outcome
    await page.route('**/api/vote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          outcome: 'yes_pass', // One user voted pass
          match_ended: true,
          match_id: testMatchId
        }),
      })
    })

    // Click Pass button
    await passButton.click()

    // Should redirect to spinning (respin)
    await page.waitForURL('**/spinning', { timeout: 10000 })
    expect(page.url()).toContain('/spinning')
  })

  test('should handle multiple users spinning simultaneously', async ({ browser }) => {
    // Create two browser contexts (simulating two users)
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const testMatchId = 'multi-user-match-123'

    // Setup mocks for both pages
    const setupMocks = async (page: any) => {
      await page.route('**/api/spin', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      })
    }

    await setupMocks(page1)
    await setupMocks(page2)

    // Both users navigate to spin page
    await Promise.all([
      page1.goto('/spin'),
      page2.goto('/spin')
    ])

    await Promise.all([
      page1.waitForLoadState('networkidle'),
      page2.waitForLoadState('networkidle')
    ])

    // Both users click Start Spin simultaneously
    const startSpin1 = page1.locator('button:has-text("Start Spin"), button:has-text("Spin")').first()
    const startSpin2 = page2.locator('button:has-text("Start Spin"), button:has-text("Spin")').first()

    await Promise.all([
      startSpin1.click(),
      startSpin2.click()
    ])

    // Both should redirect to spinning
    await Promise.all([
      page1.waitForURL('**/spinning', { timeout: 5000 }),
      page2.waitForURL('**/spinning', { timeout: 5000 })
    ])

    // Mock match status for both - they get matched
    let pollCount1 = 0
    let pollCount2 = 0

    await page1.route('**/api/match/status', async (route) => {
      pollCount1++
      if (pollCount1 <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state: 'waiting', match: null }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'paired',
            match: {
              match_id: testMatchId,
              partner_id: 'user2',
              partner: { id: 'user2', name: 'User 2', age: 25, photo: '', bio: '' }
            }
          }),
        })
      }
    })

    await page2.route('**/api/match/status', async (route) => {
      pollCount2++
      if (pollCount2 <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state: 'waiting', match: null }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'paired',
            match: {
              match_id: testMatchId,
              partner_id: 'user1',
              partner: { id: 'user1', name: 'User 1', age: 25, photo: '', bio: '' }
            }
          }),
        })
      }
    })

    // Both should redirect to voting-window
    await Promise.all([
      page1.waitForURL('**/voting-window*', { timeout: 10000 }),
      page2.waitForURL('**/voting-window*', { timeout: 10000 })
    ])

    // Verify both are on voting-window
    expect(page1.url()).toContain('/voting-window')
    expect(page2.url()).toContain('/voting-window')
    expect(page1.url()).toContain(`matchId=${testMatchId}`)
    expect(page2.url()).toContain(`matchId=${testMatchId}`)

    // Cleanup
    await context1.close()
    await context2.close()
  })
})

