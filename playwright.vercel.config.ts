import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for testing against Vercel deployment
 * Does NOT start local web server - tests run against https://speed-silk.vercel.app
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: false, // Disable parallel to avoid resource conflicts
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0, // No retries - user requested
  /* Opt out of parallel tests on CI. */
  workers: 1, // Run tests sequentially to avoid conflicts
  /* Global test timeout */
  timeout: 300000, // 5 minutes per test (longer for Vercel tests)
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://speed-silk.vercel.app',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video on failure */
    video: 'retain-on-failure',
    /* Increase timeout for slow operations */
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* NO webServer - tests run against Vercel deployment */
});


















