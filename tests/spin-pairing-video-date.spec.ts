import { test, expect, Page } from '@playwright/test';
import { loginUser } from './helpers';

/**
 * Comprehensive E2E Tests for: Spin → Pairing → Video Date
 * 
 * These tests verify the complete user journey from spinning to video dating.
 * 
 * Prerequisites:
 * - Server must be running (npm run dev)
 * - Test users must be created in Supabase
 * - LiveKit must be configured
 */

test.describe('Spin → Pairing → Video Date Flow', () => {
  let user1Page: Page;
  let user2Page: Page;
  
  // Test user credentials (update these with actual test users)
  const USER1_EMAIL = process.env.TEST_USER1_EMAIL || 'testuser1@example.com';
  const USER1_PASSWORD = process.env.TEST_USER1_PASSWORD || 'testpass123';
  const USER2_EMAIL = process.env.TEST_USER2_EMAIL || 'testuser2@example.com';
  const USER2_PASSWORD = process.env.TEST_USER2_PASSWORD || 'testpass123';

  test.beforeEach(async ({ browser }) => {
    // Create two browser contexts for two users
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();
    
    user1Page = await user1Context.newPage();
    user2Page = await user2Context.newPage();
    
    // Login both users before each test
    await loginUser(user1Page, USER1_EMAIL, USER1_PASSWORD);
    await loginUser(user2Page, USER2_EMAIL, USER2_PASSWORD);
  });

  test.afterEach(async () => {
    await user1Page.close();
    await user2Page.close();
  });

  /**
   * Test 1: User can spin and enter queue
   */
  test('User can spin and enter queue', async () => {
    // Users are already logged in from beforeEach
    // Navigate to spin page (should already be there after login)
    await expect(user1Page).toHaveURL(/.*spin/, { timeout: 5000 });
    
    // Click start spin button
    const spinButton = user1Page.getByRole('button', { name: /start spin/i });
    await expect(spinButton).toBeVisible({ timeout: 10000 });
    await spinButton.click();
    
    // Verify spinning state
    await expect(user1Page.locator('[data-testid="spinning"]')).toBeVisible({ timeout: 10000 });
  });

  /**
   * Test 2: Two users spinning get matched
   */
  test('Two users spinning get matched', async () => {
    // Login both users
    await user1Page.goto('/spin');
    await user2Page.goto('/spin');
    
    // Both users click spin
    await user1Page.getByRole('button', { name: /spin/i }).click();
    await user2Page.getByRole('button', { name: /spin/i }).click();
    
    // Wait for match (should happen within 30 seconds)
    await Promise.all([
      user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 }),
      user2Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 })
    ]);
    
    // Verify both users see the reveal
    await expect(user1Page.locator('[data-testid="reveal"]')).toBeVisible();
    await expect(user2Page.locator('[data-testid="reveal"]')).toBeVisible();
  });

  /**
   * Test 3: Both users vote yes → video date starts
   */
  test('Both users vote yes → video date starts', async () => {
    // Setup: Both users are matched (from previous test or setup)
    // This would require helper functions to set up match state
    
    // Both users vote yes
    await user1Page.getByRole('button', { name: /yes/i }).click();
    await user2Page.getByRole('button', { name: /yes/i }).click();
    
    // Wait for navigation to video date
    await Promise.all([
      user1Page.waitForURL(/.*video-date.*/, { timeout: 10000 }),
      user2Page.waitForURL(/.*video-date.*/, { timeout: 10000 })
    ]);
    
    // Verify both users are on video date page
    await expect(user1Page).toHaveURL(/.*video-date/);
    await expect(user2Page).toHaveURL(/.*video-date/);
  });

  /**
   * Test 4: Countdown timer is synchronized
   */
  test('Countdown timer is synchronized between users', async () => {
    // Setup: Both users are in video date
    // Navigate to video date page with matchId
    
    // Wait for countdown to appear
    const countdown1 = user1Page.locator('[data-testid="countdown-timer"]');
    const countdown2 = user2Page.locator('[data-testid="countdown-timer"]');
    
    await expect(countdown1).toBeVisible({ timeout: 5000 });
    await expect(countdown2).toBeVisible({ timeout: 5000 });
    
    // Get countdown values
    const countdown1Text = await countdown1.textContent();
    const countdown2Text = await countdown2.textContent();
    
    // Countdowns should be the same (within 1 second tolerance)
    const countdown1Value = parseInt(countdown1Text?.replace(/\D/g, '') || '0');
    const countdown2Value = parseInt(countdown2Text?.replace(/\D/g, '') || '0');
    
    expect(Math.abs(countdown1Value - countdown2Value)).toBeLessThanOrEqual(1);
  });

  /**
   * Test 5: Main timer is synchronized
   */
  test('Main timer is synchronized between users', async () => {
    // Setup: Both users are in video date, countdown completed
    
    // Wait for main timer to appear
    const timer1 = user1Page.locator('[data-testid="main-timer"]');
    const timer2 = user2Page.locator('[data-testid="main-timer"]');
    
    await expect(timer1).toBeVisible({ timeout: 10000 });
    await expect(timer2).toBeVisible({ timeout: 10000 });
    
    // Get timer values multiple times to verify sync
    for (let i = 0; i < 3; i++) {
      await user1Page.waitForTimeout(1000);
      
      const timer1Text = await timer1.textContent();
      const timer2Text = await timer2.textContent();
      
      const timer1Value = parseInt(timer1Text?.replace(/\D/g, '') || '0');
      const timer2Value = parseInt(timer2Text?.replace(/\D/g, '') || '0');
      
      // Timers should be the same (within 1 second tolerance)
      expect(Math.abs(timer1Value - timer2Value)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Test 6: Timer persists on refresh
   */
  test('Timer continues correctly after page refresh', async () => {
    // Setup: User is in video date with active timer
    
    // Get initial timer value
    const timerBefore = user1Page.locator('[data-testid="main-timer"]');
    await expect(timerBefore).toBeVisible();
    const timerValueBefore = await timerBefore.textContent();
    
    // Refresh page
    await user1Page.reload();
    
    // Wait for timer to load
    const timerAfter = user1Page.locator('[data-testid="main-timer"]');
    await expect(timerAfter).toBeVisible({ timeout: 5000 });
    const timerValueAfter = await timerAfter.textContent();
    
    // Timer should continue from where it was (not reset)
    // Allow for a few seconds of elapsed time during refresh
    const beforeValue = parseInt(timerValueBefore?.replace(/\D/g, '') || '0');
    const afterValue = parseInt(timerValueAfter?.replace(/\D/g, '') || '0');
    
    // After value should be less than before (time passed) but not reset to 300
    expect(afterValue).toBeLessThan(beforeValue);
    expect(afterValue).toBeGreaterThan(0);
  });

  /**
   * Test 7: End date confirmation flow
   */
  test('End date shows confirmation modal', async () => {
    // Setup: User is in active video date
    
    // Click end date button
    await user1Page.getByRole('button', { name: /end date/i }).click();
    
    // Verify confirmation modal appears
    const confirmModal = user1Page.locator('text=are you sure you want to end date');
    await expect(confirmModal).toBeVisible();
    
    // Click yes on confirmation
    await user1Page.getByRole('button', { name: /yes/i }).click();
    
    // Verify post-date feedback modal appears
    const feedbackModal = user1Page.locator('text=how was your date');
    await expect(feedbackModal).toBeVisible({ timeout: 5000 });
  });

  /**
   * Test 8: Partner receives notification when date ends
   */
  test('Partner receives notification when date ends', async () => {
    // Setup: Both users in video date
    
    // User 1 ends date
    await user1Page.getByRole('button', { name: /end date/i }).click();
    await user1Page.getByRole('button', { name: /yes/i }).click();
    
    // Wait for partner notification (via real-time or polling)
    const partnerNotification = user2Page.locator('text=date ended');
    await expect(partnerNotification).toBeVisible({ timeout: 10000 });
    
    // Partner clicks ok
    await user2Page.getByRole('button', { name: /ok/i }).click();
    
    // Partner should be redirected to spin page
    await expect(user2Page).toHaveURL(/.*spin/);
  });

  /**
   * Test 9: Video and audio tracks work
   */
  test('Video and audio tracks display correctly', async () => {
    // Setup: Both users in video date, countdown completed
    
    // Wait for video elements
    const localVideo1 = user1Page.locator('video').first();
    const remoteVideo1 = user1Page.locator('video').nth(1);
    
    await expect(localVideo1).toBeVisible({ timeout: 10000 });
    await expect(remoteVideo1).toBeVisible({ timeout: 10000 });
    
    // Verify video is playing (has video tracks)
    const localVideoPlaying = await localVideo1.evaluate((video: HTMLVideoElement) => {
      return video.readyState >= 2 && !video.paused;
    });
    
    expect(localVideoPlaying).toBeTruthy();
  });

  /**
   * Test 10: Full flow - Spin to Video Date
   */
  test('Complete flow: Spin → Match → Vote Yes → Video Date', async () => {
    // Step 1: Both users spin
    await user1Page.goto('/spin');
    await user2Page.goto('/spin');
    
    await user1Page.getByRole('button', { name: /spin/i }).click();
    await user2Page.getByRole('button', { name: /spin/i }).click();
    
    // Step 2: Wait for match
    await Promise.all([
      user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 }),
      user2Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 })
    ]);
    
    // Step 3: Both vote yes
    await user1Page.getByRole('button', { name: /yes/i }).click();
    await user2Page.getByRole('button', { name: /yes/i }).click();
    
    // Step 4: Navigate to video date
    await Promise.all([
      user1Page.waitForURL(/.*video-date.*/, { timeout: 10000 }),
      user2Page.waitForURL(/.*video-date.*/, { timeout: 10000 })
    ]);
    
    // Step 5: Verify countdown
    await expect(user1Page.locator('[data-testid="countdown-timer"]')).toBeVisible({ timeout: 5000 });
    await expect(user2Page.locator('[data-testid="countdown-timer"]')).toBeVisible({ timeout: 5000 });
    
    // Step 6: Wait for countdown to complete and verify main timer
    await user1Page.waitForTimeout(16000); // Wait for 15s countdown + 1s buffer
    
    await expect(user1Page.locator('[data-testid="main-timer"]')).toBeVisible({ timeout: 5000 });
    await expect(user2Page.locator('[data-testid="main-timer"]')).toBeVisible({ timeout: 5000 });
  });
});

