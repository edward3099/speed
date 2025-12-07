/**
 * TEST ENDPOINT: /api/test/queue-status
 * 
 * Returns current request queue status for monitoring
 * ONLY USE IN DEVELOPMENT/TESTING
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRequestQueue } from '@/lib/request-queue'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

export async function GET(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  try {
    const requestQueue = getRequestQueue()
    const status = requestQueue.getStatus()

    return NextResponse.json({
      success: true,
      queue: {
        size: status.queueSize,
        processing: status.processing,
        maxConcurrency: status.maxConcurrency,
        maxQueueSize: status.maxQueueSize,
        isFull: status.isFull,
        utilization: {
          queue: `${((status.queueSize / status.maxQueueSize) * 100).toFixed(1)}%`,
          concurrency: `${((status.processing / status.maxConcurrency) * 100).toFixed(1)}%`,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error in /api/test/queue-status:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
