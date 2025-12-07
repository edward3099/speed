/**
 * TEST ENDPOINT: /api/test/db-stats
 * 
 * Returns database connection statistics for monitoring
 * ONLY USE IN DEVELOPMENT/TESTING
 */

import { NextRequest, NextResponse } from 'next/server'
import { getConnectionStats } from '@/lib/db-monitor'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

export async function GET(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  try {
    const stats = await getConnectionStats()

    if (!stats) {
      return NextResponse.json({
        success: false,
        error: 'Could not retrieve connection stats',
      })
    }

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        status: stats.connectionUtilization > 80 ? 'STRESSED' : 
                stats.connectionUtilization > 60 ? 'MODERATE' : 'HEALTHY',
      },
    })
  } catch (error: any) {
    console.error('Error in /api/test/db-stats:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
