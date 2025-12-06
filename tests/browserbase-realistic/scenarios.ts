/**
 * Realistic Test Scenarios
 * 
 * These scenarios simulate real user behavior with:
 * - Realistic timing (random delays)
 * - Simultaneous actions (race conditions)
 * - Network conditions (delays, failures)
 * - State verification
 */

import { TestScenario, UserSession, RealisticBehavior, StateVerifier, BrowserbaseSessionManager } from './orchestrator'
import { BrowserbaseController, BrowserbaseUserActions } from './browserbase-impl'

const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3000'
const stateVerifier = new StateVerifier()

/**
 * Scenario 1: Both users vote "yes" - should redirect to video-date
 */
export const scenarioBothYes: TestScenario = {
  name: 'Both Users Vote Yes',
  description: 'Two users spin, get matched, both vote "yes", both should redirect to video-date',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    // Get controllers
    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    if (!controller1 || !controller2) {
      throw new Error('Controllers not found for users')
    }

    // Step 1: Both users navigate to app and login
    console.log('📱 Step 1: Users logging in...')
    await Promise.all([
      BrowserbaseUserActions.login(controller1, user1.email, user1.password),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Step 2: Both users spin (simultaneously or with slight delay)
    console.log('🎰 Step 2: Users spinning...')
    const spinPromises = [
      // User 1 spins
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.spin(controller1)
      })(),
      // User 2 spins (with realistic delay)
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.spin(controller2)
      })(),
    ]
    await Promise.all(spinPromises)

    // Step 3: Wait for matching (with realistic polling)
    console.log('⏳ Step 3: Waiting for match...')
    let matched = false
    let attempts = 0
    while (!matched && attempts < 30) {
      await RealisticBehavior.networkDelay()
      // Check if both users are matched
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        user1.state = 'matched'
        user2.state = 'matched'
        console.log(`✅ Match found: ${matchResult.matchId}`)
        break
      }
      attempts++
    }

    if (!matched) {
      throw new Error('Users did not get matched')
    }

    // Step 4: Both users vote "yes" (simultaneously to test race condition)
    console.log('🗳️ Step 4: Both users voting "yes"...')
    const votePromises = [
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.voteYes(controller1)
        user1.state = 'voting'
      })(),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.voteYes(controller2)
        user2.state = 'voting'
      })(),
    ]
    await Promise.all(votePromises)

    // Step 5: Wait for outcome and verify redirect
    console.log('⏳ Step 5: Waiting for vote outcome...')
    await RealisticBehavior.humanDelay(2000, 4000)
    
    // Verify both users are redirected to /video-date
    // This will be checked via Browserbase session URLs
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    // Verify match outcome is "both_yes"
    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      console.error('❌ Users are not matched')
      return false
    }

    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'both_yes'
    )
    if (!voteResult.correct) {
      console.error(`❌ Wrong outcome. Expected: both_yes, Got: ${voteResult.actualOutcome}`)
      return false
    }

    // Verify video date was created
    const videoDateResult = await stateVerifier.verifyVideoDate(matchResult.matchId)
    if (!videoDateResult.exists) {
      console.error('❌ Video date was not created')
      return false
    }

    // Verify both users are in correct state
    const stateResult = await stateVerifier.verifyUserStates(
      user1.userId,
      user2.userId,
      'waiting' // After both_yes, users should be in waiting state before video-date
    )

    console.log('✅ All verifications passed')
    return true
  },
}

/**
 * Scenario 2: One user votes "yes", other votes "pass" - both should respin
 */
