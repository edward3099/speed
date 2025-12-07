/**
 * Test Endpoint Authentication Middleware
 * 
 * Secures test endpoints with API key authentication
 * In production, test endpoints require TEST_API_KEY header
 * In development, allows access without key
 */

import { NextRequest, NextResponse } from 'next/server'

export function requireTestApiKey(request: NextRequest): NextResponse | null {
  // In development, allow access without key
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  // In production, require API key
  const apiKey = request.headers.get('x-test-api-key') || 
                 request.headers.get('authorization')?.replace('Bearer ', '')

  const validApiKey = process.env.TEST_API_KEY

  if (!validApiKey) {
    // If no API key configured, deny access in production
    return NextResponse.json(
      { error: 'Test endpoints disabled - TEST_API_KEY not configured' },
      { status: 503 }
    )
  }

  if (!apiKey || apiKey !== validApiKey) {
    return NextResponse.json(
      { 
        error: 'Forbidden - Test API key required',
        hint: 'Include x-test-api-key header or Authorization: Bearer <key>'
      },
      { status: 403 }
    )
  }

  return null // Access granted
}

/**
 * Middleware wrapper for test endpoints
 */
export function withTestAuth(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const authResult = requireTestApiKey(request)
    if (authResult) {
      return authResult
    }

    return handler(request)
  }
}
