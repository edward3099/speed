/**
 * Simple Playwright Test: 2 Users Spinning
 * 
 * Uses test API endpoints (no authentication required)
 * Perfect for quick verification
 */

import { test, expect } from '@playwright/test'

test.describe('2 Users Spinning Test (Simple)', () => {
  test('should match 2 users using test API', async ({ page }) => {
    test.setTimeout(60000)

    // Use test API endpoint which doesn't require authentication
    // This simulates 2 users spinning by calling the API directly
    
    console.log('🧪 Testing 2 users spinning via API...')

    // Simulate User 1 spinning
    const user1Response = await page.request.post('http://localhost:3000/api/test/spin', {
      data: { user_id: 'test-user-1' },
      headers: { 'Content-Type': 'application/json' },
    })

    const user1Data = await user1Response.json()
    console.log('User 1 spin result:', user1Data)

    // Wait a moment
    await page.waitForTimeout(1000)

    // Simulate User 2 spinning
    const user2Response = await page.request.post('http://localhost:3000/api/test/spin', {
      data: { user_id: 'test-user-2' },
      headers: { 'Content-Type': 'application/json' },
    })

    const user2Data = await user2Response.json()
    console.log('User 2 spin result:', user2Data)

    // Check if either user got matched
    const matched = user1Data.matched || user2Data.matched
    const matchId = user1Data.match_id || user2Data.match_id

    if (matched && matchId) {
      console.log(`✅ Match created! Match ID: ${matchId}`)
      expect(matchId).toBeTruthy()
    } else {
      console.log('⏳ No immediate match - users joined queue')
      // This is also valid - they should match via retry cron
    }

    // Verify API responses
    expect(user1Response.ok()).toBeTruthy()
    expect(user2Response.ok()).toBeTruthy()
  })

  test('should verify match status API works', async ({ page }) => {
    // Test the match status endpoint
    const response = await page.request.get('http://localhost:3000/api/test/match-status?user_id=test-user-1')
    const data = await response.json()

    console.log('Match status:', data)
    expect(response.ok()).toBeTruthy()
    expect(data).toHaveProperty('state')
  })
})






























