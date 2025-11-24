/**
 * Module 4: Tiny Validators
 * Micro checks that run after every event to ensure state consistency
 */

import { debugState, engineState } from './state';
import { logError } from './logging';
import { captureBeforeState, captureAfterState } from './snapshots';

export interface ValidationError {
  rule: string;
  message: string;
  userId?: string;
  details: any;
  severity: 'warning' | 'error' | 'critical';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  timestamp: string;
  stateSnapshot?: any;
}

class StateValidator {
  private static instance: StateValidator;
  private validationHistory: ValidationResult[] = [];
  private maxHistory: number = 100;
  private autoValidate: boolean = true;
  
  private constructor() {}
  
  static getInstance(): StateValidator {
    if (!StateValidator.instance) {
      StateValidator.instance = new StateValidator();
    }
    return StateValidator.instance;
  }
  
  /**
   * Run all validators
   */
  validate(beforeState?: any, afterState?: any): ValidationResult {
    const state = afterState || debugState();
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    // Run each validator
    this.validateUserNotInQueueAndPair(state, errors);
    this.validateNoDuplicateInQueue(state, errors);
    this.validateSymmetricPairs(state, errors);
    this.validateVoteActiveUsers(state, errors);
    this.validateLockedUsers(state, errors);
    this.validateHeartbeatUsers(state, warnings);
    this.validateNoMultipleStates(state, errors);
    this.validateTimerConsistency(state, warnings);
    this.validateFairnessScores(state, warnings);
    this.validateIdleUsers(state, warnings);
    
    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
      stateSnapshot: state
    };
    
    // Log errors if found
    if (errors.length > 0) {
      logError({
        type: 'validation_failed',
        error: errors,
        beforeState,
        afterState: state,
        metadata: {
          errorCount: errors.length,
          warningCount: warnings.length
        }
      });
    }
    
    // Store in history
    this.validationHistory.push(result);
    if (this.validationHistory.length > this.maxHistory) {
      this.validationHistory = this.validationHistory.slice(-this.maxHistory);
    }
    
