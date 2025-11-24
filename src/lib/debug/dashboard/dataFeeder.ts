/**
 * Module 8: Developer Dashboard Data Feeder
 * Provides compact structured data for debugging insights
 */

import { engineState, debugState } from '../core/state';
import { getLogs, getErrors } from '../core/logging';
import { getActiveTimers } from '../timing/timeManager';
import { getLastValidation } from '../core/validators';

export interface DebugFeedData {
  currentQueue: QueueSummary[];
  currentPairs: PairSummary[];
  activeTimers: TimerSummary[];
  heartbeats: HeartbeatSummary[];
  lastTenEvents: EventSummary[];
  lastFiveErrors: ErrorSummary[];
  fairnessDistribution: FairnessDistribution;
  locks: LockSummary[];
  systemHealth: SystemHealth;
  timestamp: string;
  stats: SystemStats;
}

export interface QueueSummary {
  userId: string;
  joinedAt: string;
  waitingTime: number;
  fairnessScore: number;
  preferences: any;
}

export interface PairSummary {
  pairId: string;
  user1: string;
  user2: string;
  status: string;
  votes: any;
  duration: number;
}

export interface TimerSummary {
  id: string;
  type: string;
  remainingTime: number;
  userId?: string;
  pairId?: string;
}

export interface HeartbeatSummary {
  userId: string;
  lastPing: number;
  timeSincePing: number;
  isStale: boolean;
}

export interface EventSummary {
  type: string;
  user?: string;
  timestamp: string;
  metadata?: any;
}

export interface ErrorSummary {
  type: string;
  message: string;
  user?: string;
  timestamp: string;
  severity?: string;
}

export interface FairnessDistribution {
  min: number;
  max: number;
  average: number;
  median: number;
  distribution: { score: number; count: number }[];
}

export interface LockSummary {
  userId: string;
  reason: string;
  duration: number;
}

export interface SystemHealth {
  queueHealth: 'healthy' | 'warning' | 'critical';
  pairHealth: 'healthy' | 'warning' | 'critical';
  timerHealth: 'healthy' | 'warning' | 'critical';
  overallHealth: 'healthy' | 'warning' | 'critical';
  issues: string[];
}

export interface SystemStats {
  totalUsers: number;
  queuedUsers: number;
  pairedUsers: number;
  activeTimers: number;
  averageWaitTime: number;
  matchRate: number;
  errorRate: number;
}

class DebugDataFeeder {
  private static instance: DebugDataFeeder;
  private feedHistory: DebugFeedData[] = [];
  private maxHistory: number = 50;
  
  private constructor() {}
  
  static getInstance(): DebugDataFeeder {
    if (!DebugDataFeeder.instance) {
      DebugDataFeeder.instance = new DebugDataFeeder();
    }
    return DebugDataFeeder.instance;
  }
  
  /**
   * Get complete debug feed
   */
  getDebugFeed(): DebugFeedData {
    const now = Date.now();
    const state = debugState();
    
    const feed: DebugFeedData = {
      currentQueue: this.getQueueSummary(state, now),
      currentPairs: this.getPairSummary(state, now),
      activeTimers: this.getTimerSummary(now),
      heartbeats: this.getHeartbeatSummary(state, now),
      lastTenEvents: this.getEventSummary(),
      lastFiveErrors: this.getErrorSummary(),
      fairnessDistribution: this.getFairnessDistribution(state),
      locks: this.getLockSummary(state, now),
      systemHealth: this.getSystemHealth(state),
      timestamp: new Date(now).toISOString(),
      stats: this.getSystemStats(state)
    };
    
    // Store in history
    this.feedHistory.push(feed);
    if (this.feedHistory.length > this.maxHistory) {
      this.feedHistory = this.feedHistory.slice(-this.maxHistory);
    }
    
    return feed;
  }
  
  /**
   * Get queue summary
   */
  private getQueueSummary(state: any, now: number): QueueSummary[] {
    return state.queue.map((entry: any) => ({
      userId: entry.userId || entry.id,
      joinedAt: entry.joinedAt,
      waitingTime: now - new Date(entry.joinedAt).getTime(),
      fairnessScore: entry.fairnessScore || 0,
      preferences: entry.preferences || {}
    }));
  }
  
  /**
   * Get pair summary
   */
  private getPairSummary(state: any, now: number): PairSummary[] {
    return Object.values(state.pairs).map((pair: any) => ({
      pairId: pair.id,
      user1: pair.user1,
      user2: pair.user2,
      status: pair.status,
      votes: pair.votes || {},
      duration: now - new Date(pair.createdAt).getTime()
    }));
  }
  
