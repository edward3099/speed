/**
 * Browserbase Realistic Test Orchestrator
 * 
 * This orchestrator uses Browserbase MCP to create multiple browser sessions
 * that simulate real user behavior with realistic timing, network conditions,
 * and coordinated multi-user scenarios.
 */

import { createClient } from '@supabase/supabase-js'

// Types
interface UserSession {
  sessionId: string
  userId: string
  email: string
  password: string
  currentUrl?: string
  state?: 'idle' | 'spinning' | 'matched' | 'voting' | 'video-date'
}

interface TestScenario {
  name: string
  description: string
  users: number
  actions: (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => Promise<void>
  verify: (sessions: UserSession[]) => Promise<boolean>
}

// Configuration
const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Realistic behavior helpers
class RealisticBehavior {
  /**
   * Random delay between 0.5-3 seconds (simulates human thinking/reading time)
   */
  static async humanDelay(min: number = 500, max: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Fast user delay (0.2-1 second) - user who clicks quickly
   */
  static async fastUserDelay(): Promise<void> {
    return this.humanDelay(200, 1000)
  }

  /**
   * Slow user delay (2-5 seconds) - user who reads carefully
   */
  static async slowUserDelay(): Promise<void> {
    return this.humanDelay(2000, 5000)
  }

  /**
   * Network delay simulation (0.1-0.5 seconds)
   */
  static async networkDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 400) + 100
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Simulate network interruption (randomly fails 10% of the time)
   */
  static shouldSimulateNetworkFailure(): boolean {
    return Math.random() < 0.1 // 10% chance
  }

  /**
   * Random action timing - some users act simultaneously, others sequentially
   */
  static async randomActionTiming(): Promise<void> {
    // 70% chance of immediate action, 30% chance of delay
    if (Math.random() < 0.7) {
      await this.networkDelay()
    } else {
      await this.humanDelay(1000, 3000)
    }
  }
}

// Browserbase session manager
class BrowserbaseSessionManager {
  private sessions: Map<string, UserSession> = new Map()
  private controllers: Map<string, any> = new Map() // Store BrowserbaseController instances

  /**
   * Create a new browser session for a user
   */
  async createSession(userId: string, email: string, password: string): Promise<UserSession> {
    const { BrowserbaseController } = await import('./browserbase-impl')
    const controller = new BrowserbaseController()
    const sessionId = await controller.createSession()

    const session: UserSession = {
      sessionId,
      userId,
      email,
      password,
      state: 'idle'
    }
    
    this.sessions.set(userId, session)
    this.controllers.set(userId, controller)
    return session
  }

  /**
   * Get session by user ID
   */
  getSession(userId: string): UserSession | undefined {
    return this.sessions.get(userId)
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): UserSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Close a session
   */
  async closeSession(userId: string): Promise<void> {
    const controller = this.controllers.get(userId)
    if (controller) {
      await controller.close()
      this.controllers.delete(userId)
    }
    this.sessions.delete(userId)
  }

  /**
   * Get controller for a user
   */
  getController(userId: string): any {
    return this.controllers.get(userId)
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.keys()).map(userId => 
      this.closeSession(userId)
    )
    await Promise.all(promises)
  }
}

