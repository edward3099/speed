/**
 * Matching Scheduler
 * Runs matching process continuously using node-cron
 * Works in both development and production
 */

import cron, { ScheduledTask } from 'node-cron'

let matchingJob: ScheduledTask | null = null
let refreshPoolJob: ScheduledTask | null = null

/**
 * Start the matching scheduler
 */
export function startMatchingScheduler() {
  if (matchingJob || refreshPoolJob) {
    console.log('⚠️ Matching scheduler already started')
    return
  }

  // Check if required environment variables are available
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Matching scheduler: Missing Supabase environment variables, skipping start')
    return
  }

  console.log('🚀 Starting matching scheduler...')

  // Refresh matching pool every 5 seconds (aligned with matching frequency)
  // Further reduced frequency to minimize database connection contention
  refreshPoolJob = cron.schedule('*/5 * * * * *', async () => {
    try {
      const { getPooledServiceClient } = await import('@/lib/supabase/pooled-client')
      const supabase = getPooledServiceClient()
      
      try {
        await supabase.rpc('refresh_matching_pool')
      } catch (error: any) {
        // Silently fail if view doesn't exist yet or on other errors
        // Only log if it's not a common/expected error
        if (error?.message && !error.message.includes('does not exist') && !error.message.includes('materialized view')) {
          console.warn('⚠️ Failed to refresh matching pool:', error.message)
        }
      }
    } catch (error: any) {
      // Don't log errors that might be expected during startup
      if (error?.message && !error.message.includes('Missing Supabase')) {
        console.error('❌ Error refreshing matching pool:', error.message)
      }
    }
  }, {
    timezone: 'UTC',
  } as any)

  // Run matching process every 5 seconds (optimized for 500+ concurrent users)
  // Optimized frequency to balance matching speed with database connection usage
  // With Supabase Pro (200 connections), this frequency provides good throughput
  matchingJob = cron.schedule('*/5 * * * * *', async () => {
    try {
      const { getPooledServiceClient } = await import('@/lib/supabase/pooled-client')
      const supabase = getPooledServiceClient()

      // Refresh pool first (for faster queries)
      try {
        await supabase.rpc('refresh_matching_pool')
      } catch (refreshError) {
        // Continue even if refresh fails
      }

      // Call process_matching function
      const { data: matchesCreated, error } = await supabase.rpc('process_matching')

      if (error) {
        // Only log if it's not a transient error
        if (!error.message?.includes('relation') && !error.message?.includes('does not exist')) {
          console.error('❌ Error in continuous matching:', error.message)
        }
        return
      }

      // Invalidate cache if matches were created (users' status changed)
      if (matchesCreated && matchesCreated > 0) {
        console.log(`✅ Matching scheduler: ${matchesCreated} match(es) created`)
        
        // Invalidate match status cache for affected users
        // Get recently created matches to invalidate their cache
        try {
          const { getCache } = await import('@/lib/cache')
          const cache = getCache()
          
          // Get matches created in the last 5 seconds
          const { data: recentMatches } = await supabase
            .from('matches')
            .select('user1_id, user2_id')
            .eq('status', 'paired')
            .gte('created_at', new Date(Date.now() - 5000).toISOString())
            .limit(20)
          
          if (recentMatches) {
            for (const match of recentMatches) {
              cache.delete(`match_status:${match.user1_id}`)
              cache.delete(`match_status:${match.user2_id}`)
            }
          }
        } catch (cacheError) {
          // Silently fail cache invalidation
        }
      }
    } catch (error: any) {
      // Don't log expected errors during initialization
      if (error?.message && !error.message.includes('Missing Supabase')) {
        console.error('❌ Error in matching scheduler:', error.message)
      }
    }
  }, {
    timezone: 'UTC',
  } as any)

  console.log('✅ Matching scheduler started')
  console.log('   - Matching pool refresh: every 5 seconds (optimized for Supabase Pro)')
  console.log('   - Matching process: every 5 seconds (optimized for 500+ concurrent users)')
}

/**
 * Stop the matching scheduler
 */
export function stopMatchingScheduler() {
  if (matchingJob) {
    matchingJob.stop()
    matchingJob = null
  }
  if (refreshPoolJob) {
    refreshPoolJob.stop()
    refreshPoolJob = null
  }
  console.log('🛑 Matching scheduler stopped')
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return matchingJob !== null && refreshPoolJob !== null
}