  /**
   * Get timer summary
   */
  private getTimerSummary(now: number): TimerSummary[] {
    const activeTimers = getActiveTimers();
    
    return activeTimers.map(timer => ({
      id: timer.id,
      type: timer.type,
      remainingTime: timer.expiresAt ? Math.max(0, timer.expiresAt - now) : 0,
      userId: timer.userId || timer.metadata?.userId,
      pairId: timer.pairId || timer.metadata?.pairId
    }));
  }
  
  /**
   * Get heartbeat summary
   */
  private getHeartbeatSummary(state: any, now: number): HeartbeatSummary[] {
    const heartbeatTimeout = 30000; // 30 seconds
    
    return Object.entries(state.heartbeat).map(([userId, lastPing]) => {
      const timeSincePing = now - (lastPing as number);
      
      return {
        userId,
        lastPing: lastPing as number,
        timeSincePing,
        isStale: timeSincePing > heartbeatTimeout
      };
    });
  }
  
  /**
   * Get event summary
   */
  private getEventSummary(): EventSummary[] {
    const logs = getLogs(10);
    
    return logs.map(log => ({
      type: log.type,
      user: log.user,
      timestamp: log.timestamp,
      metadata: log.metadata
    }));
  }
  
  /**
   * Get error summary
   */
  private getErrorSummary(): ErrorSummary[] {
    const errors = getErrors(5);
    
    return errors.map(error => ({
      type: error.type,
      message: error.error?.message || JSON.stringify(error.error),
      user: error.user,
      timestamp: error.timestamp,
      severity: error.metadata?.severity || 'error'
    }));
  }
  
