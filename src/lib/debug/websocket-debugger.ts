/**
 * WebSocket Debugging Helper for Supabase Real-time
 * Helps debug WebSocket connections and messages
 */

import { RealtimeChannel } from '@supabase/supabase-js'

export interface WebSocketDebugInfo {
  channelName: string
  status: string
  subscribed: boolean
  messages: WebSocketMessage[]
  errors: WebSocketError[]
  connectionTime: number
  lastMessageTime?: number
}

export interface WebSocketMessage {
  timestamp: number
  type: string
  event: string
  payload: any
  direction: 'incoming' | 'outgoing'
}

export interface WebSocketError {
  timestamp: number
  message: string
  error: any
  context?: Record<string, any>
}

export class WebSocketDebugger {
  private messages: WebSocketMessage[] = []
  private errors: WebSocketError[] = []
  private maxMessages = 100
  private maxErrors = 50
  private connectionStartTime: number
  private lastMessageTime?: number
  private channelName: string

  constructor(channelName: string) {
    this.channelName = channelName
    this.connectionStartTime = Date.now()
  }

  /**
   * Log an incoming message
   */
  logMessage(
    type: string,
    event: string,
    payload: any,
    direction: 'incoming' | 'outgoing' = 'incoming'
  ) {
    const message: WebSocketMessage = {
      timestamp: Date.now(),
      type,
      event,
      payload: this.sanitizePayload(payload),
      direction,
    }

    this.messages.push(message)
    this.lastMessageTime = Date.now()

    // Trim old messages
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages)
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebSocket Debug] ${direction.toUpperCase()} ${type}:${event}`, {
        channel: this.channelName,
        payload: this.sanitizePayload(payload),
        timestamp: new Date(message.timestamp).toISOString(),
      })
    }
  }

  /**
   * Log an error
   */
  logError(message: string, error: any, context?: Record<string, any>) {
    const errorLog: WebSocketError = {
      timestamp: Date.now(),
      message,
      error: this.sanitizeError(error),
      context: context ? this.sanitizePayload(context) : undefined,
    }

    this.errors.push(errorLog)

    // Trim old errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors)
    }

    // Log to console
    console.error(`[WebSocket Debug] ERROR: ${message}`, {
      channel: this.channelName,
      error: this.sanitizeError(error),
      context,
      timestamp: new Date(errorLog.timestamp).toISOString(),
    })
  }

  /**
   * Get debug information
   */
  getDebugInfo(status: string, subscribed: boolean): WebSocketDebugInfo {
    return {
      channelName: this.channelName,
      status,
      subscribed,
      messages: [...this.messages],
      errors: [...this.errors],
      connectionTime: Date.now() - this.connectionStartTime,
      lastMessageTime: this.lastMessageTime,
    }
  }

  /**
   * Get message statistics
   */
  getStats() {
    const messageCounts = this.messages.reduce((acc, msg) => {
      acc[msg.event] = (acc[msg.event] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      totalMessages: this.messages.length,
      totalErrors: this.errors.length,
      messageCounts,
      connectionDuration: Date.now() - this.connectionStartTime,
      lastMessageTime: this.lastMessageTime,
      messagesPerSecond:
        this.lastMessageTime
          ? this.messages.length / ((this.lastMessageTime - this.connectionStartTime) / 1000)
          : 0,
    }
  }

  /**
   * Clear all logs
   */
  clear() {
    this.messages = []
    this.errors = []
    this.lastMessageTime = undefined
  }

  /**
   * Export logs as JSON
   */
  exportLogs() {
    return {
      channelName: this.channelName,
      connectionStartTime: this.connectionStartTime,
      messages: this.messages,
      errors: this.errors,
      stats: this.getStats(),
    }
  }

  /**
   * Sanitize payload to remove sensitive data
   */
  private sanitizePayload(payload: any): any {
    if (!payload) return payload

    try {
      const str = JSON.stringify(payload)
      // Remove potential sensitive fields
      const sanitized = str
        .replace(/"password":\s*"[^"]*"/gi, '"password": "[REDACTED]"')
        .replace(/"token":\s*"[^"]*"/gi, '"token": "[REDACTED]"')
        .replace(/"apiKey":\s*"[^"]*"/gi, '"apiKey": "[REDACTED]"')
        .replace(/"secret":\s*"[^"]*"/gi, '"secret": "[REDACTED]"')

      return JSON.parse(sanitized)
    } catch {
      return payload
    }
  }

  /**
   * Sanitize error object
   */
  private sanitizeError(error: any): any {
    if (!error) return error

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    return this.sanitizePayload(error)
  }
}

/**
 * Create a debugger wrapper for a Supabase channel
 */
export function createChannelDebugger(channelName: string) {
  const wsDebugger = new WebSocketDebugger(channelName)

  return {
    debugger: wsDebugger,
    wrapChannel: (channel: RealtimeChannel) => {
      // Log subscription status changes
      const originalSubscribe = channel.subscribe.bind(channel)
      channel.subscribe = function (callback) {
        return originalSubscribe((status, err) => {
          if (err) {
            wsDebugger.logError('Subscription error', err, { status })
          } else {
            wsDebugger.logMessage('subscription', 'status_change', { status }, 'outgoing')
          }
          if (callback) callback(status, err)
        })
      }

      return channel
    },
  }
}

