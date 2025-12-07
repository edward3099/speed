/**
 * TEST ENDPOINT: /api/test/monitoring
 * 
 * Performance monitoring endpoint for load testing
 * Returns system health and performance metrics
 * ONLY USE IN DEVELOPMENT/TESTING
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

export async function GET(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get queue metrics
    let queueCount = null
    try {
      const { count } = await supabase
        .from('queue')
        .select('*', { count: 'exact', head: true })
      queueCount = count
    } catch (e) {
      // Ignore errors
    }

    // Get active users
    let activeUsersCount = null
    try {
      const { count } = await supabase
        .from('users_state')
        .select('*', { count: 'exact', head: true })
        .eq('state', 'waiting')
      activeUsersCount = count
    } catch (e) {
      // Ignore errors
    }

    // Get recent matches (last hour)
    let recentMatchesCount = null
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
      recentMatchesCount = count
    } catch (e) {
      // Ignore errors
    }

    // Get total profiles
    let totalProfilesCount = null
    try {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
      totalProfilesCount = count
    } catch (e) {
      // Ignore errors
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      metrics: {
        queue: {
          usersWaiting: queueCount || 0,
        },
        users: {
          activeWaiting: activeUsersCount || 0,
          totalProfiles: totalProfilesCount || 0,
        },
        matches: {
          recentHour: recentMatchesCount || 0,
        },
      },
      system: {
        nodeEnv: process.env.NODE_ENV,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    })

  } catch (error: any) {
    console.error('Error in /api/test/monitoring:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