  /**
   * Get fairness distribution
   */
  private getFairnessDistribution(state: any): FairnessDistribution {
    const scores = Object.values(state.fairness) as number[];
    
    if (scores.length === 0) {
      return {
        min: 0,
        max: 0,
        average: 0,
        median: 0,
        distribution: []
      };
    }
    
    const sortedScores = scores.sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    
    // Calculate distribution buckets
    const buckets = new Map<number, number>();
    scores.forEach(score => {
      const bucket = Math.floor(score / 10) * 10;
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    });
    
    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
      average: sum / scores.length,
      median: sortedScores[Math.floor(sortedScores.length / 2)],
      distribution: Array.from(buckets.entries())
        .map(([score, count]) => ({ score, count }))
        .sort((a, b) => a.score - b.score)
    };
  }
  
  /**
   * Get lock summary
   */
  private getLockSummary(state: any, now: number): LockSummary[] {
    return Object.entries(state.locks).map(([userId, reason]) => ({
      userId,
      reason: reason as string,
      duration: state.lastActivity[userId] 
        ? now - (state.lastActivity[userId] as number)
        : 0
    }));
  }
  
  /**
   * Get system health
   */
  private getSystemHealth(state: any): SystemHealth {
    const issues: string[] = [];
    let queueHealth: SystemHealth['queueHealth'] = 'healthy';
    let pairHealth: SystemHealth['pairHealth'] = 'healthy';
    let timerHealth: SystemHealth['timerHealth'] = 'healthy';
    
    // Check queue health
    const queueSize = state.queue.length;
    if (queueSize > 50) {
      queueHealth = 'critical';
      issues.push(`Queue size critical: ${queueSize} users waiting`);
    } else if (queueSize > 20) {
      queueHealth = 'warning';
      issues.push(`Queue size high: ${queueSize} users waiting`);
    }
    
    // Check for stuck users
    const now = Date.now();
    state.queue.forEach((entry: any) => {
      const waitTime = now - new Date(entry.joinedAt).getTime();
      if (waitTime > 300000) { // 5 minutes
        issues.push(`User ${entry.userId || entry.id} waiting for ${Math.round(waitTime / 1000)}s`);
      }
    });
    
    // Check pair health
    const activePairs = Object.values(state.pairs).filter((p: any) => p.status !== 'ended');
    if (activePairs.length === 0 && queueSize > 1) {
      pairHealth = 'warning';
      issues.push('No active pairs despite queue having multiple users');
    }
    
    // Check validation
    const lastValidation = getLastValidation();
    if (lastValidation && !lastValidation.isValid) {
      issues.push(`${lastValidation.errors.length} validation errors`);
      if (lastValidation.errors.some(e => e.severity === 'critical')) {
        pairHealth = 'critical';
      }
    }
    
    // Check timer health
    const expiredTimers = state.timers.filter((t: any) => {
      return new Date(t.expiresAt).getTime() < now;
    });
    if (expiredTimers.length > 0) {
      timerHealth = 'warning';
      issues.push(`${expiredTimers.length} expired timers not cleaned up`);
    }
    
    // Determine overall health
    let overallHealth: SystemHealth['overallHealth'] = 'healthy';
    if (queueHealth === 'critical' || pairHealth === 'critical' || timerHealth === 'critical') {
      overallHealth = 'critical';
    } else if (queueHealth === 'warning' || pairHealth === 'warning' || timerHealth === 'warning') {
      overallHealth = 'warning';
    }
    
    return {
      queueHealth,
      pairHealth,
      timerHealth,
      overallHealth,
      issues
    };
  }
  
  /**
   * Get system statistics
   */
  private getSystemStats(state: any): SystemStats {
    const logs = getLogs(100);
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    // Calculate match rate
    const recentMatches = logs.filter(log => 
      log.type === 'match_created' && 
      log.timestampMs > fiveMinutesAgo
    ).length;
    
    const recentSpins = logs.filter(log => 
      (log.type === 'spin' || log.type === 'spinStart') && 
      log.timestampMs > fiveMinutesAgo
    ).length;
    
    const matchRate = recentSpins > 0 ? (recentMatches * 2) / recentSpins : 0;
    
    // Calculate error rate
    const recentErrors = logs.filter(log => 
      log.level === 'error' && 
      log.timestampMs > fiveMinutesAgo
    ).length;
    
    const recentEvents = logs.filter(log => 
      log.timestampMs > fiveMinutesAgo
    ).length;
    
    const errorRate = recentEvents > 0 ? recentErrors / recentEvents : 0;
    
    // Calculate average wait time
    let totalWaitTime = 0;
    let waitCount = 0;
    
    state.queue.forEach((entry: any) => {
      const waitTime = now - new Date(entry.joinedAt).getTime();
      totalWaitTime += waitTime;
      waitCount++;
    });
    
    const averageWaitTime = waitCount > 0 ? totalWaitTime / waitCount : 0;
    
    // Count users
    const allUsers = new Set<string>();
    state.queue.forEach((e: any) => allUsers.add(e.userId || e.id));
    Object.values(state.pairs).forEach((p: any) => {
      allUsers.add(p.user1);
      allUsers.add(p.user2);
    });
    
    const pairedUsers = new Set<string>();
    Object.values(state.pairs).forEach((p: any) => {
      if (p.status !== 'ended') {
        pairedUsers.add(p.user1);
        pairedUsers.add(p.user2);
      }
    });
    
    return {
      totalUsers: allUsers.size,
      queuedUsers: state.queue.length,
      pairedUsers: pairedUsers.size,
      activeTimers: getActiveTimers().length,
      averageWaitTime,
      matchRate,
      errorRate
    };
  }
  
  /**
   * Get feed history
   */
  getFeedHistory(limit?: number): DebugFeedData[] {
    if (limit) {
      return this.feedHistory.slice(-limit);
    }
    return [...this.feedHistory];
  }
  
  /**
   * Get compact feed (minimal data)
   */
  getCompactFeed(): any {
    const feed = this.getDebugFeed();
    
    return {
      queue: feed.currentQueue.length,
      pairs: feed.currentPairs.length,
      timers: feed.activeTimers.length,
      health: feed.systemHealth.overallHealth,
      issues: feed.systemHealth.issues.slice(0, 3),
      stats: {
        matchRate: Math.round(feed.stats.matchRate * 100),
        avgWait: Math.round(feed.stats.averageWaitTime / 1000),
        errorRate: Math.round(feed.stats.errorRate * 100)
      }
    };
  }
  
  /**
   * Get real-time updates (for streaming)
   */
  *streamUpdates(intervalMs: number = 1000): Generator<DebugFeedData> {
    while (true) {
      yield this.getDebugFeed();
      // In a real implementation, this would use proper async iteration
      // For now, it's a synchronous generator for demonstration
    }
  }
  
  /**
   * Export feed as JSON
   */
  exportFeed(): string {
    const feed = this.getDebugFeed();
    return JSON.stringify(feed, null, 2);
  }
  
  /**
   * Clear feed history
   */
  clearHistory() {
    this.feedHistory = [];
  }
}

// Export singleton instance
const dataFeeder = DebugDataFeeder.getInstance();

export const getDebugFeed = dataFeeder.getDebugFeed.bind(dataFeeder);
export const getFeedHistory = dataFeeder.getFeedHistory.bind(dataFeeder);
export const getCompactFeed = dataFeeder.getCompactFeed.bind(dataFeeder);
export const streamUpdates = dataFeeder.streamUpdates.bind(dataFeeder);
export const exportFeed = dataFeeder.exportFeed.bind(dataFeeder);
export const clearFeedHistory = dataFeeder.clearHistory.bind(dataFeeder);

export default dataFeeder;