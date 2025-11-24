/**
 * Module 7: Strict Timing Engine
 * Unified time management for all timers and synchronization
 */

import { engineState } from '../core/state';
import { logEvent, logError, logDebug } from '../core/logging';

export interface ManagedTimer {
  id: string;
  type: 'heartbeat' | 'vote' | 'respin' | 'disconnect' | 'video' | 'idle' | 'custom';
  callback: () => void | Promise<void>;
  interval?: number;
  timeout?: number;
  createdAt: number;
  expiresAt?: number;
  userId?: string;
  pairId?: string;
  metadata?: any;
  handle?: NodeJS.Timeout;
  status: 'active' | 'expired' | 'cancelled';
}

export interface TimeConfig {
  voteTimeout: number;
  videoTimeout: number;
  respinDelay: number;
  disconnectTimeout: number;
  heartbeatInterval: number;
  idleTimeout: number;
  defaultTimeout: number;
}

class TimeManager {
  private static instance: TimeManager;
  private timers: Map<string, ManagedTimer> = new Map();
  private currentTime: number = Date.now();
  private timeOffset: number = 0;
  private isPaused: boolean = false;
  private speedMultiplier: number = 1;
  
  private config: TimeConfig = {
    voteTimeout: 30000,        // 30 seconds
    videoTimeout: 180000,      // 3 minutes
    respinDelay: 2000,        // 2 seconds
    disconnectTimeout: 5000,   // 5 seconds
    heartbeatInterval: 10000,  // 10 seconds
    idleTimeout: 60000,       // 1 minute
    defaultTimeout: 30000     // 30 seconds default
  };
  
  private constructor() {
    // Start time sync
    this.startTimeSync();
  }
  
  static getInstance(): TimeManager {
    if (!TimeManager.instance) {
      TimeManager.instance = new TimeManager();
    }
    return TimeManager.instance;
  }
  
  /**
   * Get current synchronized time
   */
  getTime(): number {
    if (this.isPaused) {
      return this.currentTime;
    }
    return Date.now() + this.timeOffset;
  }
  
  /**
   * Get ISO timestamp
   */
  getTimestamp(): string {
    return new Date(this.getTime()).toISOString();
  }
  
  /**
   * Set time offset for testing
   */
  setTimeOffset(offset: number) {
    this.timeOffset = offset;
    logDebug({
      type: 'time_offset_changed',
      metadata: { offset, newTime: this.getTime() }
    });
  }
  
  /**
   * Pause time (for testing)
   */
  pauseTime() {
    this.isPaused = true;
    this.currentTime = this.getTime();
    
    // Pause all timers
    this.timers.forEach(timer => {
      if (timer.handle) {
        clearTimeout(timer.handle);
        clearInterval(timer.handle);
      }
    });
    
    logEvent({
      type: 'time_paused',
      metadata: { currentTime: this.currentTime }
    });
  }
  
  /**
   * Resume time
   */
  resumeTime() {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    const pauseDuration = this.getTime() - this.currentTime;
    
    // Resume all active timers
    this.timers.forEach(timer => {
      if (timer.status === 'active') {
        this.rescheduleTimer(timer, pauseDuration);
      }
    });
    
    logEvent({
      type: 'time_resumed',
      metadata: { pauseDuration }
    });
  }
  
  /**
   * Set time speed multiplier (for testing)
   */
  setSpeedMultiplier(multiplier: number) {
    this.speedMultiplier = multiplier;
    
    // Reschedule all timers with new speed
    this.timers.forEach(timer => {
      if (timer.status === 'active' && timer.handle) {
        clearTimeout(timer.handle);
        clearInterval(timer.handle);
        this.rescheduleTimer(timer, 0);
      }
    });
    
    logDebug({
      type: 'speed_multiplier_changed',
      metadata: { multiplier }
    });
  }
  
  /**
   * Create a timeout timer
   */
  setTimeout(
    callback: () => void | Promise<void>,
    delay: number,
    type: ManagedTimer['type'] = 'custom',
    metadata?: any
  ): string {
    const id = `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const adjustedDelay = delay / this.speedMultiplier;
    
    const timer: ManagedTimer = {
      id,
      type,
      callback,
      timeout: delay,
      createdAt: this.getTime(),
      expiresAt: this.getTime() + delay,
      metadata,
      status: 'active'
    };
    
    if (!this.isPaused) {
      timer.handle = setTimeout(async () => {
        await this.executeTimer(timer);
      }, adjustedDelay);
    }
    
    this.timers.set(id, timer);
    this.updateEngineState(timer);
    
    logDebug({
      type: 'timer_created',
      metadata: { id, type, delay, expiresAt: timer.expiresAt }
    });
    
    return id;
  }
  
  /**
   * Create an interval timer
   */
  setInterval(
    callback: () => void | Promise<void>,
    interval: number,
    type: ManagedTimer['type'] = 'custom',
    metadata?: any
  ): string {
    const id = `interval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const adjustedInterval = interval / this.speedMultiplier;
    
    const timer: ManagedTimer = {
      id,
      type,
      callback,
      interval,
      createdAt: this.getTime(),
      metadata,
      status: 'active'
    };
    
    if (!this.isPaused) {
      timer.handle = setInterval(async () => {
        await this.executeTimer(timer);
      }, adjustedInterval);
    }
    
    this.timers.set(id, timer);
    
    logDebug({
      type: 'interval_created',
      metadata: { id, type, interval }
    });
    
    return id;
  }
  
