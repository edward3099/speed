/**
 * Enhanced Real-time Connection Utility
 * Based on gowscl patterns: exponential backoff, message queuing, heartbeat
 */

export interface QueuedMessage {
  id: string
  timestamp: number
  type: 'update' | 'insert' | 'delete'
  payload: any
}

export interface ReconnectionConfig {
  initialDelay?: number
  maxDelay?: number
  maxAttempts?: number
  reconnectFactor?: number
  reconnectJitter?: number
  minReconnectInterval?: number
}

const DEFAULT_CONFIG: Required<ReconnectionConfig> = {
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  maxAttempts: 10,
  reconnectFactor: 2.0,
  reconnectJitter: 0.5, // 50% jitter
  minReconnectInterval: 2000, // 2 seconds
}

export class RealtimeConnectionManager {
  private messageQueue: QueuedMessage[] = []
  private reconnectAttempts = 0
  private lastReconnectTime = 0
  private reconnectTimeout: NodeJS.Timeout | null = null
  private isMounted = true
  private config: Required<ReconnectionConfig>
  private maxQueueSize = 100

  constructor(config: ReconnectionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Calculate exponential backoff delay with jitter
   * Based on gowscl algorithm
   */
  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.initialDelay * Math.pow(this.config.reconnectFactor, attempt - 1)
    const cappedDelay = Math.min(baseDelay, this.config.maxDelay)
    const jitter = cappedDelay * this.config.reconnectJitter * Math.random()
    return Math.floor(cappedDelay + jitter)
  }

  /**
   * Queue a message during disconnection
   */
  queueMessage(type: QueuedMessage['type'], payload: any): boolean {
    if (this.messageQueue.length >= this.maxQueueSize) {
      console.warn('⚠️ Message queue full, dropping oldest message')
      this.messageQueue.shift() // Remove oldest
    }

    const message: QueuedMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      payload,
    }

    this.messageQueue.push(message)
    console.log(`📦 Queued message (${this.messageQueue.length}/${this.maxQueueSize}):`, type)
    return true
  }

  /**
   * Flush queued messages (call after reconnection)
   */
  flushQueuedMessages(handler: (message: QueuedMessage) => void | Promise<void>): void {
    if (this.messageQueue.length === 0) return

    console.log(`📤 Flushing ${this.messageQueue.length} queued messages...`)
    const messages = [...this.messageQueue]
    this.messageQueue = []

    // Process messages in order
    messages.forEach(async (message) => {
      try {
        await handler(message)
        console.log(`✅ Processed queued message:`, message.type)
      } catch (error) {
        console.error(`❌ Failed to process queued message:`, error)
        // Re-queue failed messages (optional)
        // this.messageQueue.push(message)
      }
    })
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect(reconnectFn: () => void | Promise<void>): void {
    if (!this.isMounted || this.reconnectTimeout) return

    // Debounce: Don't reconnect too frequently
    const now = Date.now()
    if (now - this.lastReconnectTime < this.config.minReconnectInterval) {
      return
    }

    if (this.reconnectAttempts >= this.config.maxAttempts) {
      console.error(`❌ Max reconnection attempts (${this.config.maxAttempts}) reached`)
      return
    }

    this.reconnectAttempts++
    this.lastReconnectTime = now
    const delay = this.calculateBackoffDelay(this.reconnectAttempts)

    console.log(
      `🔄 Scheduling reconnect (attempt ${this.reconnectAttempts}/${this.config.maxAttempts}) in ${delay}ms...`
    )

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      if (this.isMounted) {
        reconnectFn()
      }
    }, delay)
  }

  /**
   * Reset reconnection attempts (call on successful connection)
   */
  resetReconnectionAttempts(): void {
    this.reconnectAttempts = 0
    this.lastReconnectTime = 0
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  /**
   * Get current connection state
   */
  getState() {
    return {
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      isMounted: this.isMounted,
      hasPendingReconnect: this.reconnectTimeout !== null,
    }
  }

  /**
   * Cleanup (call on unmount)
   */
  cleanup(): void {
    this.isMounted = false
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    this.messageQueue = []
  }
}

