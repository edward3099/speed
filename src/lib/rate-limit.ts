/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */

interface RateLimitStore {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitStore>()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  identifier?: string // Custom identifier (defaults to IP)
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  retryAfter?: number // Seconds until reset
}

/**
 * Check if request should be rate limited
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const { windowMs, maxRequests } = options
  const now = Date.now()
  const key = `${identifier}:${Math.floor(now / windowMs)}`

  const current = store.get(key) || { count: 0, resetTime: now + windowMs }

  if (current.resetTime < now) {
    // Window expired, reset
    current.count = 0
    current.resetTime = now + windowMs
  }

  current.count++

  if (current.count > maxRequests) {
    store.set(key, current)
    const retryAfter = Math.ceil((current.resetTime - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      resetTime: current.resetTime,
      retryAfter,
    }
  }

  store.set(key, current)
  return {
    allowed: true,
    remaining: maxRequests - current.count,
    resetTime: current.resetTime,
  }
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
  // Try various headers (for proxies/load balancers)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Fallback (won't work in serverless, but useful for local dev)
  return 'unknown'
}

/**
 * Rate limit middleware helper
 */
export function rateLimitMiddleware(
  request: Request,
  options: RateLimitOptions
): RateLimitResult | null {
  const identifier = options.identifier || getClientIP(request)
  return checkRateLimit(identifier, options)
}
