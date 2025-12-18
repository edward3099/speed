import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/match/by-id?matchId=...
 * 
 * Fetch match directly by matchId, bypassing cache
 * Used when matchId is known from URL but status endpoint might have stale data
 */
export async function GET(request: NextRequest) {
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

    // Get matchId from query params
    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get('matchId')
    
    if (!matchId) {
      return NextResponse.json(
        { error: 'matchId is required' },
        { status: 400 }
      )
    }

    // Fetch match directly from database (bypasses cache)
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('match_id, user1_id, user2_id, status, outcome, vote_window_expires_at, vote_window_started_at, user1_vote, user2_vote')
      .eq('match_id', matchId)
      .single()

    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      )
    }

    // Verify user is part of this match
    if (match.user1_id !== user.id && match.user2_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Get partner info
    const partnerId = match.user1_id === user.id ? match.user2_id : match.user1_id
    const { data: partnerProfile, error: partnerError } = await supabase
      .from('profiles')
      .select('id, name, age, photo, bio, location')
      .eq('id', partnerId)
      .single()

    // Get user state to check if matched
    const { data: userState } = await supabase
      .from('users_state')
      .select('state, match_id')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      match: {
        match_id: match.match_id,
        status: match.status,
        outcome: match.outcome,
        vote_window_expires_at: match.vote_window_expires_at,
        vote_window_started_at: match.vote_window_started_at,
        user1_id: match.user1_id,
        user2_id: match.user2_id,
        user1_vote: match.user1_vote,
        user2_vote: match.user2_vote,
        partner: partnerProfile ? {
          id: partnerProfile.id,
          name: partnerProfile.name,
          age: partnerProfile.age,
          photo: partnerProfile.photo,
          bio: partnerProfile.bio,
          location: partnerProfile.location
        } : null
      },
      state: userState?.state || 'idle',
      user_id: user.id
    })
    
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/match/by-id:', error)
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


