    return result;
  }
  
  /**
   * Validator: User cannot be in queue and in pair
   */
  private validateUserNotInQueueAndPair(state: any, errors: ValidationError[]) {
    const queueUsers = new Set(state.queue.map((q: any) => q.userId || q.id));
    const pairedUsers = new Set();
    
    Object.values(state.pairs).forEach((pair: any) => {
      pairedUsers.add(pair.user1);
      pairedUsers.add(pair.user2);
    });
    
    for (const userId of queueUsers) {
      if (pairedUsers.has(userId)) {
        errors.push({
          rule: 'user_not_in_queue_and_pair',
          message: `User ${userId} is both in queue and in a pair`,
          userId,
          details: {
            inQueue: true,
            inPair: true
          },
          severity: 'critical'
        });
      }
    }
  }
  
  /**
   * Validator: User cannot appear twice in queue
   */
  private validateNoDuplicateInQueue(state: any, errors: ValidationError[]) {
    const queueUsers = state.queue.map((q: any) => q.userId || q.id);
    const seen = new Set();
    
    for (const userId of queueUsers) {
      if (seen.has(userId)) {
        errors.push({
          rule: 'no_duplicate_in_queue',
          message: `User ${userId} appears multiple times in queue`,
          userId,
          details: {
            occurrences: queueUsers.filter((id: string) => id === userId).length
          },
          severity: 'critical'
        });
      }
      seen.add(userId);
    }
  }
  
  /**
   * Validator: Symmetric pairs (if A has partner B, B must have partner A)
   */
  private validateSymmetricPairs(state: any, errors: ValidationError[]) {
    const userPairs = new Map<string, string>();
    
    Object.values(state.pairs).forEach((pair: any) => {
      userPairs.set(pair.user1, pair.user2);
      userPairs.set(pair.user2, pair.user1);
    });
    
    for (const [user, partner] of userPairs) {
      const partnersPartner = userPairs.get(partner);
      if (partnersPartner !== user) {
        errors.push({
          rule: 'symmetric_pairs',
          message: `Asymmetric pair: ${user} has partner ${partner}, but ${partner} has partner ${partnersPartner}`,
          userId: user,
          details: {
            user,
            partner,
            partnersPartner
          },
          severity: 'critical'
        });
      }
    }
  }
  
  /**
   * Validator: voteActive users must be in pairs
   */
  private validateVoteActiveUsers(state: any, errors: ValidationError[]) {
    const pairedUsers = new Set();
    Object.values(state.pairs).forEach((pair: any) => {
      pairedUsers.add(pair.user1);
      pairedUsers.add(pair.user2);
    });
    
    Object.keys(state.voteActive).forEach(userId => {
      if (!pairedUsers.has(userId)) {
        errors.push({
          rule: 'vote_active_must_be_paired',
          message: `User ${userId} is vote active but not in any pair`,
          userId,
          details: {
            voteActive: true,
            paired: false
          },
          severity: 'error'
        });
      }
    });
  }
  
  /**
   * Validator: Locked users must be in pairs
   */
  private validateLockedUsers(state: any, errors: ValidationError[]) {
    const pairedUsers = new Set();
    Object.values(state.pairs).forEach((pair: any) => {
      pairedUsers.add(pair.user1);
      pairedUsers.add(pair.user2);
    });
    
    Object.entries(state.locks).forEach(([userId, lockReason]) => {
      if (lockReason === 'paired' && !pairedUsers.has(userId)) {
        errors.push({
          rule: 'locked_users_must_be_paired',
          message: `User ${userId} is locked for pairing but not in any pair`,
          userId,
          details: {
            locked: true,
            lockReason,
            paired: false
          },
          severity: 'error'
        });
      }
    });
  }
  
  /**
   * Validator: Heartbeat users must be active
   */
  private validateHeartbeatUsers(state: any, warnings: ValidationError[]) {
    const now = Date.now();
    const heartbeatTimeout = 30000; // 30 seconds
    
    Object.entries(state.heartbeat).forEach(([userId, lastPing]) => {
      const timeSincePing = now - (lastPing as number);
      
      if (timeSincePing > heartbeatTimeout) {
        warnings.push({
          rule: 'heartbeat_timeout',
          message: `User ${userId} heartbeat is stale (${Math.round(timeSincePing / 1000)}s ago)`,
          userId,
          details: {
            lastPing,
            timeSincePing,
            threshold: heartbeatTimeout
          },
          severity: 'warning'
        });
      }
    });
  }
  
  /**
   * Validator: No user appears in multiple state categories incorrectly
   */
  private validateNoMultipleStates(state: any, errors: ValidationError[]) {
    const stateMap = new Map<string, string[]>();
    
    // Collect states for each user
    state.queue.forEach((q: any) => {
      const userId = q.userId || q.id;
      if (!stateMap.has(userId)) stateMap.set(userId, []);
      stateMap.get(userId)!.push('queue');
    });
    
    Object.values(state.pairs).forEach((pair: any) => {
      if (!stateMap.has(pair.user1)) stateMap.set(pair.user1, []);
      if (!stateMap.has(pair.user2)) stateMap.set(pair.user2, []);
      stateMap.get(pair.user1)!.push('paired');
      stateMap.get(pair.user2)!.push('paired');
    });
    
    Object.keys(state.voteActive).forEach(userId => {
      if (!stateMap.has(userId)) stateMap.set(userId, []);
      stateMap.get(userId)!.push('voteActive');
    });
    
    Object.keys(state.videoActive).forEach(userId => {
      if (!stateMap.has(userId)) stateMap.set(userId, []);
      stateMap.get(userId)!.push('videoActive');
    });
    
    // Check for conflicts
    for (const [userId, states] of stateMap) {
      if (states.length > 1) {
        // Some combinations are valid (e.g., paired + voteActive)
        const hasInvalidCombo = 
          (states.includes('queue') && states.length > 1) ||
          (states.includes('videoActive') && states.includes('voteActive'));
        
        if (hasInvalidCombo) {
          errors.push({
            rule: 'no_multiple_states',
            message: `User ${userId} is in multiple conflicting states: ${states.join(', ')}`,
            userId,
            details: {
              states,
              count: states.length
            },
            severity: 'critical'
          });
        }
      }
    }
  }
  
  /**
   * Validator: Timer consistency
   */
  private validateTimerConsistency(state: any, warnings: ValidationError[]) {
    const now = Date.now();
    
    state.timers.forEach((timer: any) => {
      const expiresAt = new Date(timer.expiresAt).getTime();
      
      if (expiresAt < now) {
        warnings.push({
          rule: 'expired_timer',
          message: `Timer ${timer.id} has expired but not cleared`,
          details: {
            timerId: timer.id,
            type: timer.type,
            expiresAt: timer.expiresAt,
            expiredFor: Math.round((now - expiresAt) / 1000)
          },
          severity: 'warning'
        });
      }
    });
  }
  
  /**
   * Validator: Fairness scores
   */
  private validateFairnessScores(state: any, warnings: ValidationError[]) {
    Object.entries(state.fairness).forEach(([userId, score]) => {
      if ((score as number) < 0) {
        warnings.push({
          rule: 'negative_fairness_score',
          message: `User ${userId} has negative fairness score: ${score}`,
          userId,
          details: {
            score
          },
          severity: 'warning'
        });
      }
      
      if ((score as number) > 100) {
        warnings.push({
          rule: 'excessive_fairness_score',
          message: `User ${userId} has excessive fairness score: ${score}`,
          userId,
          details: {
            score
          },
          severity: 'warning'
        });
      }
    });
  }
  
  /**
   * Validator: Idle users
   */
  private validateIdleUsers(state: any, warnings: ValidationError[]) {
    const now = Date.now();
    const idleThreshold = 60000; // 1 minute
    
    Object.entries(state.idle).forEach(([userId, idleStart]) => {
      const idleTime = now - (idleStart as number);
      
      if (idleTime > idleThreshold) {
        warnings.push({
          rule: 'user_idle_too_long',
          message: `User ${userId} has been idle for ${Math.round(idleTime / 1000)}s`,
          userId,
          details: {
            idleStart,
            idleTime,
            threshold: idleThreshold
          },
          severity: 'warning'
        });
      }
    });
  }
  
  /**
   * Get validation history
   */
  getHistory(limit?: number): ValidationResult[] {
    if (limit) {
      return this.validationHistory.slice(-limit);
    }
    return [...this.validationHistory];
  }
  
  /**
   * Get last validation result
   */
  getLastValidation(): ValidationResult | null {
    return this.validationHistory[this.validationHistory.length - 1] || null;
  }
  
  /**
   * Clear validation history
   */
  clearHistory() {
    this.validationHistory = [];
  }
  
  /**
   * Enable/disable auto validation
   */
  setAutoValidate(enabled: boolean) {
    this.autoValidate = enabled;
  }
  
  /**
   * Check if auto validation is enabled
   */
  isAutoValidateEnabled(): boolean {
    return this.autoValidate;
  }
}

// Export singleton instance
const validator = StateValidator.getInstance();

export const validateState = validator.validate.bind(validator);
export const getValidationHistory = validator.getHistory.bind(validator);
export const getLastValidation = validator.getLastValidation.bind(validator);
export const clearValidationHistory = validator.clearHistory.bind(validator);
export const setAutoValidate = validator.setAutoValidate.bind(validator);
export const isAutoValidateEnabled = validator.isAutoValidateEnabled.bind(validator);

// Helper function to validate after an event
export function validateAfterEvent(
  eventType: string,
  beforeState?: any,
  afterState?: any
): ValidationResult {
  const result = validateState(beforeState, afterState);
  
  if (!result.isValid) {
    console.error(`[VALIDATION] Failed after ${eventType}:`, result.errors);
  }
  
  if (result.warnings.length > 0) {
    console.warn(`[VALIDATION] Warnings after ${eventType}:`, result.warnings);
  }
  
  return result;
}

export default validator;