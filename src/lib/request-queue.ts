/**
 * Request Queue with Backpressure
 * 
 * Prevents system overload by queuing requests when server is busy
 * Returns 503 Service Unavailable when queue is full
 * 
 * Based on cascade thinking analysis: Primary issue at 900 users is
 * database connection pool exhaustion. Request queuing prevents
 * overwhelming the system.
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: any) => void
  timestamp: number
}

export class RequestQueue {
  private queue: QueuedRequest<any>[] = []
  private processing = 0
  private readonly maxConcurrency: number
  private readonly maxQueueSize: number
  private readonly timeout: number

  constructor(options: {
    maxConcurrency?: number
    maxQueueSize?: number
    timeout?: number
  } = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 50
    this.maxQueueSize = options.maxQueueSize ?? 1000
    this.timeout = options.timeout ?? 30000 // 30 seconds
  }

  /**
   * Add a request to the queue
   * Returns a promise that resolves when the request is processed
   * Throws error if queue is full
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Request queue is full. Service temporarily unavailable.')
    }

    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest<T> = {
        fn,
        resolve,
        reject,
        timestamp: Date.now(),
      }

      this.queue.push(queuedRequest)
      this.updateAdaptiveThrottle() // Update adaptive throttle metrics
      this.process()
    })
  }

  /**
   * Process the queue
   * Automatically called when requests are added
   * Processes multiple requests concurrently up to maxConcurrency
   */
  private async process() {
    // Process as many requests as possible up to maxConcurrency
    while (this.processing < this.maxConcurrency && this.queue.length > 0) {
      // Get next request from queue
      const request = this.queue.shift()
      if (!request) {
        break
      }

      // Check for timeout
      const waitTime = Date.now() - request.timestamp
      if (waitTime > this.timeout) {
        request.reject(new Error('Request timeout in queue'))
        continue // Process next request
      }

      this.processing++

      // Process request asynchronously (don't await - allows concurrent processing)
      Promise.resolve()
        .then(async () => {
          try {
            const result = await request.fn()
            request.resolve(result)
          } catch (error) {
            request.reject(error)
          } finally {
            this.processing--
            // Process next request immediately
            setImmediate(() => this.process())
          }
        })
        .catch((error) => {
          // Handle any errors in the promise chain
          request.reject(error)
          this.processing--
          setImmediate(() => this.process())
        })
    }
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
      isFull: this.queue.length >= this.maxQueueSize,
      utilization: (this.processing / this.maxConcurrency) * 100,
      queueUtilization: (this.queue.length / this.maxQueueSize) * 100,
    }
  }

  /**
   * Update adaptive throttle with queue metrics
   */
  updateAdaptiveThrottle() {
    try {
      const { getAdaptiveThrottle } = require('./adaptive-throttle')
      const adaptiveThrottle = getAdaptiveThrottle()
      adaptiveThrottle.updateQueueSize(this.queue.length)
    } catch (error) {
      // Silently fail if adaptive throttle not available
    }
  }

  /**
   * Clear the queue (useful for testing or graceful shutdown)
   */
  clear() {
    this.queue.forEach((req) => {
      req.reject(new Error('Queue cleared'))
    })
    this.queue = []
  }
}

// Singleton instance for application-wide use
let globalRequestQueue: RequestQueue | null = null

/**
 * Get the global request queue instance
 */
export function getRequestQueue(): RequestQueue {
  if (!globalRequestQueue) {
    globalRequestQueue = new RequestQueue({
      // Optimized for 1000s of users:
      // Database pool is 200, but we process more requests concurrently
      // and queue the rest. This allows handling thousands of users efficiently.
      // Higher concurrency = better throughput, but must balance with DB pool
      maxConcurrency: parseInt(process.env.REQUEST_QUEUE_CONCURRENCY || '800', 10), // Increased for thousands
      maxQueueSize: parseInt(process.env.REQUEST_QUEUE_MAX_SIZE || '50000', 10), // Large queue for thousands
      timeout: parseInt(process.env.REQUEST_QUEUE_TIMEOUT || '30000', 10),
    })
  }
  return globalRequestQueue
}

/**
 * Reset the global request queue (useful for testing)
 */
export function resetRequestQueue() {
  if (globalRequestQueue) {
    globalRequestQueue.clear()
  }
  globalRequestQueue = null
}
