/**
 * Manual matching endpoint
 * Useful for testing and development when cron isn't running
 * POST /api/match/process - Manually trigger matching
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'

export async function POST(request: NextRequest) {
  try {
    const supabase = getPooledServiceClient()

    // Refresh matching pool first
    try {
      await supabase.rpc('refresh_matching_pool')
    } catch (refreshError) {
      console.warn('⚠️ Failed to refresh matching pool:', refreshError)
    }

    // Call process_matching function
    const { data: matchesCreated, error } = await supabase.rpc('process_matching')

    if (error) {
      console.error('❌ Error in process matching:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      matchesCreated: matchesCreated || 0,
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error('❌ Error in /api/match/process:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request)
}
