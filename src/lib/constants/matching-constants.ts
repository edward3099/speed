/**
 * Matching System Constants
 * 
 * V3 Matching System: Constants for matching configuration and state management
 * These constants are used throughout the application for matching logic
 */

/**
 * Video Date Countdown Defaults
 * 
 * These defaults ensure users have privacy during countdown.
 * Users can still enable video/mic if they choose.
 */
export const VIDEO_DATE_DEFAULTS = {
  /** Default to muted during countdown */
  COUNTDOWN_MUTED: true,
  /** Default to video off during countdown */
  COUNTDOWN_VIDEO_OFF: true,
} as const

/**
 * Matching System Configuration
 * 
 * These values control the tier-based matching system.
 * Changing these will affect matching behavior significantly.
 */
export const MATCHING_CONFIG = {
  /** Polling interval for match attempts (milliseconds) */
  POLLING_INTERVAL_MS: 2000,
  /** Maximum retry attempts for partner status check */
  MAX_RETRY_ATTEMPTS: 3,
  /** Delay between retries (milliseconds) */
  RETRY_DELAY_MS: 500,
  /** Tier 1 timeout (seconds) - exact preferences */
  TIER_1_TIMEOUT_SEC: 2,
  /** Tier 2 timeout (seconds) - expanded preferences */
  TIER_2_TIMEOUT_SEC: 10,
  /** Tier 3 - guaranteed match (no timeout) */
  TIER_3_GUARANTEED: true,
} as const

/**
 * State Machine - Valid States
 * 
 * These define the valid states in the matching system.
 * Users must transition through these states in order.
 */
export const MATCHING_STATES = {
  SPIN_ACTIVE: 'spin_active',
  QUEUE_WAITING: 'queue_waiting',
  PAIRED: 'paired',
  VOTE_ACTIVE: 'vote_active',
  VIDEO_DATE: 'video_date',
  ENDED: 'ended',
} as const

/**
 * State Transition Rules
 * 
 * Defines valid state transitions.
 * Format: [from_state, to_state][]
 */
export const VALID_STATE_TRANSITIONS = [
  [MATCHING_STATES.SPIN_ACTIVE, MATCHING_STATES.QUEUE_WAITING],
  [MATCHING_STATES.QUEUE_WAITING, MATCHING_STATES.PAIRED],
  [MATCHING_STATES.PAIRED, MATCHING_STATES.VOTE_ACTIVE],
  [MATCHING_STATES.VOTE_ACTIVE, MATCHING_STATES.VIDEO_DATE],
  [MATCHING_STATES.VOTE_ACTIVE, MATCHING_STATES.SPIN_ACTIVE], // Respin
  [MATCHING_STATES.VIDEO_DATE, MATCHING_STATES.ENDED],
] as const

/**
 * Error Handling Configuration
 * 
 * These values control error handling behavior.
 */
export const ERROR_HANDLING = {
  /** Logging should never block the application */
  LOGGING_NON_BLOCKING: true,
  /** Maximum error log size before truncation */
  MAX_ERROR_LOG_SIZE: 10000,
  /** Whether to show error alerts to users */
  SHOW_ERROR_ALERTS: false, // Errors logged, not shown
} as const

/**
 * Type definitions for matching constants
 */
export type MatchingState = typeof MATCHING_STATES[keyof typeof MATCHING_STATES]
export type StateTransition = typeof VALID_STATE_TRANSITIONS[number]

/**
 * Validation function to check if state transition is valid
 */
export function isValidStateTransition(
  from: MatchingState,
  to: MatchingState
): boolean {
  return VALID_STATE_TRANSITIONS.some(
    ([fromState, toState]) => fromState === from && toState === to
  )
}

/**
 * Get default state for video date countdown
 */
export function getVideoDateDefaults() {
  return {
    muted: VIDEO_DATE_DEFAULTS.COUNTDOWN_MUTED,
    videoOff: VIDEO_DATE_DEFAULTS.COUNTDOWN_VIDEO_OFF,
  }
}

/**
 * Get matching configuration
 */
export function getMatchingConfig() {
  return {
    pollingInterval: MATCHING_CONFIG.POLLING_INTERVAL_MS,
    maxRetries: MATCHING_CONFIG.MAX_RETRY_ATTEMPTS,
    retryDelay: MATCHING_CONFIG.RETRY_DELAY_MS,
    tier1Timeout: MATCHING_CONFIG.TIER_1_TIMEOUT_SEC,
    tier2Timeout: MATCHING_CONFIG.TIER_2_TIMEOUT_SEC,
    tier3Guaranteed: MATCHING_CONFIG.TIER_3_GUARANTEED,
  }
}

