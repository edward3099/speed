/**
 * Adaptive Connection Throttle
 * 
 * Dynamically adjusts connection limits based on system load
 * Designed to handle 1000s of concurrent users efficiently
 * 
 * Features:
 * - Load-based adaptive throttling
 * - System resource monitoring
 * - Automatic scaling up/down based on performance
 * - Prevents system overload while maximizing throughput
 */

import os from 'os'

interface AdaptiveThrottleOptions {
  baseMaxConcurrent?: number
  minConcurrent?: number
  maxConcurrent?: number
  refillRate?: number
  bucketSize?: number
  loadCheckInterval?: number
}

interface SystemMetrics {
  cpuLoad: number
  memoryUsage: number
  activeConnections: number
  queueSize: number
}

export class AdaptiveThrottle {
  private tokens: number
  private lastRefill: number
  private currentMaxConcurrent: number
  private readonly baseMaxConcurrent: number
  private readonly minConcurrent: number
  private readonly absoluteMaxConcurrent: number
  private readonly refillRate: number
  private readonly bucketSize: number
  private activeConnections = 0
  private loadCheckInterval: NodeJS.Timeout | null = null
  private systemMetrics: SystemMetrics = {
    cpuLoad: 0,
    memoryUsage: 0,
    activeConnections: 0,
    queueSize: 0,
  }

  constructor(options: AdaptiveThrottleOptions = {}) {
    // Base limits - can scale up to absolute max
    this.baseMaxConcurrent = options.baseMaxConcurrent ?? 2000
    this.minConcurrent = options.minConcurrent ?? 500 // Never go below this
    this.absoluteMaxConcurrent = options.maxConcurrent ?? 10000 // Hard limit for 1000s of users
    this.currentMaxConcurrent = this.baseMaxConcurrent
    
    this.refillRate = options.refillRate ?? 500 // Higher refill for thousands of users
    this.bucketSize = options.bucketSize ?? 5000 // Large bucket for burst traffic
    
    this.tokens = this.bucketSize
    this.lastRefill = Date.now()

    // Start adaptive monitoring
    this.startAdaptiveMonitoring(options.loadCheckInterval ?? 5000)
  }

  /**
   * Monitor system load and adjust limits dynamically
   */
  private startAdaptiveMonitoring(intervalMs: number) {
    this.loadCheckInterval = setInterval(() => {
      this.updateSystemMetrics()
      this.adjustLimits()
    }, intervalMs)
  }

  /**
   * Update system metrics
   */
  private updateSystemMetrics() {
    const cpus = os.cpus()
    const loadAvg = os.loadavg()[0] // 1-minute load average
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const memUsage = ((totalMem - freeMem) / totalMem) * 100

    this.systemMetrics = {
      cpuLoad: loadAvg,
      memoryUsage: memUsage,
      activeConnections: this.activeConnections,
      queueSize: 0, // Will be updated by request queue
    }
  }

  /**
   * Adjust connection limits based on system load
   */
  private adjustLimits() {
    const { cpuLoad, memoryUsage, activeConnections } = this.systemMetrics
    
    // Calculate utilization
    const cpuUtilization = (cpuLoad / os.cpus().length) * 100
    const connectionUtilization = (activeConnections / this.currentMaxConcurrent) * 100

    // Scale down if system is under stress
    if (cpuUtilization > 80 || memoryUsage > 85) {
      // Reduce by 20% but never below minimum
      this.currentMaxConcurrent = Math.max(
        this.minConcurrent,
        Math.floor(this.currentMaxConcurrent * 0.8)
      )
    }
    // Scale up if system has capacity and connections are high
    else if (cpuUtilization < 50 && memoryUsage < 70 && connectionUtilization > 80) {
      // Increase by 25% but never above absolute max
      this.currentMaxConcurrent = Math.min(
        this.absoluteMaxConcurrent,
        Math.floor(this.currentMaxConcurrent * 1.25)
      )
    }
    // Reset to base if system is healthy and connections are low
    else if (cpuUtilization < 40 && memoryUsage < 60 && connectionUtilization < 50) {
      this.currentMaxConcurrent = this.baseMaxConcurrent
    }
  }

  /**
   * Try to acquire a connection token
   */
  tryAcquire(): boolean {
    // Refill tokens based on time passed
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    const tokensToAdd = timePassed * this.refillRate
    this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd)
    this.lastRefill = now

    // Check if we can allow the connection
    if (this.activeConnections >= this.currentMaxConcurrent) {
      return false
    }

    if (this.tokens < 1) {
      return false
    }

    // Acquire token
    this.tokens--
    this.activeConnections++
    return true
  }

  /**
   * Release a connection token
   */
  release(): void {
    if (this.activeConnections > 0) {
      this.activeConnections--
    }
  }

  /**
   * Update queue size (called by request queue)
   */
  updateQueueSize(queueSize: number) {
    this.systemMetrics.queueSize = queueSize
  }

  /**
   * Get current throttle status
   */
  getStatus() {
    return {
      tokens: this.tokens,
      activeConnections: this.activeConnections,
      currentMaxConcurrent: this.currentMaxConcurrent,
      baseMaxConcurrent: this.baseMaxConcurrent,
      absoluteMaxConcurrent: this.absoluteMaxConcurrent,
      bucketSize: this.bucketSize,
      utilization: (this.activeConnections / this.currentMaxConcurrent) * 100,
      systemMetrics: { ...this.systemMetrics },
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.loadCheckInterval) {
      clearInterval(this.loadCheckInterval)
      this.loadCheckInterval = null
    }
  }
}

// Singleton instance
let globalAdaptiveThrottle: AdaptiveThrottle | null = null

/**
 * Get the global adaptive throttle instance
 */
export function getAdaptiveThrottle(): AdaptiveThrottle {
  if (!globalAdaptiveThrottle) {
    globalAdaptiveThrottle = new AdaptiveThrottle({
      baseMaxConcurrent: parseInt(process.env.ADAPTIVE_BASE_CONCURRENT || '2000', 10),
      minConcurrent: parseInt(process.env.ADAPTIVE_MIN_CONCURRENT || '500', 10),
      maxConcurrent: parseInt(process.env.ADAPTIVE_MAX_CONCURRENT || '10000', 10),
      refillRate: parseInt(process.env.ADAPTIVE_REFILL_RATE || '500', 10),
      bucketSize: parseInt(process.env.ADAPTIVE_BUCKET_SIZE || '5000', 10),
      loadCheckInterval: parseInt(process.env.ADAPTIVE_LOAD_CHECK_INTERVAL || '5000', 10),
    })
  }
  return globalAdaptiveThrottle
}

/**
 * Reset the adaptive throttle
 */
export function resetAdaptiveThrottle() {
  if (globalAdaptiveThrottle) {
    globalAdaptiveThrottle.destroy()
  }
  globalAdaptiveThrottle = null
}


