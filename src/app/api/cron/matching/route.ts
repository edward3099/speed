/**
 * CRON ENDPOINT: /api/cron/matching
 * 
 * Continuous matching background job
 * Should be called every 1 second by Vercel Cron or external scheduler
 * (Optimized from 3s to 1s based on k6 load test analysis)
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 1 second
 * Path: /api/cron/matching
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPooledServiceClient } from '@/lib/supabase/pooled-client'

// Verify cron secret (if using Vercel Cron)
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

    // Refresh matching pool materialized view first (for faster queries)
    try {
      await supabase.rpc('refresh_matching_pool')
    } catch (refreshError) {
      // If refresh fails, continue anyway (view might not exist yet)
      console.warn('⚠️ Failed to refresh matching pool:', refreshError)
    }

    // Call process_matching function
    const { data: matchesCreated, error } = await supabase.rpc('process_matching')

    if (error) {
      console.error('❌ Error in continuous matching:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    const result = {
      success: true,
      matchesCreated: matchesCreated || 0,
      timestamp: new Date().toISOString(),
    }

    // Only log if matches were created (reduce noise)
    if (matchesCreated && matchesCreated > 0) {
      console.log(`✅ Continuous matching: ${matchesCreated} matches created`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('❌ Error in /api/cron/matching:', error)
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

// Also support POST for flexibility
export const POST = GET

