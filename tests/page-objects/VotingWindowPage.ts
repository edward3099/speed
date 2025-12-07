/**
 * Page Object Model for Voting Window Page
 * Based on Playwright Framework best practices
 */
import { Page, Locator } from '@playwright/test';

export class VotingWindowPage {
  readonly page: Page;
  readonly yesButton: Locator;
  readonly passButton: Locator;
  readonly partnerName: Locator;
  readonly countdownTimer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.yesButton = page.locator('button:has-text("Yes")').first();
    this.passButton = page.locator('button:has-text("Respin")').first();
    this.partnerName = page.locator('[data-testid="partner-name"]').first();
    this.countdownTimer = page.locator('[data-testid="countdown-timer"]').first();
  }

  async goto(matchId: string) {
    await this.page.goto(`/voting-window?matchId=${matchId}`);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForButtons() {
    await this.yesButton.waitFor({ timeout: 10000 });
    await this.passButton.waitFor({ timeout: 10000 });
  }

  async clickYes() {
    await this.waitForButtons();
    await this.yesButton.click();
  }

  async clickPass() {
    await this.waitForButtons();
    await this.passButton.click();
  }

  async waitForVideoDate() {
    await this.page.waitForURL('**/video-date*', { timeout: 10000 });
  }

  async waitForSpinning() {
    await this.page.waitForURL('**/spinning', { timeout: 10000 });
  }

  async isOnVideoDate(): Promise<boolean> {
    return this.page.url().includes('/video-date');
  }

  async isOnSpinning(): Promise<boolean> {
    return this.page.url().includes('/spinning');
  }
}