  /**
   * Clear a timer
   */
  clearTimer(id: string): boolean {
    const timer = this.timers.get(id);
    if (!timer) return false;
    
    if (timer.handle) {
      if (timer.interval) {
        clearInterval(timer.handle);
      } else {
        clearTimeout(timer.handle);
      }
    }
    
    timer.status = 'cancelled';
    this.timers.delete(id);
    this.removeFromEngineState(id);
    
    logDebug({
      type: 'timer_cleared',
      metadata: { id, type: timer.type }
    });
    
    return true;
  }
  
  /**
   * Execute timer callback
   */
  private async executeTimer(timer: ManagedTimer) {
    try {
      logDebug({
        type: 'timer_executing',
        metadata: { id: timer.id, type: timer.type }
      });
      
      await timer.callback();
      
      if (!timer.interval) {
        timer.status = 'expired';
        this.timers.delete(timer.id);
        this.removeFromEngineState(timer.id);
      }
      
    } catch (error) {
      logError({
        type: 'timer_execution_error',
        error,
        metadata: { timerId: timer.id, type: timer.type }
      });
    }
  }
  
  /**
   * Reschedule a timer after pause
   */
  private rescheduleTimer(timer: ManagedTimer, pauseDuration: number) {
    if (timer.interval) {
      // For intervals, just restart
      const adjustedInterval = timer.interval / this.speedMultiplier;
      timer.handle = setInterval(async () => {
        await this.executeTimer(timer);
      }, adjustedInterval);
    } else if (timer.timeout && timer.expiresAt) {
      // For timeouts, calculate remaining time
      const remaining = Math.max(0, timer.expiresAt - this.getTime());
      const adjustedRemaining = remaining / this.speedMultiplier;
      
      if (remaining > 0) {
        timer.handle = setTimeout(async () => {
          await this.executeTimer(timer);
        }, adjustedRemaining);
      } else {
        // Timer already expired during pause
        this.executeTimer(timer);
      }
    }
  }
  
  /**
   * Update engine state with timer
   */
  private updateEngineState(timer: ManagedTimer) {
    if (timer.type === 'vote' || timer.type === 'video' || timer.type === 'respin' || timer.type === 'disconnect') {
      engineState.timers.set(timer.id, {
        id: timer.id,
        type: timer.type,
        expiresAt: timer.expiresAt ? new Date(timer.expiresAt).toISOString() : '',
        userId: timer.userId,
        pairId: timer.pairId
      });
    }
  }
  
  /**
   * Remove timer from engine state
   */
  private removeFromEngineState(timerId: string) {
    engineState.timers.delete(timerId);
  }
  
  /**
   * Start time synchronization
   */
  private startTimeSync() {
    // Update current time regularly
    setInterval(() => {
      if (!this.isPaused) {
        this.currentTime = this.getTime();
        this.checkExpiredTimers();
      }
    }, 1000);
  }
  
  /**
   * Check for expired timers
   */
  private checkExpiredTimers() {
    const now = this.getTime();
    
    this.timers.forEach(timer => {
      if (timer.status === 'active' && timer.expiresAt && timer.expiresAt <= now) {
        if (!timer.handle) {
          // Timer expired while paused or not scheduled
          this.executeTimer(timer);
        }
      }
    });
  }
  
  /**
   * Set heartbeat timer for user
   */
  setHeartbeatTimer(userId: string): string {
    // Clear existing heartbeat timer
    this.clearHeartbeatTimer(userId);
    
    return this.setInterval(
      () => {
        engineState.heartbeat.set(userId, this.getTime());
        logDebug({
          type: 'heartbeat',
          user: userId,
          metadata: { timestamp: this.getTime() }
        });
      },
      this.config.heartbeatInterval,
      'heartbeat',
      { userId }
    );
  }
  
  /**
   * Clear heartbeat timer for user
   */
  clearHeartbeatTimer(userId: string): boolean {
    const timer = Array.from(this.timers.values()).find(
      t => t.type === 'heartbeat' && t.metadata?.userId === userId
    );
    
    if (timer) {
      return this.clearTimer(timer.id);
    }
    return false;
  }
  
