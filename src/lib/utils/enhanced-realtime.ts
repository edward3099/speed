/**
 * Enhanced Real-time Subscription Helper
 * Based on Real-Time Chat with Supabase patterns
 * Uses RealtimeConnectionManager for better error handling
 */

import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { RealtimeConnectionManager, QueuedMessage } from './realtime-connection'

export interface RealtimeSubscriptionConfig {
  table: string
  filter?: string
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  onUpdate?: (payload: any) => void | Promise<void>
  onInsert?: (payload: any) => void | Promise<void>
  onDelete?: (payload: any) => void | Promise<void>
  onError?: (error: Error) => void
  onStatusChange?: (status: string) => void
}

export class EnhancedRealtimeSubscription {
  private channel: RealtimeChannel | null = null
  private connectionManager: RealtimeConnectionManager
  private supabase: SupabaseClient
  protected config: RealtimeSubscriptionConfig
  protected channelName: string
  private isMounted = true

  constructor(
    supabase: SupabaseClient,
    config: RealtimeSubscriptionConfig,
    channelName?: string
  ) {
    this.supabase = supabase
    this.config = config
    this.channelName = channelName || `realtime-${config.table}-${Date.now()}`
    this.connectionManager = new RealtimeConnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
    })
  }

  /**
   * Subscribe to real-time changes
   */
  async subscribe(): Promise<void> {
    if (!this.isMounted) return

    try {
      // Clean up existing channel
      if (this.channel) {
        await this.cleanup()
      }

      // Create new channel
      this.channel = this.supabase
        .channel(this.channelName, {
          config: {
            broadcast: { self: false },
          },
        })
        .on(
          'postgres_changes' as any,
          {
            event: this.config.event || '*',
            schema: 'public',
            table: this.config.table,
            filter: this.config.filter,
          } as any,
          async (payload: any) => {
            if (!this.isMounted) return

            try {
              // Handle based on event type
              if (payload.eventType === 'INSERT' && this.config.onInsert) {
                await this.config.onInsert(payload.new)
              } else if (payload.eventType === 'UPDATE' && this.config.onUpdate) {
                await this.config.onUpdate(payload.new)
              } else if (payload.eventType === 'DELETE' && this.config.onDelete) {
                await this.config.onDelete(payload.old)
              }

              // Reset reconnection attempts on successful message
              this.connectionManager.resetReconnectionAttempts()
            } catch (error) {
              console.error('❌ Error handling real-time update:', error)
              if (this.config.onError) {
                this.config.onError(error as Error)
              }
            }
          }
        )
        .subscribe((status, err) => {
          if (!this.isMounted) return

          if (this.config.onStatusChange) {
            this.config.onStatusChange(status)
          }

          if (status === 'SUBSCRIBED') {
            console.log(`✅ Real-time subscription active: ${this.channelName}`)
            this.connectionManager.resetReconnectionAttempts()
            
            // Flush any queued messages
            this.connectionManager.flushQueuedMessages(async (message) => {
              if (message.type === 'update' && this.config.onUpdate) {
                await this.config.onUpdate(message.payload)
              } else if (message.type === 'insert' && this.config.onInsert) {
                await this.config.onInsert(message.payload)
              } else if (message.type === 'delete' && this.config.onDelete) {
                await this.config.onDelete(message.payload)
              }
            })
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Only warn on actual errors, not normal CLOSED events during reconnection
            if (status === 'CHANNEL_ERROR') {
              console.warn(`⚠️ Real-time subscription error: ${this.channelName}`)
            } else if (status === 'TIMED_OUT') {
              console.warn(`⚠️ Real-time subscription timed out: ${this.channelName}`)
            } else if (status === 'CLOSED' && process.env.NODE_ENV === 'development') {
              // CLOSED is often expected during reconnection, only log in dev
              console.log(`🔄 Real-time subscription closed: ${this.channelName} (reconnecting...)`)
            }
            
            // Schedule reconnection for any error status
            if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
              this.connectionManager.scheduleReconnect(() => {
                if (this.isMounted) {
                  this.subscribe()
                }
              })
            }

            if (err && this.config.onError) {
              this.config.onError(new Error(`Subscription error: ${status}${err ? `: ${err.message}` : ''}`))
            }
          }
        })
    } catch (error) {
      console.error('❌ Failed to subscribe:', error)
      if (this.config.onError) {
        this.config.onError(error as Error)
      }
      
      // Schedule reconnection
      this.connectionManager.scheduleReconnect(() => {
        this.subscribe()
      })
    }
  }

  /**
   * Cleanup subscription
   */
  async cleanup(): Promise<void> {
    this.isMounted = false
    this.connectionManager.cleanup()

    if (this.channel) {
      try {
        await this.supabase.removeChannel(this.channel)
        this.channel = null
        console.log(`🧹 Cleaned up real-time subscription: ${this.channelName}`)
      } catch (error) {
        console.warn('⚠️ Error cleaning up channel:', error)
      }
    }
  }

  /**
   * Get connection state
   */
  getState() {
    return {
      ...this.connectionManager.getState(),
      channelName: this.channelName,
      hasChannel: this.channel !== null,
    }
  }
}

