/**
 * Module 3: State Snapshots
 * Automatic before/after state snapshots with ring buffer storage
 */

import { debugState } from './state';
import { logEvent } from './logging';

export interface StateSnapshot {
  id: string;
  timestamp: string;
  timestampMs: number;
  eventType: string;
  eventId?: string;
  userId?: string;
  beforeState: any;
  afterState: any;
  stateHash?: string;
  metadata?: any;
}

class SnapshotManager {
  private static instance: SnapshotManager;
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots: number = 200;
  private currentSnapshot: Partial<StateSnapshot> | null = null;
  
  private constructor() {}
  
  static getInstance(): SnapshotManager {
    if (!SnapshotManager.instance) {
      SnapshotManager.instance = new SnapshotManager();
    }
    return SnapshotManager.instance;
  }
  
  /**
   * Generate a hash of the state for comparison
   */
  private generateStateHash(state: any): string {
    const stateString = JSON.stringify(state, Object.keys(state).sort());
    let hash = 0;
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * Capture state before an event
   */
  captureBeforeState(eventType: string, userId?: string, metadata?: any): string {
    const now = Date.now();
    const beforeState = debugState();
    
    this.currentSnapshot = {
      id: `snap_${now}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(now).toISOString(),
      timestampMs: now,
      eventType,
      userId,
      beforeState,
      metadata
    };
    
    return this.currentSnapshot.id || '';
  }
  
  /**
   * Capture state after an event
   */
  captureAfterState(snapshotId?: string): StateSnapshot | null {
    const afterState = debugState();
    
    let snapshot: StateSnapshot | null = null;
    
    if (snapshotId && this.currentSnapshot && this.currentSnapshot.id === snapshotId) {
      // Complete the current snapshot
      snapshot = {
        ...this.currentSnapshot,
        afterState,
        stateHash: this.generateStateHash(afterState)
      } as StateSnapshot;
    } else if (this.currentSnapshot) {
      // Complete whatever current snapshot we have
      snapshot = {
        ...this.currentSnapshot,
        afterState,
        stateHash: this.generateStateHash(afterState)
      } as StateSnapshot;
    } else {
      // Create a standalone snapshot
      const now = Date.now();
      snapshot = {
        id: `snap_${now}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(now).toISOString(),
        timestampMs: now,
        eventType: 'manual',
        beforeState: afterState, // Use current state as both before and after
        afterState,
        stateHash: this.generateStateHash(afterState)
      };
    }
    
    if (snapshot) {
      this.addSnapshot(snapshot);
      this.currentSnapshot = null;
    }
    
    return snapshot;
  }
  
  /**
   * Wrapper to capture both before and after states for a function
   */
  async captureEvent<T>(
    eventType: string,
    userId: string | undefined,
    fn: () => T | Promise<T>,
    metadata?: any
  ): Promise<{ result: T; snapshot: StateSnapshot }> {
    const snapshotId = this.captureBeforeState(eventType, userId, metadata);
    
    try {
      const result = await fn();
      const snapshot = this.captureAfterState(snapshotId)!;
      
      // Log the event with snapshots
      logEvent({
        type: eventType,
        user: userId,
        beforeState: snapshot.beforeState,
        afterState: snapshot.afterState,
        metadata
      });
      
      return { result, snapshot };
    } catch (error) {
      const snapshot = this.captureAfterState(snapshotId)!;
      
      // Log error with snapshots
      logEvent({
        type: `${eventType}_error`,
        user: userId,
        beforeState: snapshot.beforeState,
        afterState: snapshot.afterState,
        metadata: { ...metadata, error }
      });
      
      throw error;
    }
  }
  
  /**
   * Add snapshot to ring buffer
   */
  private addSnapshot(snapshot: StateSnapshot) {
    this.snapshots.push(snapshot);
    
    // Maintain ring buffer size
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
  }
  
