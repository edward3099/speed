import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/match/vote
 * 
 * Submits a vote for a match
 * 
 * Body:
 * - match_id: UUID - The match ID
 * - vote_type: 'yes' | 'pass' - The vote type
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { match_id, vote_type } = body;

    // Validate input
    if (!match_id) {
      return NextResponse.json(
        { success: false, error: 'match_id is required' },
        { status: 400 }
      );
    }

    if (!vote_type || !['yes', 'pass'].includes(vote_type)) {
      return NextResponse.json(
        { success: false, error: 'vote_type must be "yes" or "pass"' },
        { status: 400 }
      );
    }

    // Submit vote via RPC
    const { data, error } = await supabase.rpc('submit_vote', {
      p_user_id: user.id,
      p_match_id: match_id,
      p_vote_type: vote_type
    });

    if (error) {
      console.error('Error submitting vote:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to submit vote'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Vote submitted successfully'
    });
  } catch (error: any) {
    console.error('Error in /api/match/vote:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}

