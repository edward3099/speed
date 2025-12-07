import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/health/detailed
 * 
 * Detailed health check with metrics
 * Based on trade-matching-engine monitoring patterns
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get detailed metrics
    const metrics: Record<string, any> = {}

    // 1. Queue metrics
    const { count: queueSize } = await supabase.from('queue').select('*', { count: 'exact', head: true })
    const { data: queueData } = await supabase
      .from('queue')
      .select('waiting_since, fairness')
      .order('waiting_since', { ascending: true })
      .limit(10)

    const longWaiters = queueData?.filter(
      (q) => new Date(q.waiting_since).getTime() < Date.now() - 60 * 1000
    ).length || 0

    metrics.queue = {
      size: queueSize || 0,
      longWaiters: longWaiters,
      averageFairness:
        queueData && queueData.length > 0
          ? queueData.reduce((sum, q) => sum + (q.fairness || 0), 0) / queueData.length
          : 0,
    }

    // 2. User state metrics
    const { count: waitingUsers } = await supabase
      .from('users_state')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'waiting')

    const { count: matchedUsers } = await supabase
      .from('users_state')
      .select('*', { count: 'exact', head: true })
      .in('state', ['paired', 'vote_window'])

    const { count: activeUsers } = await supabase
      .from('users_state')
      .select('*', { count: 'exact', head: true })
      .gt('last_active', new Date(Date.now() - 30 * 1000).toISOString())

    metrics.users = {
      waiting: waitingUsers || 0,
      matched: matchedUsers || 0,
      active: activeUsers || 0,
    }

    // 3. Match metrics
    const { count: totalMatches } = await supabase.from('matches').select('*', { count: 'exact', head: true })

    const { count: recentMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    const { count: bothYesMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'both_yes')
      .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    metrics.matches = {
      total: totalMatches || 0,
      recent: recentMatches || 0,
      bothYesLastHour: bothYesMatches || 0,
    }

    // 4. Video dates metrics
    const { count: activeVideoDates } = await supabase
      .from('video_dates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    const { count: countdownVideoDates } = await supabase
      .from('video_dates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'countdown')

    metrics.videoDates = {
      active: activeVideoDates || 0,
      countdown: countdownVideoDates || 0,
    }

    // 5. System health score
    let healthScore = 100
    if (longWaiters > 5) healthScore -= 10
    if (queueSize && queueSize > 20) healthScore -= 5
    if (recentMatches === 0 && waitingUsers && waitingUsers > 2) healthScore -= 15

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      healthScore: Math.max(0, healthScore),
      metrics,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      { status: 503 }
    )
  }
}