  /**
   * Set vote timer for pair
   */
  setVoteTimer(pairId: string, callback: () => void): string {
    return this.setTimeout(
      callback,
      this.config.voteTimeout,
      'vote',
      { pairId }
    );
  }
  
  /**
   * Set video timer for pair
   */
  setVideoTimer(pairId: string, callback: () => void): string {
    return this.setTimeout(
      callback,
      this.config.videoTimeout,
      'video',
      { pairId }
    );
  }
  
  /**
   * Set respin timer
   */
  setRespinTimer(userId: string, callback: () => void): string {
    return this.setTimeout(
      callback,
      this.config.respinDelay,
      'respin',
      { userId }
    );
  }
  
  /**
   * Set disconnect timer
   */
  setDisconnectTimer(userId: string, callback: () => void): string {
    return this.setTimeout(
      callback,
      this.config.disconnectTimeout,
      'disconnect',
      { userId }
    );
  }
  
  /**
   * Set idle timer
   */
  setIdleTimer(userId: string, callback: () => void): string {
    return this.setTimeout(
      callback,
      this.config.idleTimeout,
      'idle',
      { userId }
    );
  }
  
  /**
   * Get all active timers
   */
  getActiveTimers(): ManagedTimer[] {
    return Array.from(this.timers.values()).filter(t => t.status === 'active');
  }
  
  /**
   * Get timers by type
   */
  getTimersByType(type: ManagedTimer['type']): ManagedTimer[] {
    return Array.from(this.timers.values()).filter(t => t.type === type);
  }
  
  /**
   * Get timer by ID
   */
  getTimer(id: string): ManagedTimer | undefined {
    return this.timers.get(id);
  }
  
  /**
   * Clear all timers
   */
  clearAllTimers() {
    this.timers.forEach(timer => {
      if (timer.handle) {
        if (timer.interval) {
          clearInterval(timer.handle);
        } else {
          clearTimeout(timer.handle);
        }
      }
    });
    
    this.timers.clear();
    engineState.timers.clear();
    
    logEvent({
      type: 'all_timers_cleared'
    });
  }
  
  /**
   * Get timing configuration
   */
  getConfig(): TimeConfig {
    return { ...this.config };
  }
  
  /**
   * Update timing configuration
   */
  updateConfig(updates: Partial<TimeConfig>) {
    this.config = { ...this.config, ...updates };
    
    logEvent({
      type: 'timing_config_updated',
      metadata: { config: this.config }
    });
  }
  
  /**
   * Get time manager status
   */
  getStatus() {
    return {
      currentTime: this.getTime(),
      timeOffset: this.timeOffset,
      isPaused: this.isPaused,
      speedMultiplier: this.speedMultiplier,
      activeTimers: this.getActiveTimers().length,
      totalTimers: this.timers.size,
      config: this.config
    };
  }
}

// Export singleton instance
const timeManager = TimeManager.getInstance();

export const getTime = timeManager.getTime.bind(timeManager);
export const getTimestamp = timeManager.getTimestamp.bind(timeManager);
export const setTimeOffset = timeManager.setTimeOffset.bind(timeManager);
export const pauseTime = timeManager.pauseTime.bind(timeManager);
export const resumeTime = timeManager.resumeTime.bind(timeManager);
export const setSpeedMultiplier = timeManager.setSpeedMultiplier.bind(timeManager);
export const setTimeout = timeManager.setTimeout.bind(timeManager);
export const setInterval = timeManager.setInterval.bind(timeManager);
export const clearTimer = timeManager.clearTimer.bind(timeManager);
export const setHeartbeatTimer = timeManager.setHeartbeatTimer.bind(timeManager);
export const clearHeartbeatTimer = timeManager.clearHeartbeatTimer.bind(timeManager);
export const setVoteTimer = timeManager.setVoteTimer.bind(timeManager);
export const setVideoTimer = timeManager.setVideoTimer.bind(timeManager);
export const setRespinTimer = timeManager.setRespinTimer.bind(timeManager);
export const setDisconnectTimer = timeManager.setDisconnectTimer.bind(timeManager);
export const setIdleTimer = timeManager.setIdleTimer.bind(timeManager);
export const getActiveTimers = timeManager.getActiveTimers.bind(timeManager);
export const getTimersByType = timeManager.getTimersByType.bind(timeManager);
export const getTimer = timeManager.getTimer.bind(timeManager);
export const clearAllTimers = timeManager.clearAllTimers.bind(timeManager);
export const getTimeConfig = timeManager.getConfig.bind(timeManager);
export const updateTimeConfig = timeManager.updateConfig.bind(timeManager);
export const getTimeStatus = timeManager.getStatus.bind(timeManager);

export default timeManager;