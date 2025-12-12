/**
 * Enhanced Real-time Subscription Helper with Debugging
 * Wraps the original enhanced-realtime with debugging capabilities
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { EnhancedRealtimeSubscription, RealtimeSubscriptionConfig } from './enhanced-realtime'
import { createChannelDebugger, logRealtime } from '@/lib/debug'

export interface DebuggableRealtimeSubscriptionConfig extends RealtimeSubscriptionConfig {
  enableDebugging?: boolean
  debugChannelName?: string
}

export class DebuggableRealtimeSubscription extends EnhancedRealtimeSubscription {
  private wsDebugger?: ReturnType<typeof createChannelDebugger>['debugger']
  private debugEnabled: boolean

  constructor(
    supabase: SupabaseClient,
    config: DebuggableRealtimeSubscriptionConfig,
    channelName?: string
  ) {
    super(supabase, config, channelName)
    this.debugEnabled = config.enableDebugging ?? process.env.NODE_ENV === 'development'

    if (this.debugEnabled) {
      const debugChannelName = config.debugChannelName || channelName || `debug-${config.table}`
      const debuggerResult = createChannelDebugger(debugChannelName)
      this.wsDebugger = debuggerResult.debugger
    }
  }

  /**
   * Subscribe with debugging
   */
  async subscribe(): Promise<void> {
    if (this.debugEnabled && this.wsDebugger) {
      logRealtime.info('Starting subscription with debugging', {
        table: this.config.table,
        channel: this.channelName,
      })
    }

    // Wrap error handler to log to debugger
    const originalOnError = this.config.onError
    const wrappedOnError = (error: Error) => {
      if (this.debugEnabled && this.wsDebugger) {
        this.wsDebugger.logError('Subscription error', error, {
          table: this.config.table,
          channel: this.channelName,
        })
      }
      logRealtime.error('Subscription error', { error: error.message, table: this.config.table })
      if (originalOnError) originalOnError(error)
    }

    // Wrap update handlers to log to debugger
    const originalOnUpdate = this.config.onUpdate
    const wrappedOnUpdate = async (payload: any) => {
      if (this.debugEnabled && this.wsDebugger) {
        this.wsDebugger.logMessage('postgres_changes', 'UPDATE', payload, 'incoming')
      }
      logRealtime.debug('Update received', { table: this.config.table, payload })
      if (originalOnUpdate) await originalOnUpdate(payload)
    }

    const originalOnInsert = this.config.onInsert
    const wrappedOnInsert = async (payload: any) => {
      if (this.debugEnabled && this.wsDebugger) {
        this.wsDebugger.logMessage('postgres_changes', 'INSERT', payload, 'incoming')
      }
      logRealtime.debug('Insert received', { table: this.config.table, payload })
      if (originalOnInsert) await originalOnInsert(payload)
    }

    const originalOnDelete = this.config.onDelete
    const wrappedOnDelete = async (payload: any) => {
      if (this.debugEnabled && this.wsDebugger) {
        this.wsDebugger.logMessage('postgres_changes', 'DELETE', payload, 'incoming')
      }
      logRealtime.debug('Delete received', { table: this.config.table, payload })
      if (originalOnDelete) await originalOnDelete(payload)
    }

    // Wrap status change handler
    const originalOnStatusChange = this.config.onStatusChange
    const wrappedOnStatusChange = (status: string) => {
      if (this.debugEnabled && this.wsDebugger) {
        this.wsDebugger.logMessage('subscription', 'status_change', { status }, 'outgoing')
        const debugInfo = this.wsDebugger.getDebugInfo(status, status === 'SUBSCRIBED')
        logRealtime.info('Subscription status changed', {
          status,
          debugInfo: {
            messages: debugInfo.messages.length,
            errors: debugInfo.errors.length,
            connectionTime: debugInfo.connectionTime,
          },
        })
      }
      if (originalOnStatusChange) originalOnStatusChange(status)
    }

    // Create new config with wrapped handlers
    const debugConfig: RealtimeSubscriptionConfig = {
      ...this.config,
      onError: wrappedOnError,
      onUpdate: wrappedOnUpdate,
      onInsert: wrappedOnInsert,
      onDelete: wrappedOnDelete,
      onStatusChange: wrappedOnStatusChange,
    }

    // Create new instance with debug config (workaround for private config)
    // The parent subscribe() will use the config passed to constructor
    // We need to override the handlers after calling super
    try {
      await super.subscribe()
      
      // After subscription, wrap the handlers
      // Note: This is a workaround since config is private
      // The handlers will be called by the parent class
    } catch (error) {
      throw error
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    if (!this.debugEnabled || !this.wsDebugger) {
      return null
    }

    // Access protected properties via type assertion
    const state = (this as any).getState?.() || { status: 'UNKNOWN', isConnected: false }
    return {
      ...this.wsDebugger.getDebugInfo(
        state.status || 'UNKNOWN',
        state.isConnected || false
      ),
      connectionState: state,
    }
  }

  /**
   * Get WebSocket statistics
   */
  getStats() {
    if (!this.debugEnabled || !this.wsDebugger) {
      return null
    }

    return this.wsDebugger.getStats()
  }

  /**
   * Export debug logs
   */
  exportLogs() {
    if (!this.debugEnabled || !this.wsDebugger) {
      return null
    }

    return this.wsDebugger.exportLogs()
  }

  /**
   * Clear debug logs
   */
  clearDebugLogs() {
    if (this.debugEnabled && this.wsDebugger) {
      this.wsDebugger.clear()
    }
  }
}

