import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/match/acknowledge
 * 
 * Simple acknowledge endpoint
 * User acknowledges match, transitions to vote_window when both acknowledge
 */
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
    
    // Get match_id from request body
    const body = await request.json()
    const { match_id } = body
    
    if (!match_id) {
      return NextResponse.json(
        { error: 'match_id is required' },
        { status: 400 }
      )
    }
    
    // Call acknowledge_match function
    const { data: ackData, error: ackError } = await supabase.rpc('acknowledge_match', {
      p_user_id: user.id,
      p_match_id: match_id
    })
    
    if (ackError) {
      console.error('Error acknowledging match:', ackError)
      return NextResponse.json(
        { error: 'Failed to acknowledge match', details: ackError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(ackData)
    
  } catch (error: any) {
    console.error('Error in /api/match/acknowledge:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

