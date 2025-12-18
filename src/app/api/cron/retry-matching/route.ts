/**
 * CRON ENDPOINT: /api/cron/retry-matching
 * 
 * Retries matching for waiting users (fallback for race conditions)
 * Should be called every 5-10 seconds by Vercel Cron or external scheduler
 * 
 * Purpose: Ensures waiting users eventually get matched even if initial
 * event-driven matching attempts fail due to simultaneous lock conflicts
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 5 seconds
 * Path: /api/cron/retry-matching
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

    // IMPROVED: Use new function to retry matching for stuck users (>30s waiting)
    // This handles users stuck due to race conditions or high load
    const { data: stuckUsersResult, error: stuckError } = await supabase
      .rpc('retry_matching_stuck_users')

    if (stuckError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error retrying stuck users:', stuckError)
      }
    }

    // Also retry regular waiting users with recent activity (standard retry)
    const { data: waitingUsers, error: queryError } = await supabase
      .from('users_state')
      .select('user_id')
      .eq('state', 'waiting')
      .gt('last_active', new Date(Date.now() - 30000).toISOString()) // Extended to 30s
      .limit(50) // Process max 50 users per run to prevent overload

    if (queryError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error querying waiting users:', queryError)
      }
      return NextResponse.json(
        {
          success: false,
          error: queryError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    // Retry matching for regular waiting users
    let regularMatchedCount = 0
    const errors: string[] = []

    for (const user of waitingUsers || []) {
      const { data: matchId, error: matchError } = await supabase.rpc('try_match_user', {
        p_user_id: user.user_id
      })

      if (matchError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`❌ Error retrying match for user ${user.user_id}:`, matchError)
        }
        errors.push(`${user.user_id}: ${matchError.message}`)
      } else if (matchId) {
        regularMatchedCount++
      }
    }

    // Combine results from stuck users and regular retries
    const stuckRetried = stuckUsersResult?.[0]?.retried_count || 0
    const stuckMatched = stuckUsersResult?.[0]?.matched_count || 0
    const totalRetried = stuckRetried + (waitingUsers?.length || 0)
    const totalMatched = stuckMatched + regularMatchedCount

    const result = {
      success: true,
      retriedCount: totalRetried,
      matchedCount: totalMatched,
      stuckUsersRetried: stuckRetried,
      stuckUsersMatched: stuckMatched,
      regularUsersRetried: waitingUsers?.length || 0,
      regularUsersMatched: regularMatchedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }

    // Only log if matches were created (reduce noise)
    if (totalMatched > 0 && process.env.NODE_ENV === 'development') {
      console.log(`✅ Retry matching: ${totalMatched} matches created (${stuckMatched} from stuck users, ${regularMatchedCount} from regular users)`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/retry-matching:', error)
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





























