/**
 * API Middleware Utilities
 * 
 * Provides reusable middleware functions for common API route patterns:
 * - Rate limiting
 * - Connection throttling
 * - Error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { getConnectionThrottle } from '@/lib/connection-throttle'
import { handleApiError } from '@/lib/api-error-handler'

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
}

interface MiddlewareResult {
  response?: NextResponse
  connectionThrottle?: ReturnType<typeof getConnectionThrottle>
}

/**
 * Applies rate limiting middleware
 * Returns NextResponse if rate limit exceeded, null otherwise
 */
export function applyRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): NextResponse | null {
  const rateLimitResult = rateLimitMiddleware(request, options)
  
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

  return null
}

/**
 * Applies connection throttling middleware
 * Returns middleware result with throttle instance if successful, or error response
 */
export function applyConnectionThrottle(
  request: NextRequest
): MiddlewareResult {
  const connectionThrottle = getConnectionThrottle()
  
  if (!connectionThrottle.tryAcquire()) {
    const throttleStatus = connectionThrottle.getStatus()
    return {
      response: NextResponse.json(
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
      ),
    }
  }

  return { connectionThrottle }
}

/**
 * Wraps an API handler with standardized error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  context?: { route?: string }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error: unknown) {
      const { status, response } = handleApiError(error, {
        route: context?.route,
      })
      return NextResponse.json(response, { status })
    }
  }) as T
}
