import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/match/check-outcome
 * 
 * Check the outcome of a specific match
 * Used when match_id is cleared from users_state but we need to check outcome
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
    
    // Get match outcome
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('outcome, status, user1_id, user2_id')
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
    
    return NextResponse.json({
      outcome: match.outcome,
      status: match.status
    })
    
  } catch (error: any) {
    console.error('Error in /api/match/check-outcome:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}



