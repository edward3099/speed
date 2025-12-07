import { test, expect } from '@playwright/test'
import { VotingWindowPage } from './page-objects/VotingWindowPage'

/**
 * Voting Window Tests
 * 
 * Tests the /voting-window page functionality:
 * - Partner profile display
 * - Countdown timer
 * - Voting buttons (yes/pass)
 * - Outcome resolution
 * - Redirects based on outcomes
 */

test.describe('Voting Window', () => {
  const testMatchId = 'test-match-id-123'
  const testPartner = {
    id: 'test-partner-id',
    name: 'Test Partner',
    age: 25,
    photo: 'https://example.com/photo.jpg',
    bio: 'Test bio'
  }

  let votingPage: VotingWindowPage

  test.beforeEach(async ({ page }) => {
    votingPage = new VotingWindowPage(page)
    // Mock match status API
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'vote_window',
          match: {
            match_id: testMatchId,
            partner_id: testPartner.id,
            partner: testPartner,
            vote_window_expires_at: new Date(Date.now() + 30000).toISOString(), // 30 seconds from now
            status: 'vote_active',
            outcome: null
          }
        }),
      })
    })

    // Navigate to voting window using Page Object
    await votingPage.goto(testMatchId)
  })

  test('should display partner profile', async ({ page }) => {
    // Wait for partner info to load
    await expect(page.locator(`text=${testPartner.name}`)).toBeVisible({ timeout: 5000 })
    
    // Check partner details
    if (testPartner.age) {
      await expect(page.locator(`text=${testPartner.age}`)).toBeVisible()
    }
    if (testPartner.bio) {
      await expect(page.locator(`text=${testPartner.bio}`)).toBeVisible()
    }
  })

  test('should display countdown timer', async ({ page }) => {
    // Countdown should be visible
    // The timer shows remaining seconds
    const countdownElement = page.locator('[data-testid="countdown"], text=/\\d+/').first()
    await expect(countdownElement).toBeVisible({ timeout: 5000 })
  })

  test('should display voting buttons', async () => {
    // Wait for buttons using Page Object
    await votingPage.waitForButtons()
    
    // Check for Yes button
    await expect(votingPage.yesButton).toBeVisible({ timeout: 5000 })

    // Check for Pass button
    await expect(votingPage.passButton).toBeVisible({ timeout: 5000 })
  })

  test('should redirect to video-date when both users vote yes', async ({ page }) => {
    // Mock vote API to return both_yes outcome
    await page.route('**/api/vote', async (route) => {
      const request = route.request()
      const postData = request.postDataJSON()
      
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

    // Click Yes button using Page Object
    await votingPage.clickYes()

    // Wait for redirect to video-date using Page Object
    await votingPage.waitForVideoDate()
    
    // Verify redirect
    expect(votingPage.isOnVideoDate()).toBe(true)
    expect(page.url()).toContain(`matchId=${testMatchId}`)
  })

  test('should redirect to spinning when one user votes pass', async ({ page }) => {
    // Mock vote API to return yes_pass outcome
    await page.route('**/api/vote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          outcome: 'yes_pass',
          match_ended: true,
          match_id: testMatchId
        }),
      })
    })

    // Click Pass button using Page Object
    await votingPage.clickPass()

    // Wait for redirect to spinning using Page Object
    await votingPage.waitForSpinning()
    
    // Verify redirect
    expect(votingPage.isOnSpinning()).toBe(true)
  })

  test('should redirect to spinning when both users vote pass', async ({ page }) => {
    // Mock vote API to return pass_pass outcome
    await page.route('**/api/vote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          outcome: 'pass_pass',
          match_ended: true,
          match_id: testMatchId
        }),
      })
    })

    // Click Pass button
    const passButton = page.locator('button:has-text("Pass"), button:has-text("PASS")').first()
    await passButton.click()

    // Wait for redirect to spinning
    await page.waitForURL('**/spinning', { timeout: 10000 })
    
    // Verify redirect
    expect(page.url()).toContain('/spinning')
  })

  test('should poll match status every 1 second', async ({ page }) => {
    const statusCalls: any[] = []
    
    page.on('response', (response) => {
      if (response.url().includes('/api/match/status')) {
        statusCalls.push({ timestamp: Date.now() })
      }
    })

    // Wait for initial poll + at least 2 more polls (2+ seconds)
    await page.waitForTimeout(3000)

    // Verify polling occurred (at least 2-3 calls)
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
    
    // Verify polling interval (should be ~1 second between calls)
    if (statusCalls.length >= 2) {
      const interval = statusCalls[1].timestamp - statusCalls[0].timestamp
      // Allow some variance (800-1200ms)
      expect(interval).toBeGreaterThan(800)
      expect(interval).toBeLessThan(1200)
    }
  })

  test('should handle vote API errors gracefully', async ({ page }) => {
    // Mock vote API to return error
    await page.route('**/api/vote', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to record vote' }),
      })
    })

    // Click Yes button
    const yesButton = page.locator('button:has-text("Yes"), button:has-text("YES")').first()
    await yesButton.click()

    // Should still be on voting-window (not redirect on error)
    await page.waitForTimeout(2000)
    expect(page.url()).toContain('/voting-window')
    
    // Button should be clickable again (vote was reset)
    await expect(yesButton).toBeVisible()
  })

  test('should prevent double voting', async ({ page }) => {
    let voteCallCount = 0

    // Mock vote API
    await page.route('**/api/vote', async (route) => {
      voteCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          outcome: 'yes_pass',
          match_ended: true
        }),
      })
    })

    const yesButton = page.locator('button:has-text("Yes"), button:has-text("YES")').first()
    
    // Click multiple times quickly
    await yesButton.click()
    await page.waitForTimeout(100)
    await yesButton.click()
    await page.waitForTimeout(100)
    await yesButton.click()

    // Wait a bit
    await page.waitForTimeout(1000)

    // Should only call API once (prevented double voting)
    expect(voteCallCount).toBe(1)
  })

  test('should redirect to video-date if match outcome is already both_yes', async ({ page }) => {
    // Mock match status to return both_yes outcome
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'idle', // State might be cleared but match still exists
          match: {
            match_id: testMatchId,
            outcome: 'both_yes',
            status: 'completed',
            partner: testPartner
          }
        }),
      })
    })

    // Navigate to voting window
    await page.goto(`/voting-window?matchId=${testMatchId}`)

    // Should redirect immediately to video-date
    await page.waitForURL('**/video-date*', { timeout: 5000 })
    expect(page.url()).toContain('/video-date')
  })

  test('should acknowledge match when in paired state', async ({ page }) => {
    let acknowledgeCallCount = 0

    // Mock match status to return paired state
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'paired',
          match: {
            match_id: testMatchId,
            partner: testPartner
          }
        }),
      })
    })

    // Mock acknowledge API
    await page.route('**/api/match/acknowledge', async (route) => {
      acknowledgeCallCount++
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

    // Navigate to voting window
    await page.goto(`/voting-window?matchId=${testMatchId}`)

    // Wait for acknowledge to be called
    await page.waitForTimeout(2000)

    // Verify acknowledge was called
    expect(acknowledgeCallCount).toBeGreaterThan(0)
  })

  test('should redirect to spinning if match is completed but not both_yes', async ({ page }) => {
    // Mock match status to return completed match (not both_yes)
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'waiting',
          match: {
            match_id: testMatchId,
            status: 'completed',
            outcome: 'yes_pass', // Not both_yes
            partner: testPartner
          }
        }),
      })
    })

    // Navigate to voting window
    await page.goto(`/voting-window?matchId=${testMatchId}`)

    // Should redirect to spinning
    await page.waitForURL('**/spinning', { timeout: 5000 })
    expect(page.url()).toContain('/spinning')
  })
})

