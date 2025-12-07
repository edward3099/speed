/**
 * TEST ENDPOINT: /api/test/spin
 * 
 * Bypasses authentication for k6 load testing
 * ONLY USE IN DEVELOPMENT/TESTING
 * 
 * This endpoint allows k6 to test spin logic without authentication overhead
 * 
 * Optimizations:
 * - Rate limiting to prevent overload
 * - Retry logic for transient errors
 * - Connection pooling
 * - Error handling improvements
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { retry } from '@/lib/retry'
import { getRequestQueue } from '@/lib/request-queue'
import { getCache } from '@/lib/cache'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

// Only allow in development OR with API key in production
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

// Rate limiting: 500 requests per 10 seconds per IP (increased for 500+ users)
// Higher limit to reduce false rate limit hits during load testing
const RATE_LIMIT_OPTIONS = {
  windowMs: 10 * 1000, // 10 seconds
  maxRequests: 500,
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
        resetTime: rateLimitResult?.resetTime,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult?.retryAfter || 10),
          'X-RateLimit-Limit': String(RATE_LIMIT_OPTIONS.maxRequests),
          'X-RateLimit-Remaining': String(rateLimitResult?.remaining || 0),
          'X-RateLimit-Reset': String(rateLimitResult?.resetTime || Date.now()),
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
        queueSize: queueStatus.queueSize,
        processing: queueStatus.processing,
      },
      {
        status: 503,
        headers: {
          'Retry-After': '5',
          'X-Queue-Size': String(queueStatus.queueSize),
          'X-Queue-Processing': String(queueStatus.processing),
        },
      }
    )
  }

  try {
    // Parse request body first (before queuing)
    const body = await request.json()
    const { user_id, gender } = body

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Process request through queue
    try {
      const result = await requestQueue.add(async () => {

    // Use pooled service client for better performance, fallback to creating new client
    let supabase
    try {
      supabase = getPooledServiceClient()
    } catch (e) {
      // Fallback to creating new client if pooled client not available
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseServiceKey) {
        // Fallback to anon key if service key not available
        supabase = createClient(
          supabaseUrl,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
      } else {
        // Use service role for testing (bypasses RLS)
        supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        })
      }
    }

    // OPTIMIZED: Check cache first, then database
    // For load testing, users should be pre-created via /api/test/batch-setup
    const cache = getCache()
    const userCacheKey = `user_exists:${user_id}`
    let existingProfile = cache.get<{ id: string }>(userCacheKey)
    
    if (!existingProfile) {
      // Not in cache, check database
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .single()
      
      if (profileData) {
        existingProfile = profileData
        // Cache for 60 seconds (users don't change often)
        cache.set(userCacheKey, profileData, 60000)
      }
    }

    if (!existingProfile) {
      // Only create if it's a small number of users (fallback for small tests)
      // For large load tests, users should be pre-created
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
      
      if (!authUser) {
        // Create auth user (only for small tests)
        const { error: createUserError } = await supabase.auth.admin.createUser({
          id: user_id,
          email: `k6-test-${user_id}@test.com`,
          password: 'test-password-123',
          email_confirm: true,
        })

        if (createUserError) {
          // If creation fails, return error (don't retry in load tests)
          return NextResponse.json(
            { error: 'User not found. Pre-create users via /api/test/batch-setup', details: createUserError.message },
            { status: 404 }
          )
        }
      }

      // Create test profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: user_id,
          name: `Test User ${user_id.substring(0, 8)}`,
          age: 25 + Math.floor(Math.random() * 15),
          bio: 'k6 test user',
          photo: '',
          gender: gender || (Math.random() < 0.714 ? 'male' : 'female'),
          onboarding_completed: true,
        })

      if (profileError) {
        return NextResponse.json(
          { error: 'User not found. Pre-create users via /api/test/batch-setup', details: profileError.message },
          { status: 404 }
        )
      }
    }

    // Call join_queue function with retry logic and timeout handling
    const result = await Promise.race([
      retry(
        async () => {
          const result = await supabase.rpc('join_queue', {
            p_user_id: user_id
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
    ]).catch((error) => ({ error })) as { data: any; error: any }

    const { error: joinError } = result

        if (joinError) {
          console.error('Error joining queue:', joinError)
          return NextResponse.json(
            { error: 'Failed to join queue', details: joinError.message },
            { status: 500 }
          )
        }

        // Invalidate cache (user status changed)
        cache.delete(`match_status:${user_id}`)

        return {
          success: true,
          message: 'Joined queue successfully',
          user_id: user_id
        }
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
            queueSize: requestQueue.getStatus().queueSize,
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
    console.error('Error in /api/test/spin:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

