/**
 * CRON ENDPOINT: /api/cron/update-fairness
 * 
 * Updates fairness scores for waiting users based on waiting time
 * Should be called every 10-20 seconds by Vercel Cron or external scheduler
 * 
 * Purpose: Ensures fairness scores are updated regularly so users who wait
 * longer get prioritized in matching
 * 
 * Fairness boosts:
 * - 20-60 seconds: fairness = 5
 * - 60-120 seconds: fairness = 10
 * - 120-300 seconds: fairness = 15
 * - 300+ seconds: fairness = 20 (capped)
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 10 seconds
 * Path: /api/cron/update-fairness
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

    // Call the fairness boost function
    const { data: boostedCount, error: fairnessError } = await supabase
      .rpc('auto_apply_fairness_boosts')

    if (fairnessError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error updating fairness scores:', fairnessError)
      }
      return NextResponse.json(
        {
          success: false,
          error: fairnessError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    const result = {
      success: true,
      boostedCount: boostedCount || 0,
      timestamp: new Date().toISOString(),
    }

    // Only log if users were boosted (reduce noise)
    if (boostedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`✅ Fairness update: ${boostedCount} users boosted`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/update-fairness:', error)
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
