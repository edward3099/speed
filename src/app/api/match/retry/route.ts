/**
 * POST /api/match/retry
 * 
 * Client-side retry matching endpoint
 * Retries matching for the authenticated user without re-joining the queue
 * 
 * Used by spinning page to aggressively retry matching every 2-3 seconds
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cache, CacheKeys } from '@/lib/cache/simple-cache'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Retry matching without re-joining queue
    const { data: matchId, error: matchError } = await supabase.rpc('try_match_user', {
      p_user_id: user.id
    })
    
    if (matchError && process.env.NODE_ENV === 'development') {
      // Log but don't fail - matching might fail if no partner available
      console.warn('Retry matching failed (may be normal):', matchError.message)
    }
    
    // Invalidate cache if matched
    if (matchId) {
      cache.delete(CacheKeys.userMatchStatus(user.id))
      
      // Get partner ID and invalidate their cache too
      const { data: matchData, error: matchDataError } = await supabase
        .from('matches')
        .select('user1_id, user2_id')
        .eq('match_id', matchId)
        .single()
      
      if (!matchDataError && matchData) {
        const partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id
        cache.delete(CacheKeys.userMatchStatus(partnerId))
      }
    }
    
    // Return match status
    return NextResponse.json({
      success: true,
      matched: matchId !== null,
      match_id: matchId || undefined,
    })
    
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/match/retry:', error)
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


















