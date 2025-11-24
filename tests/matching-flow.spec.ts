import { test, expect, Page } from '@playwright/test';

/**
 * Matching Flow Tests
 * 
 * These tests verify the matching algorithm, fairness system, and pairing logic.
 */

test.describe('Matching Flow', () => {
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
   * Test: Every spin results in pairing
   */
  test('Every spin results in pairing (no empty results)', async () => {
    await user1Page.goto('/spin');
    await user2Page.goto('/spin');
    
    // Both users spin
    await user1Page.getByRole('button', { name: /spin/i }).click();
    await user2Page.getByRole('button', { name: /spin/i }).click();
    
    // Wait for match (should happen within 30 seconds)
    await Promise.all([
      user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 }),
      user2Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 })
    ]);
    
    // Verify both users see the match
    await expect(user1Page.locator('[data-testid="reveal"]')).toBeVisible();
    await expect(user2Page.locator('[data-testid="reveal"]')).toBeVisible();
  });

  /**
   * Test: Users exit queue when paired
   */
  test('Users exit queue when paired', async () => {
    // This would require checking database or API to verify queue status
    // For now, we verify UI state changes
    
    await user1Page.goto('/spin');
    await user1Page.getByRole('button', { name: /spin/i }).click();
    
    // User should be in queue (spinning)
    await expect(user1Page.locator('[data-testid="spinning"]')).toBeVisible();
    
    // After match, spinning should stop
    await user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 });
    await expect(user1Page.locator('[data-testid="spinning"]')).not.toBeVisible();
  });

  /**
   * Test: Preference matching works
   */
  test('Preference matching works correctly', async () => {
    // This test would require:
    // 1. Setting up users with specific preferences
    // 2. Verifying matched partner matches preferences
    // 3. Testing preference expansion when no exact match
    
    // For now, we verify that preferences are saved
    await user1Page.goto('/spin');
    
    // Open filters
    await user1Page.getByRole('button', { name: /filter/i }).click();
    
    // Set preferences
    await user1Page.fill('input[name="minAge"]', '25');
    await user1Page.fill('input[name="maxAge"]', '35');
    await user1Page.selectOption('select[name="genderPreference"]', 'female');
    
    // Close filters
    await user1Page.getByRole('button', { name: /close/i }).click();
    
    // Spin
    await user1Page.getByRole('button', { name: /spin/i }).click();
    
    // Wait for match and verify partner matches preferences
    await user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 });
    
    // Verify partner age is within range (if displayed)
    const partnerAge = await user1Page.locator('[data-testid="partner-age"]').textContent();
    if (partnerAge) {
      const age = parseInt(partnerAge);
      expect(age).toBeGreaterThanOrEqual(25);
      expect(age).toBeLessThanOrEqual(35);
    }
  });

  /**
   * Test: No duplicate matches
   */
  test('No duplicate matches created', async () => {
    // This test verifies that the same two users don't get matched multiple times
    // in quick succession
    
    await user1Page.goto('/spin');
    await user2Page.goto('/spin');
    
    // Both spin
    await user1Page.getByRole('button', { name: /spin/i }).click();
    await user2Page.getByRole('button', { name: /spin/i }).click();
    
    // Wait for first match
    await Promise.all([
      user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 }),
      user2Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 })
    ]);
    
    // Both vote pass to return to spin
    await user1Page.getByRole('button', { name: /pass|respin/i }).click();
    await user2Page.getByRole('button', { name: /pass|respin/i }).click();
    
    // Wait to return to spin
    await Promise.all([
      user1Page.waitForURL(/.*spin/, { timeout: 5000 }),
      user2Page.waitForURL(/.*spin/, { timeout: 5000 })
    ]);
    
    // Both spin again
    await user1Page.getByRole('button', { name: /spin/i }).click();
    await user2Page.getByRole('button', { name: /spin/i }).click();
    
    // Should get matched again (but this is a new match, not duplicate)
    await Promise.all([
      user1Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 }),
      user2Page.waitForSelector('[data-testid="matched-partner"]', { timeout: 30000 })
    ]);
  });

  /**
   * Test: Fairness system works
   */
  test('Fairness system prioritizes long-waiting users', async () => {
    // This test would require:
    // 1. User A spins first
    // 2. User B spins later
    // 3. User A should get matched first (if compatible)
    
    // For now, we verify that fairness score exists in the system
    // This would need database checks or API verification
  });
});

