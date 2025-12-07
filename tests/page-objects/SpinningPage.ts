/**
 * Page Object Model for Spinning Page
 * Based on Playwright Framework best practices
 */
import { Page, Locator } from '@playwright/test';

export class SpinningPage {
  readonly page: Page;
  readonly startSpinButton: Locator;
  readonly spinningAnimation: Locator;
  readonly findingMatchText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startSpinButton = page.locator('button:has-text("start spin"), button:has-text("Start Spin"), button:has-text("Spin")').first();
    this.spinningAnimation = page.locator('svg').first();
    this.findingMatchText = page.locator('text=Finding your match...');
  }

  async goto() {
    await this.page.goto('/spin');
    await this.page.waitForLoadState('networkidle');
  }

  async clickStartSpin() {
    await this.startSpinButton.click();
    await this.page.waitForURL('**/spinning', { timeout: 5000 });
  }

  async waitForMatch() {
    await this.page.waitForURL('**/voting-window*', { timeout: 30000 });
  }

  async isOnSpinningPage(): Promise<boolean> {
    return this.page.url().includes('/spinning');
  }

  async isOnVotingWindow(): Promise<boolean> {
    return this.page.url().includes('/voting-window');
  }
}

