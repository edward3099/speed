import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/spin-logs
 * 
 * Get spin-related logs from the database debug_event_log table
 * This queries the actual database logs created by triggers
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const userId = searchParams.get('user');

    // Query spin-related events from spark_event_log (database logging table)
    // Include all comprehensive logging event types
    const spinEventTypes = [
      'spinStart', 'queueJoined', 'queue_join_failed',
      'matchFound', 'matchDetected', 'matchLoaded', 'no_match_found',
      'votingWindowStarted', 'votingWindowEnded',
      'voteCast', 'voteYes', 'votePass', 'vote_save_failed',
      'userDisconnected', 'userDisconnectedVoting',
      'matching_failed',
      'queue_entry_created', 'queue_entry_updated', 'pairing_success', 'pairing_failed'
    ];
    
    let query = supabase
      .from('spark_event_log')
      .select('id, event_type, event_message, event_data, user_id, timestamp, severity, function_name, success')
      .in('event_type', spinEventTypes)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: spinLogs, error: queryError } = await query;

    if (queryError) {
      console.error('Error fetching spin logs from database:', queryError);
      return NextResponse.json(
        {
          success: false,
          error: queryError.message || 'Failed to fetch spin logs'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: spinLogs?.length || 0,
      logs: spinLogs || [],
      source: 'database',
      message: `Found ${spinLogs?.length || 0} spin-related logs from database`
    });
  } catch (error: any) {
    console.error('Error fetching spin logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch spin logs'
      },
      { status: 500 }
    );
  }
}

