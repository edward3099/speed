/**
 * CRON ENDPOINT: /api/cron/repair-stuck-matches
 * 
 * Automatically repairs stuck matches (matches without vote windows)
 * Should be called every 10 seconds by Vercel Cron or external scheduler
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 10 seconds
 * Path: /api/cron/repair-stuck-matches
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

    // Call repair function
    const { data: repairResult, error: repairError } = await supabase.rpc('repair_stuck_matches')

    if (repairError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error repairing stuck matches:', repairError)
      }
      return NextResponse.json(
        {
          success: false,
          error: repairError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    const result = {
      success: true,
      repairedCount: repairResult?.[0]?.repaired_count || 0,
      stuckMatchesFound: repairResult?.[0]?.stuck_matches_found || 0,
      timestamp: new Date().toISOString(),
    }

    // Only log if matches were repaired (reduce noise)
    if (result.repairedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`✅ Repaired ${result.repairedCount} stuck matches (found ${result.stuckMatchesFound} total)`)
    }

    // Alert if many stuck matches found (potential issue)
    if (result.stuckMatchesFound > 5 && process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ WARNING: Found ${result.stuckMatchesFound} stuck matches! This should not happen.`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/repair-stuck-matches:', error)
    }
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