// State verification utilities
class StateVerifier {
  private supabase: any

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }

  /**
   * Verify both users are in the same match
   */
  async verifyMatch(user1Id: string, user2Id: string): Promise<{
    matched: boolean
    matchId?: string
    outcome?: string
  }> {
    // Check if both users have the same match_id in users_state
    const { data: user1State } = await this.supabase
      .from('users_state')
      .select('match_id')
      .eq('user_id', user1Id)
      .single()

    const { data: user2State } = await this.supabase
      .from('users_state')
      .select('match_id')
      .eq('user_id', user2Id)
      .single()

    if (!user1State?.match_id || !user2State?.match_id) {
      return { matched: false }
    }

    if (user1State.match_id !== user2State.match_id) {
      return { matched: false }
    }

    // Get match details
    const { data: match } = await this.supabase
      .from('matches')
      .select('id, outcome, status')
      .eq('id', user1State.match_id)
      .single()

    return {
      matched: true,
      matchId: user1State.match_id,
      outcome: match?.outcome,
    }
  }

  /**
   * Verify both users voted and outcome is correct
   */
  async verifyVotingOutcome(matchId: string, expectedOutcome: string): Promise<{
    correct: boolean
    actualOutcome?: string
    user1Vote?: string
    user2Vote?: string
  }> {
    const { data: match } = await this.supabase
      .from('matches')
      .select('outcome, user1_vote, user2_vote')
      .eq('id', matchId)
      .single()

    if (!match) {
      return { correct: false }
    }

    return {
      correct: match.outcome === expectedOutcome,
      actualOutcome: match.outcome,
      user1Vote: match.user1_vote,
      user2Vote: match.user2_vote,
    }
  }

  /**
   * Verify both users are redirected correctly after voting
   */
  async verifyUserStates(user1Id: string, user2Id: string, expectedState: string): Promise<{
    correct: boolean
    user1State?: string
    user2State?: string
  }> {
    const { data: user1State } = await this.supabase
      .from('users_state')
      .select('state')
      .eq('user_id', user1Id)
      .single()

    const { data: user2State } = await this.supabase
      .from('users_state')
      .select('state')
      .eq('user_id', user2Id)
      .single()

    const user1Correct = user1State?.state === expectedState
    const user2Correct = user2State?.state === expectedState

    return {
      correct: user1Correct && user2Correct,
      user1State: user1State?.state,
      user2State: user2State?.state,
    }
  }

  /**
   * Verify video date was created correctly
   */
  async verifyVideoDate(matchId: string): Promise<{
    exists: boolean
    status?: string
    user1Id?: string
    user2Id?: string
  }> {
    const { data: videoDate } = await this.supabase
      .from('video_dates')
      .select('status, user1_id, user2_id')
      .eq('match_id', matchId)
      .single()

    if (!videoDate) {
      return { exists: false }
    }

    return {
      exists: true,
      status: videoDate.status,
      user1Id: videoDate.user1_id,
      user2Id: videoDate.user2_id,
    }
  }
}

// Test orchestrator
export class RealisticTestOrchestrator {
  private sessionManager: BrowserbaseSessionManager
  private stateVerifier: StateVerifier
  private testUsers: Array<{ email: string; password: string; userId?: string }>

  constructor(testUsers: Array<{ email: string; password: string }>) {
    this.sessionManager = new BrowserbaseSessionManager()
    this.stateVerifier = new StateVerifier()
    this.testUsers = testUsers
  }

  /**
   * Run a test scenario with realistic behavior
   */
  async runScenario(scenario: TestScenario): Promise<{
    success: boolean
    errors: string[]
    duration: number
  }> {
    const startTime = Date.now()
    const errors: string[] = []

    try {
      console.log(`\n🧪 Running scenario: ${scenario.name}`)
      console.log(`📝 ${scenario.description}`)

      // Create browser sessions for all users
      const sessions: UserSession[] = []
      for (const user of this.testUsers.slice(0, scenario.users)) {
        const session = await this.sessionManager.createSession(
          user.userId || user.email,
          user.email,
          user.password
        )
        sessions.push(session)
      }

      console.log(`✅ Created ${sessions.length} browser sessions`)

      // Execute scenario actions (pass session manager for controller access)
      try {
        await scenario.actions(sessions, this.sessionManager)
      } catch (error: any) {
        errors.push(`Action failed: ${error.message}`)
        throw error
      }

      // Verify scenario results
      try {
        const verified = await scenario.verify(sessions)
        if (!verified) {
          errors.push('Verification failed')
        }
      } catch (error: any) {
        errors.push(`Verification error: ${error.message}`)
      }

      // Cleanup
      await this.sessionManager.closeAllSessions()

      const duration = Date.now() - startTime
      const success = errors.length === 0

      console.log(`${success ? '✅' : '❌'} Scenario ${success ? 'passed' : 'failed'} in ${duration}ms`)
      if (errors.length > 0) {
        console.log('Errors:', errors)
      }

      return { success, errors, duration }
    } catch (error: any) {
      await this.sessionManager.closeAllSessions()
      const duration = Date.now() - startTime
      errors.push(`Scenario failed: ${error.message}`)
      return { success: false, errors, duration }
    }
  }

  /**
   * Run multiple scenarios in sequence
   */
  async runScenarios(scenarios: TestScenario[]): Promise<{
    passed: number
    failed: number
    totalDuration: number
    results: Array<{ scenario: string; success: boolean; errors: string[] }>
  }> {
    const results: Array<{ scenario: string; success: boolean; errors: string[] }> = []
    let passed = 0
    let failed = 0
    let totalDuration = 0

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario)
      results.push({
        scenario: scenario.name,
        success: result.success,
        errors: result.errors,
      })
      
      if (result.success) {
        passed++
      } else {
        failed++
      }
      
      totalDuration += result.duration

      // Wait between scenarios to avoid overwhelming the system
      await RealisticBehavior.humanDelay(1000, 2000)
    }

    return { passed, failed, totalDuration, results }
  }
}

// Export utilities
export { RealisticBehavior, StateVerifier, BrowserbaseSessionManager }
export type { UserSession, TestScenario }

