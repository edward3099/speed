/**
 * Test Helper Functions
 * 
 * Utility functions for E2E tests
 */

import { Page, expect } from '@playwright/test';

/**
 * Login an existing user (assumes onboarding is already completed)
 * Uses smart element finding with multiple strategies
 */
export async function loginUser(page: Page, email: string, password: string) {
  // Navigate to landing page
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Click "start now" button - try multiple strategies
  const startButton = await page.getByRole('button', { name: /start now/i }).first();
  await expect(startButton).toBeVisible({ timeout: 15000 });
  await startButton.click();
  await page.waitForTimeout(1000);

  // Switch to sign in tab
  const signInTab = page.getByRole('button', { name: /sign in/i }).first();
  await expect(signInTab).toBeVisible({ timeout: 10000 });
  await signInTab.click();
  await page.waitForTimeout(500);

  // Fill in email
  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill(email);
  await page.waitForTimeout(300);

  // Fill in password
  const passwordInput = page.locator('input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 10000 });
  await passwordInput.fill(password);
  await page.waitForTimeout(300);

  // Click continue button
  const continueButton = page.getByRole('button', { name: /continue/i }).first();
  await expect(continueButton).toBeVisible({ timeout: 10000 });
  await continueButton.click();

  // Wait for redirect to spin page (user should have completed onboarding)
  await page.waitForURL(/.*spin/, { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    // If networkidle times out, just continue
  });
}

/**
 * Wait for user to be in queue
 */
export async function waitForQueue(page: Page, timeout = 10000) {
  await page.waitForSelector('[data-testid="spinning"]', { timeout });
}

/**
 * Wait for match
 */
export async function waitForMatch(page: Page, timeout = 30000) {
  await page.waitForSelector('[data-testid="matched-partner"]', { timeout });
}

/**
 * Get timer value from page
 */
export async function getTimerValue(page: Page, testId: string): Promise<number> {
  const timer = page.locator(`[data-testid="${testId}"]`);
  await expect(timer).toBeVisible();
  const text = await timer.textContent();
  
  // Parse different timer formats
  // Format 1: "4:30" (minutes:seconds)
  const mmssMatch = text?.match(/(\d+):(\d+)/);
  if (mmssMatch) {
    return parseInt(mmssMatch[1]) * 60 + parseInt(mmssMatch[2]);
  }
  
  // Format 2: "270" (seconds only)
  const secondsMatch = text?.match(/(\d+)/);
  if (secondsMatch) {
    return parseInt(secondsMatch[1]);
  }
  
  return 0;
}

/**
 * Wait for countdown to complete
 */
export async function waitForCountdownComplete(page: Page, timeout = 20000) {
  // Wait for countdown to reach 0
  await page.waitForFunction(
    () => {
      const countdown = document.querySelector('[data-testid="countdown-timer"]');
      if (!countdown) return false;
      const text = countdown.textContent || '';
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1]) === 0 : false;
    },
    { timeout }
  );
}

/**
 * Setup video date for testing
 * This would create a match and navigate both users to video date
 */
export async function setupVideoDate(user1Page: Page, user2Page: Page) {
  // Navigate to spin
  await user1Page.goto('/spin');
  await user2Page.goto('/spin');
  
  // Both spin
  await user1Page.getByRole('button', { name: /start spin/i }).click();
  await user2Page.getByRole('button', { name: /start spin/i }).click();
  
  // Wait for match
  await Promise.all([
    waitForMatch(user1Page),
    waitForMatch(user2Page)
  ]);
  
  // Both vote yes
  await user1Page.getByRole('button', { name: /yes/i }).click();
  await user2Page.getByRole('button', { name: /yes/i }).click();
  
  // Wait for video date page
  await Promise.all([
    user1Page.waitForURL(/.*video-date.*/, { timeout: 10000 }),
    user2Page.waitForURL(/.*video-date.*/, { timeout: 10000 })
  ]);
}
