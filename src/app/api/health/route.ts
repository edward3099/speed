import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring
 * Based on trade-matching-engine patterns
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const health: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    timestamp: string
    checks: Record<string, any>
    responseTime: number
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
    responseTime: 0,
  }

  try {
    const supabase = await createClient()

    // 1. Database connection check
    try {
      const { error: dbError } = await supabase.from('users_state').select('user_id').limit(1)
      health.checks.database = {
        status: dbError ? 'unhealthy' : 'healthy',
        error: dbError?.message,
      }
      if (dbError) health.status = 'unhealthy'
    } catch (error: any) {
      health.checks.database = {
        status: 'unhealthy',
        error: error.message,
      }
      health.status = 'unhealthy'
    }

    // 2. Queue health check
    try {
      const { data: queueData, error: queueError } = await supabase
        .from('queue')
        .select('user_id')
        .limit(1)

      const { count: queueSize } = await supabase.from('queue').select('*', { count: 'exact', head: true })

      health.checks.queue = {
        status: queueError ? 'unhealthy' : 'healthy',
        size: queueSize || 0,
        error: queueError?.message,
      }
      if (queueError) health.status = 'degraded'
    } catch (error: any) {
      health.checks.queue = {
        status: 'unhealthy',
        error: error.message,
      }
      health.status = 'degraded'
    }

    // 3. Matching function check
    try {
      const { error: matchError } = await supabase.rpc('process_matching', {})
      // If function exists but is locked, that's actually good
      const isHealthy = !matchError || matchError.message.includes('locked')
      health.checks.matching = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        error: matchError?.message,
      }
      if (!isHealthy) health.status = 'degraded'
    } catch (error: any) {
      health.checks.matching = {
        status: 'unhealthy',
        error: error.message,
      }
      health.status = 'degraded'
    }

    // 4. Active users check
    try {
      const { count: activeUsers } = await supabase
        .from('users_state')
        .select('*', { count: 'exact', head: true })
        .gt('last_active', new Date(Date.now() - 30 * 1000).toISOString())

      health.checks.activeUsers = {
        status: 'healthy',
        count: activeUsers || 0,
      }
    } catch (error: any) {
      health.checks.activeUsers = {
        status: 'unhealthy',
        error: error.message,
      }
      health.status = 'degraded'
    }

    // 5. Recent matches check
    try {
      const { count: recentMatches } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

      health.checks.recentMatches = {
        status: 'healthy',
        count: recentMatches || 0,
      }
    } catch (error: any) {
      health.checks.recentMatches = {
        status: 'unhealthy',
        error: error.message,
      }
      health.status = 'degraded'
    }

    health.responseTime = Date.now() - startTime

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    return NextResponse.json(health, { status: statusCode })
  } catch (error: any) {
    health.status = 'unhealthy'
    health.checks.error = {
      status: 'unhealthy',
      error: error.message,
    }
    health.responseTime = Date.now() - startTime

    return NextResponse.json(health, { status: 503 })
  }
}

