/**
 * Complete Debugging Toolkit for Realtime Matching Engine
 * Exports all debugging modules for easy access
 */

// Module 1: Core State Management
export {
  debugState,
  engineState,
  addToQueue,
  createPair,
  recordVote,
  updateHeartbeat,
  setUserState,
  type User,
  type QueueEntry,
  type Pair,
  type Timer
} from './core/state';

// Module 2: Structured Logging
export {
  logEvent,
  logError,
  logDebug,
  getLogs,
  getLogsByType,
  getLogsByUser,
  getErrors,
  clearLogs,
  flushLogsToFile,
  logWithState,
  logAfterState,
  type LogEntry
} from './core/logging';

// Module 3: State Snapshots
export {
  captureBeforeState,
  captureAfterState,
  captureEvent,
  getSnapshots,
  getSnapshotsByType,
  getSnapshotsByUser,
  getSnapshot,
  compareSnapshots,
  findStateChanges,
  clearSnapshots,
  getSnapshotStatus,
  type StateSnapshot
} from './core/snapshots';

// Module 4: Validators
export {
  validateState,
  getValidationHistory,
  getLastValidation,
  clearValidationHistory,
  setAutoValidate,
  isAutoValidateEnabled,
  validateAfterEvent,
  type ValidationError,
  type ValidationResult
} from './core/validators';

// Module 5: Simulation
export {
  simulate,
  runScenario,
  runChaos,
  generateChaosEvents,
  setSeed,
  getSimulationEventLog,
  clearSimulationEventLog,
  scenarios,
  type SimulationEvent,
  type SimulationScenario,
  type SimulationResult
} from './simulation/simulator';

// Module 6: Event Replay
export {
  replay,
  replayFromMemory,
  compareReplays,
  getReplayLog,
  clearReplayLog,
  isReplaying,
  type ReplayOptions,
  type ReplayResult,
  type ReplayError,
  type StateDivergence
} from './replay/replay';

// Module 7: Time Management
export {
  getTime,
  getTimestamp,
  setTimeOffset,
  pauseTime,
  resumeTime,
  setSpeedMultiplier,
  setTimeout,
  setInterval,
  clearTimer,
  setHeartbeatTimer,
  clearHeartbeatTimer,
  setVoteTimer,
  setVideoTimer,
  setRespinTimer,
  setDisconnectTimer,
  setIdleTimer,
  getActiveTimers,
  getTimersByType,
  getTimer,
  clearAllTimers,
  getTimeConfig,
  updateTimeConfig,
  getTimeStatus,
  type ManagedTimer,
  type TimeConfig
} from './timing/timeManager';

// Module 8: Dashboard Data
export {
  getDebugFeed,
  getFeedHistory,
  getCompactFeed,
  streamUpdates,
  exportFeed,
  clearFeedHistory,
  type DebugFeedData,
  type QueueSummary,
  type PairSummary,
  type TimerSummary,
  type HeartbeatSummary,
  type EventSummary,
  type ErrorSummary,
  type FairnessDistribution,
  type LockSummary,
  type SystemHealth,
  type SystemStats
} from './dashboard/dataFeeder';

// Module 9: Freeze & Rollback
export {
  freezeState,
  rollbackTo,
  listFrozenStates,
  getFrozenState,
  deleteFrozenState,
  clearAllFrozenStates,
  createCheckpoint,
  rollbackToLastCheckpoint,
  compareWithFrozen,
  exportFrozenStates,
  importFrozenStates,
  getRollbackHistory,
  clearRollbackHistory,
  type FrozenState
} from './freeze/freezeRollback';

/**
 * Main Debug Toolkit Interface
 * Provides unified access to all debugging functionality
 */
export class DebugToolkit {
  /**
   * Get complete system state
   */
  static getState() {
    return debugState();
  }
  
  /**
   * Get compact debug feed
   */
  static getFeed() {
    return getDebugFeed();
  }
  
  /**
   * Run validation
   */
  static validate() {
    return validateState();
  }
  
  /**
   * Create checkpoint
   */
  static checkpoint(description?: string) {
    return createCheckpoint(description);
  }
  
  /**
   * Rollback to last checkpoint
   */
  static rollback() {
    return rollbackToLastCheckpoint();
  }
  
  /**
   * Run simulation
   */
  static async simulate(events: SimulationEvent[]) {
    return simulate(events);
  }
  
  /**
   * Replay from log
   */
  static async replay(logFile: string, options?: ReplayOptions) {
    return replay(logFile, options);
  }
  
  /**
   * Get system health
   */
  static getHealth() {
    const feed = getDebugFeed();
    return {
      health: feed.systemHealth,
      stats: feed.stats
    };
  }
  
  /**
   * Reset everything
   */
  static reset() {
    engineState.reset();
    clearLogs();
    clearSnapshots();
    clearValidationHistory();
    clearAllTimers();
    clearFeedHistory();
    clearAllFrozenStates();
    clearRollbackHistory();
  }
  
  /**
   * Export debug data
   */
  static export() {
    return {
      state: debugState(),
      feed: getDebugFeed(),
      logs: getLogs(),
      snapshots: getSnapshots(),
      validations: getValidationHistory(),
      frozenStates: exportFrozenStates()
    };
  }
}

// Default export for convenience
export default DebugToolkit;