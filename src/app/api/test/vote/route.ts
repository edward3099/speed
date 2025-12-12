/**
 * TEST ENDPOINT: /api/test/vote
 * 
 * Bypasses authentication for k6 load testing
 * ONLY USE IN DEVELOPMENT/TESTING
 * 
 * Optimizations:
 * - Rate limiting
 * - Retry logic
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { retry } from '@/lib/retry'
import { getRequestQueue } from '@/lib/request-queue'
import { getCache } from '@/lib/cache'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

// Rate limiting: 300 requests per 10 seconds per IP (increased for 500+ users)
const RATE_LIMIT_OPTIONS = {
  windowMs: 10 * 1000,
  maxRequests: 300,
}

export async function POST(request: NextRequest) {
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

  // Request queuing with backpressure
  const requestQueue = getRequestQueue()
  const queueStatus = requestQueue.getStatus()
  
  if (queueStatus.isFull) {
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
    const body = await request.json()
    const { user_id, match_id, vote } = body

    if (!user_id || !match_id || !vote) {
      return NextResponse.json(
        { error: 'user_id, match_id, and vote are required' },
        { status: 400 }
      )
    }

    if (!['yes', 'pass'].includes(vote)) {
      return NextResponse.json(
        { error: 'vote must be "yes" or "pass"' },
        { status: 400 }
      )
    }

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

    // Process request through queue
    try {
      const result = await requestQueue.add(async () => {
        // Record vote with retry logic and timeout handling
        const result = await Promise.race([
          retry(
            async () => {
              // Use new record_vote function (Zero Issues Architecture)
              const result = await supabase.rpc('record_vote', {
                p_user_id: user_id,
                p_match_id: match_id,
                p_vote: vote
              })
              if (result.error) {
                throw result.error
              }
              return result
            },
            {
              maxAttempts: 3,
              initialDelayMs: 100,
              retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'AbortError'],
            }
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 7 seconds')), 7000)
          )
        ]).catch((error) => ({ error, data: null })) as { data: any; error: any }
        
        const { data: voteData, error: voteError } = result

        if (voteError) {
          throw new Error(`Failed to record vote: ${voteError.message}`)
        }

        // Invalidate cache for both users (match status changed)
        const cache = getCache()
        if (voteData?.user1_id) {
          cache.delete(`match_status:${voteData.user1_id}`)
        }
        if (voteData?.user2_id) {
          cache.delete(`match_status:${voteData.user2_id}`)
        }
        // Also try to get user IDs from match_id if not in response
        if (!voteData?.user1_id && match_id) {
          // Invalidate cache for both potential users (will be refreshed on next poll)
          // This is a best-effort cache invalidation
          cache.delete(`match_status:${user_id}`)
        }

        return voteData || { success: true }
      })

      return NextResponse.json(result, {
        headers: {
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.resetTime),
          'X-Queue-Size': String(requestQueue.getStatus().queueSize),
        },
      })
    } catch (queueError: any) {
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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/test/vote:', {
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

