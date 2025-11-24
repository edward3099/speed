import { test, expect } from '@playwright/test';
import { loginUser } from './helpers';

/**
 * Simple test to verify basic setup
 * This is a minimal test to check if the dev server is accessible
 */
test.describe('Simple Setup Test', () => {
  // Test user credentials (using pre-created test accounts)
  const TEST_EMAIL_EXISTING = process.env.TEST_USER1_EMAIL || 'testuser1@example.com';
  const TEST_PASSWORD_EXISTING = process.env.TEST_USER1_PASSWORD || 'testpass123';

  test('Dev server is accessible', async ({ page }) => {
    // Just check if we can navigate to the root
    await page.goto('/');
    await expect(page).toHaveURL(/.*/);
  });

  test('Can login and access spin page', async ({ page }) => {
    try {
      // Login with pre-created test user
      await loginUser(page, TEST_EMAIL_EXISTING, TEST_PASSWORD_EXISTING);
      
      // Should be on spin page after login (user has completed onboarding)
      await expect(page).toHaveURL(/.*spin/, { timeout: 5000 });
      
      // Verify spin page loaded
      await page.waitForLoadState('networkidle');
      const body = page.locator('body');
      await expect(body).toBeVisible();
      
      // Verify "start spin" button exists
      const spinButton = page.getByRole('button', { name: /start spin/i });
      await expect(spinButton).toBeVisible({ timeout: 5000 });
    } catch (error) {
      // Take screenshot on failure
      await page.screenshot({ path: `test-results/login-failed-${Date.now()}.png`, fullPage: true });
      throw error;
    }
  });

  test('Start spin button exists after login', async ({ page }) => {
    try {
      // Login with pre-created test user
      await loginUser(page, TEST_EMAIL_EXISTING, TEST_PASSWORD_EXISTING);
      await expect(page).toHaveURL(/.*spin/, { timeout: 15000 });
      
      await page.waitForLoadState('networkidle');
      
      // Wait for button with text "start spin" (case insensitive)
      const spinButton = page.getByRole('button', { name: /start spin/i });
      await expect(spinButton).toBeVisible({ timeout: 10000 });
    } catch (error) {
      // Take screenshot on failure
      await page.screenshot({ path: `test-results/spin-button-failed-${Date.now()}.png`, fullPage: true });
      throw error;
    }
  });
});