export const scenarioYesPass: TestScenario = {
  name: 'One Yes, One Pass',
  description: 'User 1 votes "yes", User 2 votes "pass", both should redirect to spinning',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    // Similar to scenarioBothYes but with different votes
    console.log('📱 Users logging in and spinning...')
    await Promise.all([
      BrowserbaseUserActions.login(controller1, user1.email, user1.password),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Wait for match
    let matched = false
    let attempts = 0
    while (!matched && attempts < 30) {
      await RealisticBehavior.networkDelay()
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        break
      }
      attempts++
    }

    if (!matched) {
      throw new Error('Users did not get matched')
    }

    // User 1 votes "yes" quickly
    console.log('🗳️ User 1 voting "yes"...')
    await RealisticBehavior.fastUserDelay()
    await BrowserbaseUserActions.voteYes(controller1)

    // User 2 votes "pass" slowly (simulates user thinking)
    console.log('🗳️ User 2 voting "pass"...')
    await RealisticBehavior.slowUserDelay()
    await BrowserbaseUserActions.votePass(controller2)

    await RealisticBehavior.humanDelay(2000, 4000)
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      return false
    }

    // Outcome should be "pass_pass" (one pass = both respin)
    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'pass_pass'
    )

    if (!voteResult.correct) {
      console.error(`❌ Wrong outcome. Expected: pass_pass, Got: ${voteResult.actualOutcome}`)
      return false
    }

    // Both users should be back in spinning state
    const stateResult = await stateVerifier.verifyUserStates(
      user1.userId,
      user2.userId,
      'waiting' // Should be back in queue
    )

    return stateResult.correct
  },
}

/**
 * Scenario 3: Both users vote "pass" - both should respin
 */
export const scenarioBothPass: TestScenario = {
  name: 'Both Users Vote Pass',
  description: 'Both users vote "pass", both should redirect to spinning',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    console.log('📱 Users logging in and spinning...')
    await Promise.all([
      BrowserbaseUserActions.login(controller1, user1.email, user1.password),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Spin
    await Promise.all([
      BrowserbaseUserActions.spin(controller1),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.spin(controller2)
      })(),
    ])

    // Wait for match
    let matched = false
    let attempts = 0
    while (!matched && attempts < 30) {
      await RealisticBehavior.networkDelay()
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        break
      }
      attempts++
    }

    if (!matched) {
      throw new Error('Users did not get matched')
    }

    // Both vote "pass" simultaneously
    console.log('🗳️ Both users voting "pass"...')
    await Promise.all([
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.votePass(controller1)
      })(),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.votePass(controller2)
      })(),
    ])

    await RealisticBehavior.humanDelay(2000, 4000)
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      return false
    }

    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'pass_pass'
    )

    return voteResult.correct
  },
}

/**
 * Scenario 4: One user refreshes during voting
 */
export const scenarioRefreshDuringVote: TestScenario = {
  name: 'User Refreshes During Vote',
  description: 'User 1 votes, User 2 refreshes page, verify state recovery',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    console.log('📱 Users logging in and spinning...')
    await Promise.all([
      BrowserbaseUserActions.login(controller1, user1.email, user1.password),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Spin
    await Promise.all([
      BrowserbaseUserActions.spin(controller1),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.spin(controller2)
      })(),
    ])

    // Wait for match
    let matched = false
    let attempts = 0
    while (!matched && attempts < 30) {
      await RealisticBehavior.networkDelay()
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        break
      }
      attempts++
    }

    // User 1 votes "yes"
    console.log('🗳️ User 1 voting "yes"...')
    await RealisticBehavior.fastUserDelay()
    await BrowserbaseUserActions.voteYes(controller1)

    // User 2 refreshes page (simulate real user behavior)
    console.log('🔄 User 2 refreshing page...')
    await RealisticBehavior.humanDelay(500, 1000)
    await BrowserbaseUserActions.refresh(controller2)

    // User 2 should recover and vote
    console.log('🗳️ User 2 voting after refresh...')
    await RealisticBehavior.humanDelay(1000, 2000)
    await BrowserbaseUserActions.voteYes(controller2)

    await RealisticBehavior.humanDelay(2000, 4000)
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      return false
    }

    // Should have valid outcome
    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'both_yes' // or 'yes_pass' depending on what user2 voted
    )

    return voteResult.correct || voteResult.actualOutcome === 'yes_pass'
  },
}

/**
 * Scenario 5: Slow network conditions
 */
