/**
 * Pooled Supabase Client
 * 
 * Reuses Supabase client connections for better performance
 * Singleton pattern to avoid creating multiple clients
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let pooledClient: SupabaseClient | null = null
let pooledServiceClient: SupabaseClient | null = null

/**
 * Get pooled Supabase client (anon key)
 * Reuses existing client if available
 */
export function getPooledClient(): SupabaseClient {
  if (!pooledClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }

    pooledClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // Server-side, no session persistence
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-client-info': 'speed-date-pooled-client',
        },
        // Add timeout to prevent hanging requests
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout
          
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId))
        },
      },
    })
  }

  return pooledClient
}

/**
 * Get pooled Supabase service client (service role key)
 * Reuses existing client if available
 * Use for admin operations that bypass RLS
 */
export function getPooledServiceClient(): SupabaseClient {
  if (!pooledServiceClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase service role key')
    }

    pooledServiceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-client-info': 'speed-date-pooled-service-client',
        },
        // Add timeout to prevent hanging requests
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout
          
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId))
        },
      },
    })
  }

  return pooledServiceClient
}

/**
 * Reset pooled clients (useful for testing or reconnection)
 */
export function resetPooledClients() {
  pooledClient = null
  pooledServiceClient = null
}

