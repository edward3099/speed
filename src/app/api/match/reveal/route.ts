import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/match/reveal
 * 
 * Completes the reveal phase for a match
 * Transitions both users to vote_active when both have revealed
 * 
 * Body:
 * - match_id: UUID - The match ID
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
    const { match_id } = body;

    // Validate input
    if (!match_id) {
      return NextResponse.json(
        { success: false, error: 'match_id is required' },
        { status: 400 }
      );
    }

    // Complete reveal via RPC
    const { data, error } = await supabase.rpc('complete_reveal', {
      p_user_id: user.id,
      p_match_id: match_id
    });

    if (error) {
      console.error('Error completing reveal:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to complete reveal'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Reveal completed successfully'
    });
  } catch (error: any) {
    console.error('Error in /api/match/reveal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}

