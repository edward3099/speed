/**
 * CRON ENDPOINT: /api/cron/monitor-stuck-users
 * 
 * Monitors users stuck in waiting/spinning state
 * Should be called every 30-60 seconds by Vercel Cron or external scheduler
 * 
 * Purpose: Provides visibility into matching performance issues and state
 * synchronization problems. Can be used for alerting and debugging.
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 60 seconds
 * Path: /api/cron/monitor-stuck-users
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

    // Get monitoring metrics
    const { data: metrics, error: metricsError } = await supabase
      .rpc('monitor_stuck_users')

    if (metricsError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error monitoring stuck users:', metricsError)
      }
      return NextResponse.json(
        {
          success: false,
          error: metricsError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    const result = metrics?.[0] || {
      stuck_waiting_count: 0,
      stuck_spinning_count: 0,
      avg_waiting_time_seconds: 0,
      max_waiting_time_seconds: 0,
    }

    // Log warning if there are many stuck users (for alerting)
    if (result.stuck_waiting_count > 10) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `⚠️ High number of stuck users detected: ${result.stuck_waiting_count} waiting, ` +
          `${result.stuck_spinning_count} spinning. Avg wait: ${result.avg_waiting_time_seconds}s, ` +
          `Max wait: ${result.max_waiting_time_seconds}s`
        )
      }
    }

    return NextResponse.json({
      success: true,
      metrics: {
        stuckWaitingCount: result.stuck_waiting_count,
        stuckSpinningCount: result.stuck_spinning_count,
        avgWaitingTimeSeconds: result.avg_waiting_time_seconds,
        maxWaitingTimeSeconds: result.max_waiting_time_seconds,
      },
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/monitor-stuck-users:', error)
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















