/**
 * Module 9: Freeze and Rollback
 * Support for state freezing and rollback functionality
 */

import { engineState, debugState } from '../core/state';
import { logEvent, logError } from '../core/logging';
import { captureAfterState } from '../core/snapshots';

export interface FrozenState {
  id: string;
  name?: string;
  description?: string;
  timestamp: string;
  state: any;
  metadata?: any;
}

class FreezeRollbackManager {
  private static instance: FreezeRollbackManager;
  private frozenStates: Map<string, FrozenState> = new Map();
  private maxFrozenStates: number = 50;
  private rollbackHistory: any[] = [];
  
  private constructor() {}
  
  static getInstance(): FreezeRollbackManager {
    if (!FreezeRollbackManager.instance) {
      FreezeRollbackManager.instance = new FreezeRollbackManager();
    }
    return FreezeRollbackManager.instance;
  }
  
  /**
   * Freeze current state with an ID
   */
  freezeState(id: string, name?: string, description?: string, metadata?: any): FrozenState {
    // Capture current state
    const currentState = debugState();
    
    const frozen: FrozenState = {
      id,
      name,
      description,
      timestamp: new Date().toISOString(),
      state: this.deepClone(currentState),
      metadata
    };
    
    // Store frozen state
    this.frozenStates.set(id, frozen);
    
    // Maintain size limit
    if (this.frozenStates.size > this.maxFrozenStates) {
      // Remove oldest states
      const sortedIds = Array.from(this.frozenStates.entries())
        .sort((a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime())
        .slice(0, this.frozenStates.size - this.maxFrozenStates)
        .map(([id]) => id);
      
      sortedIds.forEach(id => this.frozenStates.delete(id));
    }
    
    logEvent({
      type: 'state_frozen',
      metadata: {
        id,
        name,
        description,
        stateSize: JSON.stringify(currentState).length
      }
    });
    
    return frozen;
  }
  
  /**
   * Rollback to a frozen state
   */
  rollbackTo(id: string): boolean {
    const frozen = this.frozenStates.get(id);
    
    if (!frozen) {
      logError({
        type: 'rollback_failed',
        error: `Frozen state with id '${id}' not found`
      });
      return false;
    }
    
    // Capture current state before rollback
    const beforeState = debugState();
    
    try {
      // Clear current state
      this.clearCurrentState();
      
      // Restore frozen state
      this.restoreState(frozen.state);
      
      // Capture after state
      const afterState = debugState();
      
      // Log rollback
      this.rollbackHistory.push({
        id,
        timestamp: new Date().toISOString(),
        beforeState,
        afterState,
        frozenStateId: frozen.id,
        frozenStateName: frozen.name
      });
      
      logEvent({
        type: 'state_rollback',
        metadata: {
          id,
          name: frozen.name,
          frozenAt: frozen.timestamp,
          rolledBackAt: new Date().toISOString()
        },
        beforeState,
        afterState
      });
      
      return true;
      
    } catch (error) {
      logError({
        type: 'rollback_error',
        error,
        metadata: { id, frozenState: frozen }
      });
      
      // Try to restore original state
      try {
        this.clearCurrentState();
        this.restoreState(beforeState);
      } catch (restoreError) {
        logError({
          type: 'rollback_restore_failed',
          error: restoreError
        });
      }
      
      return false;
    }
  }
  
  /**
   * Clear current state
   */
  private clearCurrentState() {
    engineState.queue.clear();
    engineState.pairs.clear();
    engineState.voteActive.clear();
    engineState.videoActive.clear();
    engineState.locks.clear();
    engineState.heartbeat.clear();
    engineState.fairness.clear();
    engineState.timers.clear();
    engineState.idle.clear();
    engineState.userStates.clear();
    engineState.lastActivity.clear();
  }
  
  /**
   * Restore state from frozen snapshot
   */
  private restoreState(frozenState: any) {
    // Restore queue
    if (frozenState.queue) {
      frozenState.queue.forEach((entry: any) => {
        engineState.queue.set(entry.id || entry.userId, entry);
      });
    }
    
    // Restore pairs
    if (frozenState.pairs) {
      Object.entries(frozenState.pairs).forEach(([id, pair]) => {
        engineState.pairs.set(id, pair as any);
      });
    }
    
    // Restore voteActive
    if (frozenState.voteActive) {
      Object.entries(frozenState.voteActive).forEach(([userId, pairId]) => {
        engineState.voteActive.set(userId, pairId as string);
      });
    }
    
    // Restore videoActive
    if (frozenState.videoActive) {
      Object.entries(frozenState.videoActive).forEach(([userId, pairId]) => {
        engineState.videoActive.set(userId, pairId as string);
      });
    }
    
    // Restore locks
    if (frozenState.locks) {
      Object.entries(frozenState.locks).forEach(([userId, reason]) => {
        engineState.locks.set(userId, reason as string);
      });
    }
    
    // Restore heartbeat
    if (frozenState.heartbeat) {
      Object.entries(frozenState.heartbeat).forEach(([userId, lastPing]) => {
        engineState.heartbeat.set(userId, lastPing as number);
      });
    }
    
    // Restore fairness
    if (frozenState.fairness) {
      Object.entries(frozenState.fairness).forEach(([userId, score]) => {
        engineState.fairness.set(userId, score as number);
      });
    }
    
    // Restore timers
    if (frozenState.timers) {
      frozenState.timers.forEach((timer: any) => {
        engineState.timers.set(timer.id, timer);
      });
    }
    
    // Restore idle
    if (frozenState.idle) {
      Object.entries(frozenState.idle).forEach(([userId, idleStart]) => {
        engineState.idle.set(userId, idleStart as number);
      });
    }
    
    // Restore userStates
    if (frozenState.userStates) {
      Object.entries(frozenState.userStates).forEach(([userId, state]) => {
        engineState.userStates.set(userId, state as string);
      });
    }
    
    // Restore lastActivity
    if (frozenState.lastActivity) {
      Object.entries(frozenState.lastActivity).forEach(([userId, timestamp]) => {
        engineState.lastActivity.set(userId, timestamp as number);
      });
    }
  }
  
  /**
   * List all frozen states
   */
  listFrozenStates(): FrozenState[] {
    return Array.from(this.frozenStates.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  
  /**
   * Get a specific frozen state
   */
  getFrozenState(id: string): FrozenState | undefined {
    return this.frozenStates.get(id);
  }
  
  /**
   * Delete a frozen state
   */
  deleteFrozenState(id: string): boolean {
    const existed = this.frozenStates.has(id);
    this.frozenStates.delete(id);
    
    if (existed) {
      logEvent({
        type: 'frozen_state_deleted',
        metadata: { id }
      });
    }
    
    return existed;
  }
  
  /**
   * Clear all frozen states
   */
  clearAllFrozenStates() {
    const count = this.frozenStates.size;
    this.frozenStates.clear();
    
    logEvent({
      type: 'all_frozen_states_cleared',
      metadata: { count }
    });
  }
  
  /**
   * Create a checkpoint (auto-named frozen state)
   */
  createCheckpoint(description?: string): string {
    const id = `checkpoint_${Date.now()}`;
    const name = `Checkpoint ${new Date().toLocaleString()}`;
    
    this.freezeState(id, name, description);
    return id;
  }
  
  /**
   * Rollback to last checkpoint
   */
  rollbackToLastCheckpoint(): boolean {
    const checkpoints = this.listFrozenStates()
      .filter(fs => fs.id.startsWith('checkpoint_'));
    
    if (checkpoints.length === 0) {
      logError({
        type: 'no_checkpoint_found',
        error: 'No checkpoints available for rollback'
      });
      return false;
    }
    
    return this.rollbackTo(checkpoints[0].id);
  }
  
  /**
   * Compare current state with frozen state
   */
  compareWithFrozen(id: string): any {
    const frozen = this.frozenStates.get(id);
    
    if (!frozen) {
      return null;
    }
    
    const currentState = debugState();
    
    return {
      frozenId: id,
      frozenName: frozen.name,
      frozenAt: frozen.timestamp,
      differences: this.findDifferences(frozen.state, currentState)
    };
  }
  
  /**
   * Find differences between two states
   */
  private findDifferences(state1: any, state2: any): any {
    const differences: any = {};
    
    // Check queue differences
    const queue1 = new Set(state1.queue.map((e: any) => e.userId || e.id));
    const queue2 = new Set(state2.queue.map((e: any) => e.userId || e.id));
    
    differences.queueAdded = Array.from(queue2).filter(id => !queue1.has(id));
    differences.queueRemoved = Array.from(queue1).filter(id => !queue2.has(id));
    
    // Check pair differences
    const pairs1 = new Set(Object.keys(state1.pairs));
    const pairs2 = new Set(Object.keys(state2.pairs));
    
    differences.pairsAdded = Array.from(pairs2).filter(id => !pairs1.has(id));
    differences.pairsRemoved = Array.from(pairs1).filter(id => !pairs2.has(id));
    
    // Check state changes
    const stateChanges: any[] = [];
    const allUsers = new Set([
      ...Object.keys(state1.userStates),
      ...Object.keys(state2.userStates)
    ]);
    
    allUsers.forEach(userId => {
      const oldState = state1.userStates[userId];
      const newState = state2.userStates[userId];
      
      if (oldState !== newState) {
        stateChanges.push({
          userId,
          from: oldState || 'none',
          to: newState || 'none'
        });
      }
    });
    
    differences.stateChanges = stateChanges;
    
    return differences;
  }
  
  /**
   * Deep clone an object
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }
    
    if (obj instanceof Map) {
      const cloned = new Map();
      obj.forEach((value, key) => {
        cloned.set(key, this.deepClone(value));
      });
      return cloned;
    }
    
    if (obj instanceof Set) {
      const cloned = new Set();
      obj.forEach(value => {
        cloned.add(this.deepClone(value));
      });
      return cloned;
    }
    
    const cloned: any = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = this.deepClone(obj[key]);
    });
    
    return cloned;
  }
  
  /**
   * Export frozen states
   */
  exportFrozenStates(): string {
    const states = this.listFrozenStates();
    return JSON.stringify(states, null, 2);
  }
  
  /**
   * Import frozen states
   */
  importFrozenStates(jsonString: string): number {
    try {
      const states = JSON.parse(jsonString) as FrozenState[];
      let imported = 0;
      
      states.forEach(state => {
        if (state.id && state.state) {
          this.frozenStates.set(state.id, state);
          imported++;
        }
      });
      
      logEvent({
        type: 'frozen_states_imported',
        metadata: { count: imported }
      });
      
      return imported;
      
    } catch (error) {
      logError({
        type: 'import_frozen_states_failed',
        error
      });
      return 0;
    }
  }
  
  /**
   * Get rollback history
   */
  getRollbackHistory(limit?: number): any[] {
    if (limit) {
      return this.rollbackHistory.slice(-limit);
    }
    return [...this.rollbackHistory];
  }
  
  /**
   * Clear rollback history
   */
  clearRollbackHistory() {
    this.rollbackHistory = [];
  }
}

// Export singleton instance
const freezeRollbackManager = FreezeRollbackManager.getInstance();

export const freezeState = freezeRollbackManager.freezeState.bind(freezeRollbackManager);
export const rollbackTo = freezeRollbackManager.rollbackTo.bind(freezeRollbackManager);
export const listFrozenStates = freezeRollbackManager.listFrozenStates.bind(freezeRollbackManager);
export const getFrozenState = freezeRollbackManager.getFrozenState.bind(freezeRollbackManager);
export const deleteFrozenState = freezeRollbackManager.deleteFrozenState.bind(freezeRollbackManager);
export const clearAllFrozenStates = freezeRollbackManager.clearAllFrozenStates.bind(freezeRollbackManager);
export const createCheckpoint = freezeRollbackManager.createCheckpoint.bind(freezeRollbackManager);
export const rollbackToLastCheckpoint = freezeRollbackManager.rollbackToLastCheckpoint.bind(freezeRollbackManager);
export const compareWithFrozen = freezeRollbackManager.compareWithFrozen.bind(freezeRollbackManager);
export const exportFrozenStates = freezeRollbackManager.exportFrozenStates.bind(freezeRollbackManager);
export const importFrozenStates = freezeRollbackManager.importFrozenStates.bind(freezeRollbackManager);
export const getRollbackHistory = freezeRollbackManager.getRollbackHistory.bind(freezeRollbackManager);
export const clearRollbackHistory = freezeRollbackManager.clearRollbackHistory.bind(freezeRollbackManager);

export default freezeRollbackManager;