import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cache, CacheKeys } from '@/lib/cache/simple-cache'
import { deduplicateRequest } from '@/lib/cache/request-deduplication'
import { logApi, profiler } from '@/lib/debug'

/**
 * GET /api/match/status
 * 
 * Simple status endpoint for polling
 * Returns current match status and info
 * Uses caching for better performance
 * 
 * Route segment config: Enable aggressive caching
 */
export const dynamic = 'force-dynamic' // Dynamic due to auth, but we cache responses
export const revalidate = 0 // No ISR, we use in-memory cache

export async function GET(request: NextRequest) {
  try {
    // Use server client for auth (needs cookies)
    const authClient = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use user's authenticated client for RPC (needs user context for RLS)
    const supabase = authClient

    // Check cache first (15 second TTL - very aggressive caching)
    // Status only changes when matched/voted, which is infrequent
    // Longer TTL reduces network round-trips to Supabase
    const cacheKey = CacheKeys.userMatchStatus(user.id)
    const cachedStatus = cache.get(cacheKey)
    if (cachedStatus) {
      // Return cached response immediately without any DB operations
      // This should be < 10ms response time
      const response = NextResponse.json(cachedStatus)
      // Set cache headers for browser/CDN caching (5 seconds)
      response.headers.set('Cache-Control', 'private, s-maxage=5, stale-while-revalidate=10')
      return response
    }
    
    // Update last_active asynchronously (non-blocking) to keep user "online" while polling
    // Don't await - let it run in background to avoid blocking the status check
    Promise.resolve(
      supabase
        .from('users_state')
        .update({ 
          last_active: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
    )
      .then(() => {
        // Silently handle - don't block on this
      })
      .catch(() => {
        // Silently handle errors - don't block on this
      })
    
    // Deduplicate concurrent requests for the same user
    // If multiple requests come in at once, reuse the same RPC call
    const result = await deduplicateRequest(`match-status-${user.id}`, async () => {
      // Call optimized get_user_match_status function (STABLE, single JOIN query)
      // STABLE function allows PostgreSQL to optimize and cache query plans
      const { data: statusData, error: statusError } = await supabase.rpc('get_user_match_status', {
        p_user_id: user.id
      })
      
      if (statusError) {
        throw new Error(statusError.message)
      }

      return statusData
    })
    
    // Cache the result (15 second TTL - very aggressive caching)
    // Status changes are infrequent (only when matched/voted), so 15s is safe
    // This significantly reduces network latency issues
    cache.set(cacheKey, result, 15000)
    
    // Return response with cache headers for browser/CDN caching
    const response = NextResponse.json(result)
    // 5 seconds CDN cache, 10 seconds stale-while-revalidate
    response.headers.set('Cache-Control', 'private, s-maxage=5, stale-while-revalidate=10')
    return response
    
  } catch (error: any) {
    console.error('Error in /api/match/status:', error)
    
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}

