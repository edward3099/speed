import { test, expect, Page } from '@playwright/test';

/**
 * Timer Synchronization Tests
 * 
 * These tests specifically verify that timers are synchronized between users
 * and persist correctly across page refreshes.
 */

test.describe('Timer Synchronization', () => {
  let user1Page: Page;
  let user2Page: Page;

  test.beforeEach(async ({ browser }) => {
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();
    
    user1Page = await user1Context.newPage();
    user2Page = await user2Context.newPage();
  });

  test.afterEach(async () => {
    await user1Page.close();
    await user2Page.close();
  });

  /**
   * Test: Countdown timer uses database NOW() for synchronization
   */
  test('Countdown timer is synchronized using database', async () => {
    // Setup: Both users in video date with countdown
    // This would require setting up a match and navigating to video date
    
    const getCountdownValue = async (page: Page) => {
      const countdown = page.locator('[data-testid="countdown-timer"]');
      const text = await countdown.textContent();
      return parseInt(text?.replace(/\D/g, '') || '0');
    };
    
    // Get countdown values from both users multiple times
    const values1: number[] = [];
    const values2: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      await user1Page.waitForTimeout(500);
      values1.push(await getCountdownValue(user1Page));
      values2.push(await getCountdownValue(user2Page));
    }
    
    // All values should be within 1 second of each other
    for (let i = 0; i < values1.length; i++) {
      const diff = Math.abs(values1[i] - values2[i]);
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Test: Main timer uses database RPC for synchronization
   */
  test('Main timer is synchronized using database RPC', async () => {
    // Setup: Both users in video date, countdown completed
    
    const getTimerValue = async (page: Page) => {
      const timer = page.locator('[data-testid="main-timer"]');
      const text = await timer.textContent();
      // Extract minutes and seconds (e.g., "4:30" -> 270 seconds)
      const match = text?.match(/(\d+):(\d+)/);
      if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      return 0;
    };
    
    // Get timer values from both users multiple times
    const values1: number[] = [];
    const values2: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      await user1Page.waitForTimeout(1000);
      values1.push(await getTimerValue(user1Page));
      values2.push(await getTimerValue(user2Page));
    }
    
    // All values should be within 1 second of each other
    for (let i = 0; i < values1.length; i++) {
      const diff = Math.abs(values1[i] - values2[i]);
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Test: Timer continues from database on refresh
   */
  test('Timer continues correctly after refresh', async () => {
    // Setup: User in video date with active timer
    
    // Get timer value before refresh
    const timerBefore = user1Page.locator('[data-testid="main-timer"]');
    await expect(timerBefore).toBeVisible();
    const beforeText = await timerBefore.textContent();
    const beforeValue = parseInt(beforeText?.replace(/\D/g, '') || '0');
    
    // Wait a few seconds
    await user1Page.waitForTimeout(3000);
    
    // Refresh page
    await user1Page.reload();
    await user1Page.waitForLoadState('networkidle');
    
    // Get timer value after refresh
    const timerAfter = user1Page.locator('[data-testid="main-timer"]');
    await expect(timerAfter).toBeVisible({ timeout: 10000 });
    const afterText = await timerAfter.textContent();
    const afterValue = parseInt(afterText?.replace(/\D/g, '') || '0');
    
    // Timer should have decreased (time passed) but not reset
    expect(afterValue).toBeLessThan(beforeValue);
    // Should not be reset to 300 (5 minutes)
    expect(afterValue).toBeLessThan(300);
    // Should still have time remaining
    expect(afterValue).toBeGreaterThan(0);
  });

  /**
   * Test: Both users refresh and see same timer
   */
  test('Both users see same timer after refresh', async () => {
    // Setup: Both users in video date
    
    // Both refresh simultaneously
    await Promise.all([
      user1Page.reload(),
      user2Page.reload()
    ]);
    
    await Promise.all([
      user1Page.waitForLoadState('networkidle'),
      user2Page.waitForLoadState('networkidle')
    ]);
    
    // Get timer values
    const timer1 = user1Page.locator('[data-testid="main-timer"]');
    const timer2 = user2Page.locator('[data-testid="main-timer"]');
    
    await expect(timer1).toBeVisible({ timeout: 10000 });
    await expect(timer2).toBeVisible({ timeout: 10000 });
    
    const value1 = parseInt((await timer1.textContent())?.replace(/\D/g, '') || '0');
    const value2 = parseInt((await timer2.textContent())?.replace(/\D/g, '') || '0');
    
    // Values should be the same (within 1 second)
    expect(Math.abs(value1 - value2)).toBeLessThanOrEqual(1);
  });

  /**
   * Test: Timer is tied to matchId, not user session
   */
  test('Timer is tied to matchId', async () => {
    // This test verifies that the same matchId always shows the same timer
    // regardless of which user is viewing it
    
    // Get matchId from URL
    const url1 = user1Page.url();
    const matchIdMatch = url1.match(/matchId=([^&]+)/);
    const matchId = matchIdMatch?.[1];
    
    expect(matchId).toBeTruthy();
    
    // Both users should have the same matchId
    const url2 = user2Page.url();
    expect(url2).toContain(`matchId=${matchId}`);
    
    // Both should see the same timer
    const timer1 = user1Page.locator('[data-testid="main-timer"]');
    const timer2 = user2Page.locator('[data-testid="main-timer"]');
    
    await expect(timer1).toBeVisible();
    await expect(timer2).toBeVisible();
    
    const value1 = parseInt((await timer1.textContent())?.replace(/\D/g, '') || '0');
    const value2 = parseInt((await timer2.textContent())?.replace(/\D/g, '') || '0');
    
    expect(Math.abs(value1 - value2)).toBeLessThanOrEqual(1);
  });
});

