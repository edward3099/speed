/**
 * CRON ENDPOINT: /api/cron/handle-disconnects
 * 
 * Handles disconnected users (last_active > 10 seconds old)
 * Should be called every 10 seconds by Vercel Cron or external scheduler
 * 
 * Vercel Cron Config (vercel.json):
 * Schedule: every 10 seconds
 * Path: /api/cron/handle-disconnects
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

    // Find offline users (last_active > 10 seconds old, in waiting or matched state)
    const { data: offlineUsers, error: queryError } = await supabase
      .from('users_state')
      .select('user_id')
      .in('state', ['waiting', 'matched'])
      .lt('last_active', new Date(Date.now() - 10000).toISOString())

    if (queryError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Error querying offline users:', queryError)
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

    if (!offlineUsers || offlineUsers.length === 0) {
      return NextResponse.json({
        success: true,
        disconnectedCount: 0,
        timestamp: new Date().toISOString(),
      })
    }

    // Handle each disconnected user
    let disconnectedCount = 0
    const errors: string[] = []

    for (const user of offlineUsers) {
      const { error: disconnectError } = await supabase.rpc('handle_disconnect', {
        p_user_id: user.user_id
      })

      if (disconnectError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`❌ Error handling disconnect for user ${user.user_id}:`, disconnectError)
        }
        errors.push(`${user.user_id}: ${disconnectError.message}`)
      } else {
        disconnectedCount++
      }
    }

    const result = {
      success: true,
      disconnectedCount,
      totalOfflineUsers: offlineUsers.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }

    // Only log if users were disconnected (reduce noise)
    if (disconnectedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`✅ Handled ${disconnectedCount} disconnected users`)
    }

    return NextResponse.json(result)

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Error in /api/cron/handle-disconnects:', error)
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