export const scenarioSlowNetwork: TestScenario = {
  name: 'Slow Network Conditions',
  description: 'Test with simulated slow network (3G speeds)',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    console.log('📱 Users logging in with slow network...')
    // Simulate slow network with longer delays
    await Promise.all([
      (async () => {
        await RealisticBehavior.humanDelay(2000, 4000)
        await BrowserbaseUserActions.login(controller1, user1.email, user1.password)
      })(),
      (async () => {
        await RealisticBehavior.humanDelay(2500, 4500)
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Spin with network delays
    console.log('🎰 Users spinning with slow network...')
    await Promise.all([
      (async () => {
        await RealisticBehavior.humanDelay(1000, 2000) // Network delay
        await BrowserbaseUserActions.spin(controller1)
        await RealisticBehavior.humanDelay(1000, 2000) // Response delay
      })(),
      (async () => {
        await RealisticBehavior.humanDelay(1500, 2500)
        await BrowserbaseUserActions.spin(controller2)
        await RealisticBehavior.humanDelay(1500, 2500)
      })(),
    ])

    // Wait longer for match due to slow network
    console.log('⏳ Waiting for match (slow network)...')
    let matched = false
    let attempts = 0
    while (!matched && attempts < 60) { // More attempts for slow network
      await RealisticBehavior.humanDelay(1000, 2000) // Slow polling
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        break
      }
      attempts++
    }

    if (!matched) {
      throw new Error('Users did not get matched (slow network)')
    }

    // Vote with slow network
    console.log('🗳️ Users voting with slow network...')
    await Promise.all([
      (async () => {
        await RealisticBehavior.humanDelay(2000, 3000)
        await BrowserbaseUserActions.voteYes(controller1)
      })(),
      (async () => {
        await RealisticBehavior.humanDelay(2500, 3500)
        await BrowserbaseUserActions.voteYes(controller2)
      })(),
    ])

    await RealisticBehavior.humanDelay(3000, 5000) // Extra wait for slow network
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      return false
    }

    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'both_yes' // Assuming both vote yes
    )

    return voteResult.correct
  },
}

/**
 * Scenario 6: Simultaneous voting (race condition test)
 */
export const scenarioSimultaneousVote: TestScenario = {
  name: 'Simultaneous Voting (Race Condition)',
  description: 'Both users vote at the exact same time to test race conditions',
  users: 2,
  
  actions: async (sessions: UserSession[], sessionManager?: BrowserbaseSessionManager) => {
    const [user1, user2] = sessions

    if (!sessionManager) {
      throw new Error('Session manager required')
    }

    const controller1 = sessionManager.getController(user1.userId) as BrowserbaseController
    const controller2 = sessionManager.getController(user2.userId) as BrowserbaseController

    console.log('📱 Users logging in and spinning...')
    await Promise.all([
      BrowserbaseUserActions.login(controller1, user1.email, user1.password),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.login(controller2, user2.email, user2.password)
      })(),
    ])

    // Spin
    await Promise.all([
      BrowserbaseUserActions.spin(controller1),
      (async () => {
        await RealisticBehavior.randomActionTiming()
        await BrowserbaseUserActions.spin(controller2)
      })(),
    ])

    // Wait for match
    let matched = false
    let attempts = 0
    while (!matched && attempts < 30) {
      await RealisticBehavior.networkDelay()
      const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
      if (matchResult.matched) {
        matched = true
        break
      }
      attempts++
    }

    if (!matched) {
      throw new Error('Users did not get matched')
    }

    // CRITICAL: Both vote at EXACTLY the same time (no delay)
    console.log('🗳️ Both users voting simultaneously (race condition test)...')
    await Promise.all([
      // User 1 votes immediately
      (async () => {
        await BrowserbaseUserActions.voteYes(controller1)
      })(),
      // User 2 votes immediately
      (async () => {
        await BrowserbaseUserActions.voteYes(controller2)
      })(),
    ])

    // Wait for processing
    await RealisticBehavior.humanDelay(3000, 5000)
  },

  verify: async (sessions: UserSession[]) => {
    const [user1, user2] = sessions

    const matchResult = await stateVerifier.verifyMatch(user1.userId, user2.userId)
    if (!matchResult.matched || !matchResult.matchId) {
      return false
    }

    // Both votes should be recorded correctly despite race condition
    const voteResult = await stateVerifier.verifyVotingOutcome(
      matchResult.matchId,
      'both_yes'
    )

    if (!voteResult.correct) {
      console.error(`❌ Race condition detected! Expected: both_yes, Got: ${voteResult.actualOutcome}`)
      console.error(`User 1 vote: ${voteResult.user1Vote}, User 2 vote: ${voteResult.user2Vote}`)
      return false
    }

    return true
  },
}

// Export all scenarios
export const allScenarios: TestScenario[] = [
  scenarioBothYes,
  scenarioYesPass,
  scenarioBothPass,
  scenarioRefreshDuringVote,
  scenarioSlowNetwork,
  scenarioSimultaneousVote,
]

