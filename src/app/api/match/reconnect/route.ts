import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/match/reconnect
 * 
 * Handles user reconnection after disconnection
 * Updates heartbeat and determines appropriate state
 * 
 * Body: (optional)
 * - event_data: JSONB - Additional event data for state determination
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

    const body = await request.json().catch(() => ({}));
    const event_data = body.event_data || { user_id: user.id };

    // Update heartbeat first
    const { error: heartbeatError } = await supabase.rpc('heartbeat_update', {
      p_user_id: user.id
    });

    if (heartbeatError) {
      console.error('Error updating heartbeat:', heartbeatError);
      // Continue anyway - heartbeat is not critical
    }

    // Determine reconnect state
    // The heartbeat_update function already handles state transitions
    // But we can also explicitly check the current state
    const { data: queueData, error: queueError } = await supabase
      .from('matching_queue')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (queueError && queueError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine (user not in queue)
      console.error('Error checking queue status:', queueError);
    }

    return NextResponse.json({
      success: true,
      data: {
        user_id: user.id,
        status: queueData?.status || 'idle',
        reconnected_at: new Date().toISOString()
      },
      message: 'Reconnection handled successfully'
    });
  } catch (error: any) {
    console.error('Error in /api/match/reconnect:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}

