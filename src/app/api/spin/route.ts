import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { getConnectionThrottle } from '@/lib/connection-throttle'
import { cache, CacheKeys } from '@/lib/cache/simple-cache'

/**
 * POST /api/spin
 * 
 * Production spin endpoint - adds authenticated user to queue
 * Calls join_queue SQL function
 * 
 * Protections:
 * - Rate limiting (100 req/10s per IP)
 * - Connection throttling (prevents overload)
 */
// Rate limiting: 100 requests per 10 seconds per IP (more restrictive than test endpoint)
const RATE_LIMIT_OPTIONS = {
  windowMs: 10 * 1000,
  maxRequests: 100,
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = rateLimitMiddleware(request, RATE_LIMIT_OPTIONS)
  if (!rateLimitResult?.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult?.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult?.retryAfter || 10),
        },
      }
    )
  }

  // Connection throttling - prevent too many concurrent connections
  const connectionThrottle = getConnectionThrottle()
  if (!connectionThrottle.tryAcquire()) {
    const throttleStatus = connectionThrottle.getStatus()
    return NextResponse.json(
      {
        error: 'Service temporarily unavailable',
        message: 'Too many concurrent connections. Please try again later.',
      },
      {
        status: 503,
        headers: {
          'Retry-After': '2',
        },
      }
    )
  }

  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      connectionThrottle.release() // Release throttle token
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // CRITICAL FIX: Check if user is already matched BEFORE calling join_queue
    // This prevents race conditions when both users spin simultaneously
    // If user is already matched, return the match immediately
    const { data: existingMatchStatus } = await supabase.rpc('get_user_match_status', {
      p_user_id: user.id
    })
    
    if (existingMatchStatus?.match?.match_id) {
      // User is already matched - return match immediately
      // Don't call join_queue or try_match_user (would clear/destroy the match)
      connectionThrottle.release()
      
      // Invalidate cache to ensure fresh data
      cache.delete(CacheKeys.userMatchStatus(user.id))
      
      return NextResponse.json({
        success: true,
        matched: true,
        match_id: existingMatchStatus.match.match_id,
        message: 'Already matched'
      })
    }
    
    // Call join_queue function (event-driven: immediately try to match)
    const { error: joinError } = await supabase.rpc('join_queue', {
      p_user_id: user.id
    })
    
    if (joinError) {
      connectionThrottle.release()
      // Only log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Error joining queue:', joinError)
      }
      return NextResponse.json(
        { error: 'Failed to join queue', details: joinError.message },
        { status: 500 }
      )
    }
    
    // Event-driven matching: Immediately try to match this user
    const { data: matchId, error: matchError } = await supabase.rpc('try_match_user', {
      p_user_id: user.id
    })
    
    // Release connection throttle token on success
    connectionThrottle.release()
    
    if (matchError && process.env.NODE_ENV === 'development') {
      // Log but don't fail - matching might fail if no partner available
      console.warn('Matching attempt failed (may be normal):', matchError.message)
    }
    
    // CRITICAL: Invalidate cache for this user (match status changed)
    // This ensures the spinning page gets fresh data and redirects correctly
    // ALWAYS invalidate, even if no match (user joined queue, status changed)
    cache.delete(CacheKeys.userMatchStatus(user.id))
    
    // If matched, also invalidate partner's cache IMMEDIATELY
    // This is critical - partner must see match status change instantly
    if (matchId) {
      // Get partner ID from match - use the match data we already have
      const { data: matchData, error: matchDataError } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .eq('match_id', matchId)
        .single()
      
      if (!matchDataError && matchData) {
        const partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id
        // CRITICAL: Invalidate partner's cache immediately so they see the match
        cache.delete(CacheKeys.userMatchStatus(partnerId))
        
        // Also invalidate any related cache keys (defensive)
        // This ensures no stale data persists
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Cache invalidated for both users: ${user.id} and ${partnerId}`)
        }
      }
    }
    
    // Return match status
    return NextResponse.json({
      success: true,
      matched: matchId !== null,
      match_id: matchId || undefined,
      message: matchId ? 'Matched immediately' : 'Joined queue, waiting for partner'
    })
    
  } catch (error: any) {
    // Release connection throttle token on error
    const connectionThrottle = getConnectionThrottle()
    connectionThrottle.release()
    
    // Only log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/spin:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
