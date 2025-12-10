/**
 * Connection Throttle
 * 
 * Prevents overwhelming the server with too many concurrent connections
 * Implements token bucket algorithm for rate limiting connections
 */

interface ThrottleOptions {
  maxConcurrent?: number
  refillRate?: number // tokens per second
  bucketSize?: number
}

export class ConnectionThrottle {
  private tokens: number
  private lastRefill: number
  private readonly maxConcurrent: number
  private readonly refillRate: number
  private readonly bucketSize: number
  private activeConnections = 0

  constructor(options: ThrottleOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 200
    this.refillRate = options.refillRate ?? 100 // 100 tokens per second
    this.bucketSize = options.bucketSize ?? 500
    this.tokens = this.bucketSize
    this.lastRefill = Date.now()
  }

  /**
   * Try to acquire a connection token
   * Returns true if connection allowed, false if throttled
   */
  tryAcquire(): boolean {
    // Refill tokens based on time passed
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000 // seconds
    const tokensToAdd = timePassed * this.refillRate
    this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd)
    this.lastRefill = now

    // Check if we can allow the connection
    if (this.activeConnections >= this.maxConcurrent) {
      return false // Too many active connections
    }

    if (this.tokens < 1) {
      return false // No tokens available
    }

    // Acquire token and increment active connections
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
   * Get current throttle status
   */
  getStatus() {
    return {
      tokens: this.tokens,
      activeConnections: this.activeConnections,
      maxConcurrent: this.maxConcurrent,
      bucketSize: this.bucketSize,
      utilization: (this.activeConnections / this.maxConcurrent) * 100,
    }
  }
}

// Singleton instance
let globalConnectionThrottle: ConnectionThrottle | null = null

/**
 * Get the global connection throttle instance
 */
export function getConnectionThrottle(): ConnectionThrottle {
  // Use adaptive throttle if enabled, otherwise use static throttle
  const useAdaptive = process.env.USE_ADAPTIVE_THROTTLE === 'true'
  
  if (useAdaptive) {
    // Import and use adaptive throttle
    try {
      const { getAdaptiveThrottle } = require('./adaptive-throttle')
      return getAdaptiveThrottle() as any // Type compatibility
    } catch (error) {
      console.warn('Adaptive throttle not available, falling back to static throttle')
    }
  }

  if (!globalConnectionThrottle) {
    globalConnectionThrottle = new ConnectionThrottle({
      // Optimized for 1000s of users:
      // Each user makes: spin (1) + heartbeat (multiple) + match-status (multiple) = ~3-5 requests
      // 1000 users * 4 avg requests = 4000 concurrent connections needed
      // Using 5000 to provide headroom for bursts
      maxConcurrent: parseInt(process.env.MAX_CONCURRENT_CONNECTIONS || '5000', 10),
      refillRate: parseInt(process.env.CONNECTION_REFILL_RATE || '500', 10), // Higher refill for thousands
      bucketSize: parseInt(process.env.CONNECTION_BUCKET_SIZE || '10000', 10), // Large bucket for burst traffic
    })
  }
  return globalConnectionThrottle
}

/**
 * Reset the connection throttle (useful for testing)
 */
export function resetConnectionThrottle() {
  globalConnectionThrottle = null
}
