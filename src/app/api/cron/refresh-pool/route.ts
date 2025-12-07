/**
 * CRON ENDPOINT: /api/cron/refresh-pool
 * 
 * Refreshes the matching_pool materialized view
 * Should be called every 1-2 seconds
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 2 seconds
 * Path: /api/cron/refresh-pool
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use pooled service client for better performance
    const supabase = getPooledServiceClient()

    // Refresh matching pool materialized view
    const { error } = await supabase.rpc('refresh_matching_pool')

    if (error) {
      // If view doesn't exist yet, that's okay (migration might not be applied)
      if (error.message?.includes('does not exist') || error.message?.includes('matching_pool')) {
        return NextResponse.json({
          success: false,
          message: 'Matching pool view not found. Apply migration first.',
          timestamp: new Date().toISOString(),
        })
      }

      console.error('❌ Error refreshing matching pool:', error)
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
      message: 'Matching pool refreshed',
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error('❌ Error in /api/cron/refresh-pool:', error)
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

export const POST = GET

