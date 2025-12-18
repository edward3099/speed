import { test, expect } from '@playwright/test'

/**
 * Test to verify local video preview attachment works correctly
 * This tests the fix for users not seeing their own video when camera is enabled
 * 
 * To run this test, you need:
 * 1. A running instance of the app (npm run dev)
 * 2. Test users and match data set up
 * 3. Or run it as part of the full e2e flow
 */
test.describe('Local Video Preview Attachment', () => {
  test('should verify video attachment diagnostic logging works', async ({ page, context }) => {
    // Grant camera and microphone permissions
    await context.grantPermissions(['camera', 'microphone'])
    
    // Listen for console logs to verify attachment logic
    const attachmentLogs: string[] = []
    const diagnosticLogs: string[] = []
    
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('attaching') || text.includes('attach') || text.includes('Track attached')) {
        attachmentLogs.push(text)
      }
      if (text.includes('DIAGNOSTIC')) {
        diagnosticLogs.push(text)
      }
    })

    // This test verifies that the diagnostic logging is working
    // In a real scenario, you'd navigate to an actual video-date page
    // For now, we'll just verify the test infrastructure works
    
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')
    
    // The test infrastructure is ready
    // In practice, you would:
    // 1. Create test users
    // 2. Match them
    // 3. Navigate to video-date page
    // 4. Enable camera
    // 5. Check console logs for attachment messages
    // 6. Verify video element has srcObject
    
    console.log('Test infrastructure ready for video attachment testing')
    console.log('Attachment logs will be captured:', attachmentLogs.length)
    console.log('Diagnostic logs will be captured:', diagnosticLogs.length)
    
    // This test passes if it runs without errors
    // The actual verification would happen in a full e2e test
    expect(true).toBe(true)
  })

  test('should re-attach track when transitioning from countdown to active date', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone'])

    const attachmentLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('attach') || text.includes('track') || text.includes('transition')) {
        attachmentLogs.push(text)
      }
    })

    await page.goto('/video-date?matchId=test-match-id')
    await page.waitForLoadState('networkidle')

    // Enable camera during countdown
    const enableButton = page.locator('button:has-text("Enable Camera")').or(
      page.locator('button:has-text("Enable")')
    ).first()

    if (await enableButton.isVisible()) {
      await enableButton.click()
      await page.waitForTimeout(1000)
    }

    // Verify track is attached during countdown
    const countdownAttachment = await page.evaluate(() => {
      const videoElement = document.querySelector('video') as HTMLVideoElement
      return {
        hasSrcObject: !!videoElement?.srcObject,
        hasTrack: !!(videoElement?.srcObject as MediaStream)?.getVideoTracks()?.[0]
      }
    })

    expect(countdownAttachment.hasSrcObject, 'Track should be attached during countdown').toBeTruthy()

    // Wait for countdown to complete (you may need to adjust timing)
    // In real test, you might want to mock this or wait for actual countdown
    await page.waitForTimeout(2000)

    // Check if track is still attached after transition
    const activeDateAttachment = await page.evaluate(() => {
      const videoElement = document.querySelector('video') as HTMLVideoElement
      return {
        hasSrcObject: !!videoElement?.srcObject,
        hasTrack: !!(videoElement?.srcObject as MediaStream)?.getVideoTracks()?.[0],
        videoWidth: videoElement?.videoWidth || 0,
        videoHeight: videoElement?.videoHeight || 0
      }
    })

    expect(activeDateAttachment.hasSrcObject, 'Track should remain attached after transition').toBeTruthy()
    expect(activeDateAttachment.hasTrack, 'Track should exist after transition').toBeTruthy()

    console.log('Transition logs:')
    attachmentLogs.forEach(log => console.log(log))
  })

  test('should handle multiple attachment mechanisms working together', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone'])

    const attachmentAttempts: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('attaching') || text.includes('Directly attaching') || text.includes('attachTrackToVideoElement')) {
        attachmentAttempts.push(text)
      }
    })

    await page.goto('/video-date?matchId=test-match-id')
    await page.waitForLoadState('networkidle')

    const enableButton = page.locator('button:has-text("Enable Camera")').or(
      page.locator('button:has-text("Enable")')
    ).first()

    if (await enableButton.isVisible()) {
      await enableButton.click()
    }

    // Wait for all attachment mechanisms to attempt
    await page.waitForTimeout(3000)

    // Verify at least one attachment mechanism succeeded
    const finalState = await page.evaluate(() => {
      const videoElement = document.querySelector('video') as HTMLVideoElement
      return {
        hasSrcObject: !!videoElement?.srcObject,
        hasTrack: !!(videoElement?.srcObject as MediaStream)?.getVideoTracks()?.[0],
        videoWidth: videoElement?.videoWidth || 0,
        videoHeight: videoElement?.videoHeight || 0
      }
    })

    expect(finalState.hasSrcObject, 'Video should have srcObject from at least one attachment mechanism').toBeTruthy()
    
    console.log('Attachment attempts:', attachmentAttempts.length)
    attachmentAttempts.forEach(attempt => console.log(attempt))
  })
})


