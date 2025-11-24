/**
 * Module 1: Core State Management
 * Provides debugState() function to capture entire internal state
 */

export interface User {
  id: string;
  preferences?: {
    minAge: number;
    maxAge: number;
    gender: string;
    genderPreference: string;
    location?: string;
  };
  fairnessScore?: number;
}

export interface QueueEntry {
  userId: string;
  joinedAt: string;
  preferences: any;
  fairnessScore: number;
  status: 'waiting' | 'matching' | 'paired';
}

export interface Pair {
  id: string;
  user1: string;
  user2: string;
  createdAt: string;
  status: 'voting' | 'video' | 'ended';
  votes?: {
    [userId: string]: 'yes' | 'pass' | null;
  };
}

export interface Timer {
  id: string;
  type: 'vote' | 'video' | 'respin' | 'disconnect';
  expiresAt: string;
  userId?: string;
  pairId?: string;
}

// Global state container
class MatchingEngineState {
  private static instance: MatchingEngineState;
  
  // Core state maps
  public queue: Map<string, QueueEntry> = new Map();
  public pairs: Map<string, Pair> = new Map();
  public voteActive: Map<string, string> = new Map(); // userId -> pairId
  public videoActive: Map<string, string> = new Map(); // userId -> pairId
  public locks: Map<string, string> = new Map(); // userId -> lockReason
  public heartbeat: Map<string, number> = new Map(); // userId -> lastPing
  public fairness: Map<string, number> = new Map(); // userId -> fairnessScore
  public timers: Map<string, Timer> = new Map(); // timerId -> timer
  public idle: Map<string, number> = new Map(); // userId -> idleStartTime
  
  // Additional tracking
  public userStates: Map<string, string> = new Map(); // userId -> currentState
  public lastActivity: Map<string, number> = new Map(); // userId -> timestamp
  
  private constructor() {}
  
  static getInstance(): MatchingEngineState {
    if (!MatchingEngineState.instance) {
      MatchingEngineState.instance = new MatchingEngineState();
    }
    return MatchingEngineState.instance;
  }
  
  reset() {
    this.queue.clear();
    this.pairs.clear();
    this.voteActive.clear();
    this.videoActive.clear();
    this.locks.clear();
    this.heartbeat.clear();
    this.fairness.clear();
    this.timers.clear();
    this.idle.clear();
    this.userStates.clear();
    this.lastActivity.clear();
  }
}

export const engineState = MatchingEngineState.getInstance();

/**
 * Main debugState function - returns entire internal state as structured JSON
 */
export function debugState(): any {
  const state = engineState;
  const now = Date.now();
  
  return {
    queue: Array.from(state.queue.entries()).map(([id, entry]) => ({
      id,
      ...entry
    })),
    pairs: Object.fromEntries(state.pairs),
    voteActive: Object.fromEntries(state.voteActive),
    videoActive: Object.fromEntries(state.videoActive),
    locks: Object.fromEntries(state.locks),
    heartbeat: Object.fromEntries(state.heartbeat),
    fairness: Object.fromEntries(state.fairness),
    timers: Array.from(state.timers.entries()).map(([id, timer]) => ({
      ...timer,
      id
    })),
    idle: Object.fromEntries(state.idle),
    userStates: Object.fromEntries(state.userStates),
    lastActivity: Object.fromEntries(state.lastActivity),
    serverTimestamp: now,
    timestamp: new Date(now).toISOString()
  };
}

/**
 * Helper to add user to queue
 */
export function addToQueue(userId: string, preferences: any = {}) {
  const entry: QueueEntry = {
    userId,
    joinedAt: new Date().toISOString(),
    preferences,
    fairnessScore: engineState.fairness.get(userId) || 0,
    status: 'waiting'
  };
  
  engineState.queue.set(userId, entry);
  engineState.userStates.set(userId, 'queue');
  engineState.lastActivity.set(userId, Date.now());
}

/**
 * Helper to create a pair
 */
export function createPair(user1: string, user2: string): string {
  const pairId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const pair: Pair = {
    id: pairId,
    user1,
    user2,
    createdAt: new Date().toISOString(),
    status: 'voting',
    votes: {
      [user1]: null,
      [user2]: null
    }
  };
  
  // Update state
  engineState.pairs.set(pairId, pair);
  engineState.voteActive.set(user1, pairId);
  engineState.voteActive.set(user2, pairId);
  engineState.queue.delete(user1);
  engineState.queue.delete(user2);
  engineState.userStates.set(user1, 'voting');
  engineState.userStates.set(user2, 'voting');
  engineState.locks.set(user1, 'paired');
  engineState.locks.set(user2, 'paired');
  
  return pairId;
}

/**
 * Helper to record a vote
 */
export function recordVote(userId: string, vote: 'yes' | 'pass') {
  const pairId = engineState.voteActive.get(userId);
  if (!pairId) return;
  
  const pair = engineState.pairs.get(pairId);
  if (!pair || !pair.votes) return;
  
  pair.votes[userId] = vote;
  engineState.lastActivity.set(userId, Date.now());
}

/**
 * Helper to update heartbeat
 */
export function updateHeartbeat(userId: string) {
  engineState.heartbeat.set(userId, Date.now());
  engineState.lastActivity.set(userId, Date.now());
}

/**
 * Helper to set user state
 */
export function setUserState(userId: string, state: string) {
  engineState.userStates.set(userId, state);
  engineState.lastActivity.set(userId, Date.now());
}