/**
 * Matching Scheduler
 * 
 * Zero Issues Architecture: Event-driven matching with retry fallback
 * 
 * Active cron jobs:
 * - retry-matching (every 5 seconds) - fallback for race conditions
 * - resolve_expired_votes (every 10 seconds) - handled by /api/cron/resolve-expired-votes
 * - handle_disconnects (every 10 seconds) - handled by /api/cron/handle-disconnects
 */

import cron, { ScheduledTask } from 'node-cron'

let retryMatchingJob: ScheduledTask | null = null

/**
 * Start the matching scheduler
 * 
 * Schedules retry-matching cron job as fallback for race conditions
 */
export function startMatchingScheduler() {
  if (retryMatchingJob) {
    // Already started
    return
  }

  // Retry matching every 5 seconds (fallback for race conditions)
  retryMatchingJob = cron.schedule('*/5 * * * * *', () => {
    setImmediate(() => {
      // Fire-and-forget: Don't await, let it run in background
      Promise.resolve()
        .then(async () => {
          try {
            const { getPooledServiceClient } = await import('@/lib/supabase/pooled-client')
            const supabase = getPooledServiceClient()
            
            // IMPROVED: First retry stuck users (>30s waiting)
            let stuckResult: any = null
            try {
              const { data, error } = await supabase.rpc('retry_matching_stuck_users')
              if (!error) {
                stuckResult = { data }
              }
            } catch {
              // Ignore errors
            }
            
            // Also retry regular waiting users with recent activity (extended to 30s)
            const { data: waitingUsers, error: queryError } = await supabase
              .from('users_state')
              .select('user_id')
              .eq('state', 'waiting')
              .gt('last_active', new Date(Date.now() - 30000).toISOString()) // Extended to 30s
              .limit(50)
            
            if (queryError || !waitingUsers || waitingUsers.length === 0) {
              return
            }
            
            // Retry matching for each waiting user (in parallel for better performance)
            const retryPromises = waitingUsers.map(async user => {
              try {
                await supabase.rpc('try_match_user', {
                  p_user_id: user.user_id
                })
              } catch {
                // Ignore individual errors
              }
            })
            
            await Promise.all(retryPromises)
          } catch (error) {
            // Silently fail - don't log expected errors
          }
        })
        .catch(() => {
          // Ignore errors
        })
    })
  }, {
    timezone: 'UTC',
    scheduled: true,
  } as any)

  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Retry matching scheduler started (every 5s, fallback for race conditions)')
  }
}

/**
 * Stop the matching scheduler
 */
export function stopMatchingScheduler() {
  if (retryMatchingJob) {
    retryMatchingJob.stop()
    retryMatchingJob = null
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return retryMatchingJob !== null
}
