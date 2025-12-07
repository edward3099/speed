/**
 * State Machine for User Matching Flow
 * Based on FSM patterns from GitHub research
 * Formalizes state transitions and prevents invalid states
 */

export type UserState =
  | 'idle'
  | 'waiting'
  | 'paired'
  | 'vote_window'
  | 'video_date'
  | 'ended'

export type StateTransition = {
  from: UserState
  to: UserState
  condition?: string
}

/**
 * Valid state transitions
 * Based on the actual flow in the application
 */
const VALID_TRANSITIONS: StateTransition[] = [
  // Initial states
  { from: 'idle', to: 'waiting', condition: 'User presses spin' },
  { from: 'waiting', to: 'idle', condition: 'User cancels or timeout' },
  
  // Matching flow
  { from: 'waiting', to: 'paired', condition: 'Match found' },
  { from: 'paired', to: 'vote_window', condition: 'Both users acknowledge' },
  { from: 'paired', to: 'waiting', condition: 'Match cancelled or timeout' },
  
  // Voting flow
  { from: 'vote_window', to: 'video_date', condition: 'Both users vote yes' },
  { from: 'vote_window', to: 'waiting', condition: 'One or both users vote pass' },
  { from: 'vote_window', to: 'ended', condition: 'Vote window expires' },
  
  // Video date flow
  { from: 'video_date', to: 'ended', condition: 'Date ends or user leaves' },
  { from: 'video_date', to: 'waiting', condition: 'Date ends early' },
  
  // End states
  { from: 'ended', to: 'idle', condition: 'Reset after date' },
  { from: 'ended', to: 'waiting', condition: 'User wants to spin again' },
]

/**
 * State Machine class for managing user state transitions
 */
export class UserStateMachine {
  private currentState: UserState
  private stateHistory: Array<{ state: UserState; timestamp: number; reason?: string }> = []

  constructor(initialState: UserState = 'idle') {
    this.currentState = initialState
    this.recordStateChange(initialState, 'Initial state')
  }

  /**
   * Check if a transition is valid
   */
  canTransitionTo(newState: UserState): boolean {
    return VALID_TRANSITIONS.some(
      (transition) => transition.from === this.currentState && transition.to === newState
    )
  }

  /**
   * Get valid next states from current state
   */
  getValidNextStates(): UserState[] {
    return VALID_TRANSITIONS.filter((t) => t.from === this.currentState).map((t) => t.to)
  }

  /**
   * Transition to a new state (with validation)
   */
  transitionTo(newState: UserState, reason?: string): boolean {
    if (!this.canTransitionTo(newState)) {
      const validStates = this.getValidNextStates()
      console.error(
        `❌ Invalid state transition: ${this.currentState} → ${newState}. Valid next states: ${validStates.join(', ')}`
      )
      return false
    }

    const oldState = this.currentState
    this.currentState = newState
    this.recordStateChange(newState, reason)

    console.log(`✅ State transition: ${oldState} → ${newState}${reason ? ` (${reason})` : ''}`)
    return true
  }

  /**
   * Get current state
   */
  getCurrentState(): UserState {
    return this.currentState
  }

  /**
   * Get state history
   */
  getStateHistory(): Array<{ state: UserState; timestamp: number; reason?: string }> {
    return [...this.stateHistory]
  }

  /**
   * Record state change in history
   */
  private recordStateChange(state: UserState, reason?: string): void {
    this.stateHistory.push({
      state,
      timestamp: Date.now(),
      reason,
    })

    // Keep only last 50 state changes
    if (this.stateHistory.length > 50) {
      this.stateHistory.shift()
    }
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.currentState = 'idle'
    this.recordStateChange('idle', 'Reset')
  }

  /**
   * Get transition info for debugging
   */
  getTransitionInfo(from: UserState, to: UserState): StateTransition | null {
    return VALID_TRANSITIONS.find((t) => t.from === from && t.to === to) || null
  }
}

/**
 * Helper function to validate state transition
 */
export function isValidTransition(from: UserState, to: UserState): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to)
}

/**
 * Get all valid next states from a given state
 */
export function getValidNextStates(from: UserState): UserState[] {
  return VALID_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
}

/**
 * State transition reasons (for logging)
 */
export const StateTransitionReasons = {
  USER_SPIN: 'User pressed spin',
  MATCH_FOUND: 'Match found',
  BOTH_ACKNOWLEDGED: 'Both users acknowledged match',
  VOTE_BOTH_YES: 'Both users voted yes',
  VOTE_PASS: 'One or both users voted pass',
  VOTE_TIMEOUT: 'Vote window expired',
  DATE_ENDED: 'Video date ended',
  DATE_ENDED_EARLY: 'Video date ended early',
  USER_CANCELLED: 'User cancelled',
  TIMEOUT: 'Timeout',
  RESET: 'Reset to idle',
} as const

