import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/feed
 * 
 * Returns debug feed data combining database state with debug information.
 * This provides a comprehensive view of the system state for debugging.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  
  try {
    const now = new Date().toISOString();
    
    // Get queue state
    const { data: queueData } = await supabase
      .from('matching_queue')
      .select('*')
      .order('joined_at', { ascending: true });
    
    // Get pending matches
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'pending')
      .order('matched_at', { ascending: false });
    
    // Get recent votes
    const { data: votesData } = await supabase
      .from('votes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    // Get recent errors from debug_event_log if it exists
    let errorsData: any[] = [];
    try {
      const { data } = await supabase
        .from('debug_event_log')
        .select('*')
        .eq('severity', 'ERROR')
        .order('timestamp', { ascending: false })
        .limit(10);
      errorsData = data || [];
    } catch (e) {
      // Table might not exist, ignore
    }
    
    // Get recent events
    let eventsData: any[] = [];
    try {
      const { data } = await supabase
        .from('debug_event_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);
      eventsData = data || [];
    } catch (e) {
      // Table might not exist, ignore
    }
    
    // Calculate queue summary
    const queueByStatus = {
      spin_active: queueData?.filter(q => q.status === 'spin_active').length || 0,
      queue_waiting: queueData?.filter(q => q.status === 'queue_waiting').length || 0,
      vote_active: queueData?.filter(q => q.status === 'vote_active').length || 0,
      idle: queueData?.filter(q => q.status === 'idle').length || 0,
    };
    
    // Calculate fairness distribution
    const fairnessScores = queueData?.map(q => q.fairness_score || 0) || [];
    const fairnessDistribution = {
      min: fairnessScores.length > 0 ? Math.min(...fairnessScores) : 0,
      max: fairnessScores.length > 0 ? Math.max(...fairnessScores) : 0,
      avg: fairnessScores.length > 0 
        ? fairnessScores.reduce((a, b) => a + b, 0) / fairnessScores.length 
        : 0,
      distribution: {
        low: fairnessScores.filter(s => s < 5).length,
        medium: fairnessScores.filter(s => s >= 5 && s < 15).length,
        high: fairnessScores.filter(s => s >= 15).length,
      }
    };
    
    // Get active timers (from matching_queue - users with timeouts)
    const activeTimers = queueData?.filter(q => {
      if (!q.updated_at) return false;
      const updated = new Date(q.updated_at).getTime();
      const nowTime = Date.now();
      // Consider active if updated within last 5 minutes
      return (nowTime - updated) < 5 * 60 * 1000;
    }).map(q => ({
      userId: q.user_id,
      status: q.status,
      lastUpdate: q.updated_at,
      waitTime: q.joined_at ? Math.floor((Date.now() - new Date(q.joined_at).getTime()) / 1000) : 0,
    })) || [];
    
    // Get heartbeat info (users active in last minute)
    const heartbeats = queueData?.filter(q => {
      if (!q.updated_at) return false;
      const updated = new Date(q.updated_at).getTime();
      const nowTime = Date.now();
      return (nowTime - updated) < 60 * 1000; // Active in last minute
    }).map(q => ({
      userId: q.user_id,
      lastHeartbeat: q.updated_at,
    })) || [];
    
    // Get locks (users in vote_active are "locked" in pairs)
    const locks = queueData?.filter(q => q.status === 'vote_active').map(q => ({
      userId: q.user_id,
      lockType: 'vote',
      matchId: matchesData?.find(m => m.user1_id === q.user_id || m.user2_id === q.user_id)?.id || null,
    })) || [];
    
    return NextResponse.json({
      timestamp: now,
      currentQueue: {
        entries: queueData || [],
        count: queueData?.length || 0,
        byStatus: queueByStatus,
      },
      currentPairs: {
        pending: matchesData || [],
        count: matchesData?.length || 0,
        summary: matchesData?.map(m => ({
          id: m.id,
          user1: m.user1_id,
          user2: m.user2_id,
          matchedAt: m.matched_at,
        })) || [],
      },
      activeTimers: activeTimers,
      heartbeats: {
        active: heartbeats,
        count: heartbeats.length,
      },
      lastTenEvents: eventsData.slice(0, 10).map(e => ({
        type: e.event_type,
        timestamp: e.timestamp,
        user: e.user_id,
        severity: e.severity,
        message: e.event_data?.message || e.error_message || '',
      })),
      lastFiveErrors: errorsData.slice(0, 5).map(e => ({
        type: e.event_type,
        timestamp: e.timestamp,
        user: e.user_id,
        error: e.error_message || e.event_data?.error || '',
        details: e.event_data,
      })),
      fairnessDistribution: fairnessDistribution,
      locks: {
        active: locks,
        count: locks.length,
      },
      systemHealth: {
        queueSize: queueData?.length || 0,
        pendingMatches: matchesData?.length || 0,
        activeUsers: heartbeats.length,
        errorsInLastHour: errorsData.length,
        status: queueData?.length === 0 && matchesData?.length === 0 ? 'idle' : 'active',
      },
    });
  } catch (e: any) {
    console.error('Error in debug feed API route:', e);
    return NextResponse.json({ 
      error: e.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
