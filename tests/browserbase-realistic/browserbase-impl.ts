/**
 * Browserbase SDK Implementation
 * 
 * This file provides the actual implementation using Browserbase SDK
 * to control browser sessions and interact with the app.
 * 
 * Requires: npm install @browserbasehq/sdk playwright-core
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright-core'
import Browserbase from '@browserbasehq/sdk'

const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3000'
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || ''
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || ''

/**
 * Browserbase session controller using SDK
 */
export class BrowserbaseController {
  private browserbase: Browserbase
  private session: any = null
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private sessionId: string | null = null

  constructor() {
    if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
      throw new Error(
        'BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set in environment variables'
      )
    }

    this.browserbase = new Browserbase({
      apiKey: BROWSERBASE_API_KEY,
    })
  }

  /**
   * Create a new Browserbase session
   */
  async createSession(): Promise<string> {
    try {
      this.session = await this.browserbase.sessions.create({
        projectId: BROWSERBASE_PROJECT_ID,
      })

      this.sessionId = this.session.id
      console.log(`✅ Created Browserbase session: ${this.sessionId}`)
      console.log(`📺 View replay: https://www.browserbase.com/sessions/${this.sessionId}`)

      // Connect to browser via CDP
      this.browser = await chromium.connectOverCDP(this.session.connectUrl)
      this.context = this.browser.contexts()[0] || await this.browser.newContext()
      this.page = this.context.pages()[0] || await this.context.newPage()

      return this.sessionId
    } catch (error: any) {
      throw new Error(`Failed to create Browserbase session: ${error.message}`)
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Session not created. Call createSession() first.')
    }
    await this.page.goto(url, { waitUntil: 'networkidle' })
  }

  /**
   * Click an element by description (uses multiple strategies)
   */
  async click(description: string): Promise<void> {
    if (!this.page) {
      throw new Error('Session not created')
    }

    // Try multiple strategies to find the element
    const strategies = [
      // Try by role and name
      () => this.page!.getByRole('button', { name: new RegExp(description, 'i') }).first(),
      // Try by text content
      () => this.page!.getByText(new RegExp(description, 'i')).first(),
      // Try by test id
      () => this.page!.locator(`[data-testid*="${description.toLowerCase().replace(/\s+/g, '-')}"]`).first(),
      // Try by aria-label
      () => this.page!.locator(`[aria-label*="${description}"]`).first(),
    ]

    for (const strategy of strategies) {
      try {
        const element = strategy()
        await element.waitFor({ state: 'visible', timeout: 5000 })
        await element.click()
        return
      } catch (e) {
        // Try next strategy
        continue
      }
    }

    throw new Error(`Could not find element: ${description}`)
  }

  /**
   * Type text into an element
   */
  async type(description: string, text: string): Promise<void> {
    if (!this.page) {
      throw new Error('Session not created')
    }

    // Try to find input field
    const strategies = [
      () => this.page!.locator('input[type="email"]').first(),
      () => this.page!.locator('input[type="password"]').first(),
      () => this.page!.locator('input[type="text"]').first(),
      () => this.page!.getByPlaceholder(new RegExp(description, 'i')).first(),
      () => this.page!.locator(`input[name*="${description.toLowerCase()}"]`).first(),
    ]

    for (const strategy of strategies) {
      try {
        const element = strategy()
        await element.waitFor({ state: 'visible', timeout: 5000 })
        await element.fill(text)
        return
      } catch (e) {
        continue
      }
    }

    throw new Error(`Could not find input field: ${description}`)
  }

  /**
   * Wait for element to appear
   */
  async waitFor(description: string, timeout: number = 10000): Promise<void> {
    if (!this.page) {
      throw new Error('Session not created')
    }

    // Try to find element using multiple strategies
    const strategies = [
      () => this.page!.getByRole('button', { name: new RegExp(description, 'i') }).first(),
      () => this.page!.getByText(new RegExp(description, 'i')).first(),
      () => this.page!.locator(`[data-testid*="${description.toLowerCase().replace(/\s+/g, '-')}"]`).first(),
    ]

    for (const strategy of strategies) {
      try {
        const element = strategy()
        await element.waitFor({ state: 'visible', timeout })
        return
      } catch (e) {
        continue
      }
    }

    // If no element found, just wait for timeout
    await new Promise(resolve => setTimeout(resolve, timeout))
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    if (!this.page) {
      throw new Error('Session not created')
    }
    return this.page.url()
  }

  /**
   * Extract text from page
   */
  async extract(instruction: string): Promise<string> {
    if (!this.page) {
      throw new Error('Session not created')
    }
    return await this.page.textContent('body') || ''
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<string> {
    if (!this.page) {
      throw new Error('Session not created')
    }
    const path = `test-results/screenshots/${name}-${Date.now()}.png`
    await this.page.screenshot({ path, fullPage: true })
    return path
  }

  /**
   * Close the session
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close()
        this.page = null
      }
      if (this.context) {
        await this.context.close()
        this.context = null
      }
      if (this.browser) {
        await this.browser.close()
        this.browser = null
      }
      this.sessionId = null
      console.log('✅ Browserbase session closed')
    } catch (error: any) {
      console.error('Error closing session:', error.message)
    }
  }

  /**
   * Get the session ID
   */
  getSessionId(): string | null {
    return this.sessionId
  }

  /**
   * Get the replay URL
   */
  getReplayUrl(): string | null {
    if (!this.sessionId) return null
    return `https://www.browserbase.com/sessions/${this.sessionId}`
  }
}

