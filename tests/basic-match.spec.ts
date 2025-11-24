import { test, expect } from '@playwright/test';
import { loginUser } from './helpers';

/**
 * Simple focused test: Two users (male and female) spin and match
 */
test.describe('Basic Match Test', () => {
  test('Two users spin and get matched', async ({ browser }) => {
    test.setTimeout(60000); // 60 seconds

    // Test user credentials
    const USER1_EMAIL = process.env.TEST_USER1_EMAIL || 'testuser1@example.com';
    const USER1_PASSWORD = process.env.TEST_USER1_PASSWORD || 'testpass123';
    const USER2_EMAIL = process.env.TEST_USER2_EMAIL || 'testuser2@example.com';
    const USER2_PASSWORD = process.env.TEST_USER2_PASSWORD || 'testpass123';

    // Create two separate browser contexts (two users)
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    const user1Page = await user1Context.newPage();
    const user2Page = await user2Context.newPage();

    try {
      console.log('🔐 Logging in User 1 (male)...');
      await loginUser(user1Page, USER1_EMAIL, USER1_PASSWORD);
      await expect(user1Page).toHaveURL(/.*spin/, { timeout: 10000 });

      console.log('🔐 Logging in User 2 (female)...');
      await loginUser(user2Page, USER2_EMAIL, USER2_PASSWORD);
      await expect(user2Page).toHaveURL(/.*spin/, { timeout: 10000 });

      // Wait for pages to be ready
      await user1Page.waitForLoadState('networkidle');
      await user2Page.waitForLoadState('networkidle');

      console.log('🎯 Both users on spin page, looking for spin button...');

      // Wait a bit for any animations to settle
      await user1Page.waitForTimeout(2000);
      await user2Page.waitForTimeout(2000);

      // Find spin button - try multiple selectors
      const user1SpinButton = user1Page.getByRole('button', { name: /start spin/i }).first();
      const user2SpinButton = user2Page.getByRole('button', { name: /start spin/i }).first();

      // Wait for buttons to be visible and stable
      await expect(user1SpinButton).toBeVisible({ timeout: 15000 });
      await expect(user2SpinButton).toBeVisible({ timeout: 15000 });
      
      // Wait for buttons to be stable (no animations)
      await user1Page.waitForTimeout(1000);
      await user2Page.waitForTimeout(1000);

      console.log('🎲 User 1 clicking spin...');
      // Use force click if button is moving due to animations
      await user1SpinButton.click({ force: true, timeout: 10000 });

      // Wait for user1 to enter queue
      await user1Page.waitForTimeout(2000);

      console.log('🎲 User 2 clicking spin...');
      await user2SpinButton.click({ force: true, timeout: 10000 });

      console.log('⏳ Waiting for match...');

      // Wait for match indicators on both pages
      // Look for matched partner, reveal animation, or vote buttons
      const matchIndicators = [
        '[data-testid="matched-partner"]',
        '[data-testid="reveal"]',
        'button:has-text("Yes")',
        'button:has-text("Pass")',
        'text=/matched/i',
        'text=/found/i',
      ];

      // Wait for at least one match indicator on both pages
      await Promise.all([
        Promise.race(
          matchIndicators.map(selector =>
            user1Page.waitForSelector(selector, { timeout: 30000 }).catch(() => null)
          )
        ),
        Promise.race(
          matchIndicators.map(selector =>
            user2Page.waitForSelector(selector, { timeout: 30000 }).catch(() => null)
          )
        ),
      ]);

      console.log('✅ Match found! Verifying...');

      // Verify both users see match indicators
      const user1Matched = await Promise.race(
        matchIndicators.map(selector =>
          user1Page.locator(selector).isVisible().then(visible => visible ? selector : null)
        )
      ).catch(() => null);

      const user2Matched = await Promise.race(
        matchIndicators.map(selector =>
          user2Page.locator(selector).isVisible().then(visible => visible ? selector : null)
        )
      ).catch(() => null);

      // Take screenshots for debugging
      await user1Page.screenshot({ path: 'test-results/user1-matched.png', fullPage: true });
      await user2Page.screenshot({ path: 'test-results/user2-matched.png', fullPage: true });

      // Assertions
      expect(user1Matched).toBeTruthy();
      expect(user2Matched).toBeTruthy();

      console.log('✅ Test passed! Both users matched successfully.');

    } catch (error) {
      // Take screenshots on failure
      await user1Page.screenshot({ path: 'test-results/user1-error.png', fullPage: true });
      await user2Page.screenshot({ path: 'test-results/user2-error.png', fullPage: true });
      throw error;
    } finally {
      // Clean up
      await user1Context.close();
      await user2Context.close();
    }
  });
});

