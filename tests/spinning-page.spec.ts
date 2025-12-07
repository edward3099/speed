import { test, expect } from '@playwright/test'
import { SpinningPage } from './page-objects/SpinningPage'

/**
 * Spinning Page Tests
 * 
 * Tests the /spinning page functionality:
 * - Spinning animation display
 * - Polling for match status
 * - Redirect to voting-window when matched
 * - Auto-join queue if idle
 */

test.describe('Spinning Page', () => {
  let spinningPage: SpinningPage

  test.beforeEach(async ({ page }) => {
    spinningPage = new SpinningPage(page)
    // Mock authentication - you may need to adjust this based on your auth setup
    // For now, we'll assume the user is already logged in
    await spinningPage.goto()
  })

  test('should display spinning animation', async ({ page }) => {
    // Check for spinning animation elements
    await expect(spinningPage.findingMatchText).toBeVisible({ timeout: 5000 })
    
    // Check for sparkles icon (spinning animation)
    await expect(spinningPage.spinningAnimation).toBeVisible()
  })

  test('should poll match status every 2 seconds', async ({ page }) => {
    // Intercept API calls to verify polling
    const statusCalls: any[] = []
    
    page.on('response', (response) => {
      if (response.url().includes('/api/match/status')) {
        statusCalls.push({
          url: response.url(),
          timestamp: Date.now(),
        })
      }
    })

    // Wait for initial poll + at least 2 more polls (4+ seconds)
    await page.waitForTimeout(5000)

    // Verify polling occurred (at least 2-3 calls)
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
    
    // Verify polling interval (should be ~2 seconds between calls)
    if (statusCalls.length >= 2) {
      const interval = statusCalls[1].timestamp - statusCalls[0].timestamp
      // Allow some variance (1800-2200ms)
      expect(interval).toBeGreaterThan(1800)
      expect(interval).toBeLessThan(2200)
    }
  })

  test('should redirect to voting-window when matched', async ({ page }) => {
    // Mock the match status API to return a match
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'paired',
          match: {
            match_id: 'test-match-id-123',
            partner_id: 'test-partner-id',
            partner: {
              id: 'test-partner-id',
              name: 'Test Partner',
              age: 25,
              photo: 'https://example.com/photo.jpg',
              bio: 'Test bio'
            }
          }
        }),
      })
    })

    // Wait for redirect using Page Object
    await spinningPage.waitForMatch()
    
    // Verify we're on voting-window page
    expect(spinningPage.isOnVotingWindow()).toBe(true)
    expect(page.url()).toContain('matchId=test-match-id-123')
  })

  test('should auto-join queue if state is idle', async ({ page }) => {
    let spinCallCount = 0

    // Mock match status to return idle state
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'idle',
          match: null
        }),
      })
    })

    // Mock spin API
    await page.route('**/api/spin', async (route) => {
      spinCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    // Wait for auto-join to trigger
    await page.waitForTimeout(3000)

    // Verify spin API was called
    expect(spinCallCount).toBeGreaterThan(0)
  })

  test('should redirect to spin page if join queue fails', async ({ page }) => {
    // Mock match status to return idle state
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'idle',
          match: null
        }),
      })
    })

    // Mock spin API to fail
    await page.route('**/api/spin', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to join queue' }),
      })
    })

    // Wait for redirect
    await page.waitForURL('**/spin', { timeout: 10000 })
    
    // Verify we're on spin page
    expect(page.url()).toContain('/spin')
  })

  test('should handle polling errors gracefully', async ({ page }) => {
    // Mock match status to return error
    await page.route('**/api/match/status', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    // Page should still be visible (not crash)
    await page.waitForTimeout(3000)
    await expect(page.locator('text=Finding your match...')).toBeVisible()
  })

  test('should stop polling when component unmounts', async ({ page }) => {
    const statusCalls: any[] = []
    
    page.on('response', (response) => {
      if (response.url().includes('/api/match/status')) {
        statusCalls.push({ timestamp: Date.now() })
      }
    })

    // Navigate away from spinning page
    await page.goto('/spin')
    
    // Wait a bit
    await page.waitForTimeout(3000)

    // Count calls after navigation
    const callsAfterNavigation = statusCalls.length
    const lastCallTime = statusCalls[statusCalls.length - 1]?.timestamp

    // Wait another 3 seconds
    await page.waitForTimeout(3000)

    // Verify no new calls were made (polling stopped)
    expect(statusCalls.length).toBe(callsAfterNavigation)
  })
})

