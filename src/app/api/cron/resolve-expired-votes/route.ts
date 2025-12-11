/**
 * CRON ENDPOINT: /api/cron/resolve-expired-votes
 * 
 * Resolves expired vote windows (idle+idle case)
 * Should be called every 10 seconds by Vercel Cron or external scheduler
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 10 seconds
 * Path: /api/cron/resolve-expired-votes
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

    // Call resolve_expired_votes function
    const { data: resolvedCount, error } = await supabase.rpc('resolve_expired_votes')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error resolving expired votes:', error)
      }
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
      resolvedCount: resolvedCount || 0,
      timestamp: new Date().toISOString(),
    }

    // Only log if votes were resolved (reduce noise)
    if (resolvedCount && resolvedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`✅ Resolved ${resolvedCount} expired vote windows`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/resolve-expired-votes:', error)
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