/**
 * User action helpers for Browserbase
 */
export class BrowserbaseUserActions {
  /**
   * Login a user via Browserbase session
   */
  static async login(controller: BrowserbaseController, email: string, password: string): Promise<void> {
    // Navigate to app
    await controller.navigate(APP_URL)
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Click "Start Now" button
    await controller.click('Start Now button')

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500))

    // Click "Sign In" tab
    await controller.click('Sign In tab')

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500))

    // Type email
    await controller.type('email input field', email)

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300))

    // Type password
    await controller.type('password input field', password)

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300))

    // Click Continue button
    await controller.click('Continue button')

    // Wait for redirect to spin page
    let currentUrl = await controller.getCurrentUrl()
    let attempts = 0
    while (!currentUrl.includes('/spin') && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      currentUrl = await controller.getCurrentUrl()
      attempts++
    }

    if (!currentUrl.includes('/spin')) {
      throw new Error('Failed to redirect to spin page after login')
    }
  }

  /**
   * Click the spin button
   */
  static async spin(controller: BrowserbaseController): Promise<void> {
    // Wait for spin button to be available
    await controller.waitFor('spin button', 10000)

    // Click spin button
    await controller.click('spin button')

    // Wait for navigation to spinning page
    let currentUrl = await controller.getCurrentUrl()
    let attempts = 0
    while (!currentUrl.includes('/spinning') && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      currentUrl = await controller.getCurrentUrl()
      attempts++
    }
  }

  /**
   * Wait for match (user should be on voting-window page)
   */
  static async waitForMatch(controller: BrowserbaseController, timeout: number = 30000): Promise<void> {
    const startTime = Date.now()
    let currentUrl = await controller.getCurrentUrl()

    while (!currentUrl.includes('/voting-window') && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      currentUrl = await controller.getCurrentUrl()
    }

    if (!currentUrl.includes('/voting-window')) {
      throw new Error('Match timeout - user did not reach voting window')
    }
  }

  /**
   * Vote "Yes"
   */
  static async voteYes(controller: BrowserbaseController): Promise<void> {
    // Wait for voting buttons
    await controller.waitFor('Yes button', 10000)

    // Click Yes button
    await controller.click('Yes button')

    // Wait for redirect
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  /**
   * Vote "Pass"
   */
  static async votePass(controller: BrowserbaseController): Promise<void> {
    // Wait for voting buttons
    await controller.waitFor('Pass button', 10000)

    // Click Pass button
    await controller.click('Pass button')

    // Wait for redirect
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  /**
   * Refresh the page
   */
  static async refresh(controller: BrowserbaseController): Promise<void> {
    // Use Browserbase to refresh
    const currentUrl = await controller.getCurrentUrl()
    await controller.navigate(currentUrl)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  /**
   * Check if user is on video-date page
   */
  static async isOnVideoDatePage(controller: BrowserbaseController): Promise<boolean> {
    const currentUrl = await controller.getCurrentUrl()
    return currentUrl.includes('/video-date')
  }

  /**
   * Check if user is on spinning page
   */
  static async isOnSpinningPage(controller: BrowserbaseController): Promise<boolean> {
    const currentUrl = await controller.getCurrentUrl()
    return currentUrl.includes('/spinning')
  }
}

