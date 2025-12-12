/**
 * TEST ENDPOINT: /api/test/match-status
 * 
 * Bypasses authentication for k6 load testing
 * ONLY USE IN DEVELOPMENT/TESTING
 * 
 * Optimizations:
 * - Rate limiting
 * - Retry logic
 * 
 * CRITICAL: This endpoint does NOT update last_active
 * Only the /api/heartbeat endpoint should update last_active
 * This ensures stale users (who don't send heartbeat) are properly excluded from matching
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { retry } from '@/lib/retry'
import { getRequestQueue } from '@/lib/request-queue'
import { getCache } from '@/lib/cache'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'
import { getConnectionThrottle } from '@/lib/connection-throttle'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

// Rate limiting: 1000 requests per 10 seconds per IP (higher for polling, 500+ users)
const RATE_LIMIT_OPTIONS = {
  windowMs: 10 * 1000,
  maxRequests: 1000,
}

export async function GET(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  // Rate limiting
  const rateLimitResult = rateLimitMiddleware(request, RATE_LIMIT_OPTIONS)
  if (!rateLimitResult?.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult?.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult?.retryAfter || 10),
        },
      }
    )
  }

  // Connection throttling - prevent too many concurrent connections
  const connectionThrottle = getConnectionThrottle()
  if (!connectionThrottle.tryAcquire()) {
    const throttleStatus = connectionThrottle.getStatus()
    return NextResponse.json(
      {
        error: 'Service temporarily unavailable',
        message: 'Too many concurrent connections. Please try again later.',
      },
      {
        status: 503,
        headers: {
          'Retry-After': '2',
        },
      }
    )
  }

  // Request queuing with backpressure
  const requestQueue = getRequestQueue()
  const queueStatus = requestQueue.getStatus()
  
  if (queueStatus.isFull) {
    connectionThrottle.release() // Release throttle token
    return NextResponse.json(
      {
        error: 'Service temporarily unavailable',
        message: 'Request queue is full. Please try again later.',
      },
      {
        status: 503,
        headers: {
          'Retry-After': '5',
        },
      }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const user_id = searchParams.get('user_id')

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Check cache first (reduce database load)
    const cache = getCache()
    const cacheKey = `match_status:${user_id}`
    const cachedResult = cache.get(cacheKey)
    
    if (cachedResult) {
      // Return cached result immediately (non-blocking)
      // CRITICAL: Do NOT update last_active here - only heartbeat endpoint should update it
      // This ensures stale users (who don't send heartbeat) are properly excluded from matching
      
      return NextResponse.json(cachedResult, {
        headers: {
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetTime),
          'X-Cache': 'HIT',
        },
      })
    }

    // Process request through queue
    try {
      const result = await requestQueue.add(async () => {
        // Use pooled service client for better performance
        let supabase
        try {
          supabase = getPooledServiceClient()
        } catch (e) {
          // Fallback to creating new client if pooled client not available
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

          supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          })
        }

        // Update last_active asynchronously (non-blocking)
        Promise.resolve(
          supabase
            .from('users_state')
            .update({ 
              last_active: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user_id)
        )
          .then(() => {})
          .catch(() => {}) // Silently handle errors

        // Get match status with retry logic and timeout handling
        const result = await Promise.race([
          retry(
            async () => {
              const result = await supabase.rpc('get_user_match_status', {
                p_user_id: user_id
              })
              if (result.error) {
                throw result.error
              }
              return result
            },
            {
              maxAttempts: 3,
              initialDelayMs: 50,
              retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'AbortError'],
            }
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 7 seconds')), 7000)
          )
        ]).catch((error) => ({ error, data: null })) as { data: any; error: any }
        
        const { data: statusData, error: statusError } = result

        if (statusError) {
          throw new Error(`Failed to get match status: ${statusError.message}`)
        }

        // Cache result for 5 seconds (reduce database load for polling)
        // Increased from 2s to 5s to better handle 500+ concurrent users
        cache.set(cacheKey, statusData, 5000)

        return statusData
      })

      // Release connection throttle token
      connectionThrottle.release()

      return NextResponse.json(result, {
        headers: {
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetTime),
          'X-Queue-Size': String(requestQueue.getStatus().queueSize),
        },
      })
    } catch (queueError: any) {
      // Release connection throttle token on error
      connectionThrottle.release()
      // Handle queue errors (full queue, timeout, etc.)
      if (queueError.message?.includes('queue is full')) {
        return NextResponse.json(
          {
            error: 'Service temporarily unavailable',
            message: 'Request queue is full. Please try again later.',
          },
          {
            status: 503,
            headers: {
              'Retry-After': '5',
            },
          }
        )
      }
      // Re-throw other errors to be caught by outer catch
      throw queueError
    }
  } catch (error: any) {
    // Ensure connection throttle is released on any error
    const connectionThrottle = getConnectionThrottle()
    connectionThrottle.release()
    
    // Only log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/test/match-status:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}