  /**
   * Get all snapshots
   */
  getSnapshots(limit?: number): StateSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }
  
  /**
   * Get snapshots by event type
   */
  getSnapshotsByType(eventType: string, limit?: number): StateSnapshot[] {
    const filtered = this.snapshots.filter(s => s.eventType === eventType);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }
  
  /**
   * Get snapshots by user
   */
  getSnapshotsByUser(userId: string, limit?: number): StateSnapshot[] {
    const filtered = this.snapshots.filter(s => s.userId === userId);
    if (limit) {
      return filtered.slice(-limit);
    }
    return filtered;
  }
  
  /**
   * Get snapshot by ID
   */
  getSnapshot(id: string): StateSnapshot | undefined {
    return this.snapshots.find(s => s.id === id);
  }
  
  /**
   * Compare two snapshots
   */
  compareSnapshots(id1: string, id2: string): any {
    const snap1 = this.getSnapshot(id1);
    const snap2 = this.getSnapshot(id2);
    
    if (!snap1 || !snap2) {
      return null;
    }
    
    return {
      snapshot1: {
        id: snap1.id,
        timestamp: snap1.timestamp,
        eventType: snap1.eventType,
        stateHash: snap1.stateHash
      },
      snapshot2: {
        id: snap2.id,
        timestamp: snap2.timestamp,
        eventType: snap2.eventType,
        stateHash: snap2.stateHash
      },
      hashesMatch: snap1.stateHash === snap2.stateHash,
      timeDiff: snap2.timestampMs - snap1.timestampMs
    };
  }
  
  /**
   * Find state changes between snapshots
   */
  findStateChanges(beforeSnapshotId: string, afterSnapshotId: string): any {
    const before = this.getSnapshot(beforeSnapshotId);
    const after = this.getSnapshot(afterSnapshotId);
    
    if (!before || !after) {
      return null;
    }
    
    const changes: any = {
      queueChanges: this.findChanges(
        before.afterState.queue,
        after.afterState.queue
      ),
      pairChanges: this.findChanges(
        before.afterState.pairs,
        after.afterState.pairs
      ),
      voteChanges: this.findChanges(
        before.afterState.voteActive,
        after.afterState.voteActive
      ),
      lockChanges: this.findChanges(
        before.afterState.locks,
        after.afterState.locks
      )
    };
    
    return changes;
  }
  
  /**
   * Helper to find changes between two objects
   */
  private findChanges(before: any, after: any): any {
    const changes: any = {
      added: [],
      removed: [],
      modified: []
    };
    
    // Handle arrays
    if (Array.isArray(before) && Array.isArray(after)) {
      const beforeSet = new Set(before.map(item => JSON.stringify(item)));
      const afterSet = new Set(after.map(item => JSON.stringify(item)));
      
      for (const item of after) {
        const itemStr = JSON.stringify(item);
        if (!beforeSet.has(itemStr)) {
          changes.added.push(item);
        }
      }
      
      for (const item of before) {
        const itemStr = JSON.stringify(item);
        if (!afterSet.has(itemStr)) {
          changes.removed.push(item);
        }
      }
    }
    // Handle objects
    else if (typeof before === 'object' && typeof after === 'object') {
      const beforeKeys = Object.keys(before || {});
      const afterKeys = Object.keys(after || {});
      
      for (const key of afterKeys) {
        if (!beforeKeys.includes(key)) {
          changes.added.push({ key, value: after[key] });
        } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changes.modified.push({
            key,
            before: before[key],
            after: after[key]
          });
        }
      }
      
      for (const key of beforeKeys) {
        if (!afterKeys.includes(key)) {
          changes.removed.push({ key, value: before[key] });
        }
      }
    }
    
    return changes;
  }
  
  /**
   * Clear all snapshots
   */
  clearSnapshots() {
    this.snapshots = [];
    this.currentSnapshot = null;
  }
  
  /**
   * Get ring buffer status
   */
  getStatus() {
    return {
      currentSize: this.snapshots.length,
      maxSize: this.maxSnapshots,
      oldestSnapshot: this.snapshots[0]?.timestamp,
      newestSnapshot: this.snapshots[this.snapshots.length - 1]?.timestamp,
      hasCurrentSnapshot: !!this.currentSnapshot
    };
  }
}

// Export singleton instance
const snapshotManager = SnapshotManager.getInstance();

export const captureBeforeState = snapshotManager.captureBeforeState.bind(snapshotManager);
export const captureAfterState = snapshotManager.captureAfterState.bind(snapshotManager);
export const captureEvent = snapshotManager.captureEvent.bind(snapshotManager);
export const getSnapshots = snapshotManager.getSnapshots.bind(snapshotManager);
export const getSnapshotsByType = snapshotManager.getSnapshotsByType.bind(snapshotManager);
export const getSnapshotsByUser = snapshotManager.getSnapshotsByUser.bind(snapshotManager);
export const getSnapshot = snapshotManager.getSnapshot.bind(snapshotManager);
export const compareSnapshots = snapshotManager.compareSnapshots.bind(snapshotManager);
export const findStateChanges = snapshotManager.findStateChanges.bind(snapshotManager);
export const clearSnapshots = snapshotManager.clearSnapshots.bind(snapshotManager);
export const getSnapshotStatus = snapshotManager.getStatus.bind(snapshotManager);

export default snapshotManager;