/**
 * Heartbeat Endpoint
 * 
 * Users call this endpoint periodically (every 5-10 seconds) while actively waiting
 * This is more reliable than relying on last_active from other API calls
 * 
 * Benefits:
 * - Explicit activity signal
 * - More reliable than inferring activity from other calls
 * - Better semantics: "I'm actively waiting" vs "I made an API call"
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { getRequestQueue } from '@/lib/request-queue'
import { getConnectionThrottle } from '@/lib/connection-throttle'

// Rate limiting: 100 requests per 10 seconds (heartbeat every 5-10s)
const RATE_LIMIT_OPTIONS = {
  windowMs: 10 * 1000,
  maxRequests: 100,
}

export async function POST(request: NextRequest) {
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
    // Process request through queue to prevent overwhelming database
    const result = await requestQueue.add(async () => {
      const body = await request.json()
      const { user_id } = body

      if (!user_id) {
        throw new Error('user_id is required')
      }

      const supabase = getPooledServiceClient()

      // Update heartbeat timestamp (more explicit than last_active)
      // This signals the user is actively online
      // Update for any state (waiting, matched) - user is online
      const { error } = await supabase
        .from('users_state')
        .update({ 
          last_active: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id)
        .in('state', ['waiting', 'matched']) // Update if user is waiting or matched

      if (error) {
        throw new Error(`Failed to update heartbeat: ${error.message}`)
      }

      return {
        success: true,
        message: 'Heartbeat received',
        timestamp: new Date().toISOString(),
      }
    })

    // Release connection throttle token
    connectionThrottle.release()

    return NextResponse.json(result)

  } catch (queueError: any) {
    // Release connection throttle token on error
    connectionThrottle.release()
    
    // Handle queue errors
    if (queueError.message?.includes('queue is full') || queueError.message?.includes('timeout')) {
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: queueError.message,
        },
        {
          status: 503,
          headers: {
            'Retry-After': '2',
          },
        }
      )
    }

    // Handle validation errors
    if (queueError.message?.includes('user_id is required')) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Handle database errors
    if (queueError.message?.includes('Failed to update heartbeat')) {
      return NextResponse.json(
        {
          error: 'Failed to update heartbeat',
          details: queueError.message,
        },
        { status: 500 }
      )
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'Invalid request',
        details: queueError.message,
      },
      { status: 400 }
    )
  }
}
