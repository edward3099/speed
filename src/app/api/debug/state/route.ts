import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/state
 * 
 * Returns current matching queue state for debugging.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  
  try {
    // Get queue state
    const { data: queueData, error: queueError } = await supabase
      .from('matching_queue')
      .select('*')
      .order('joined_at', { ascending: true });
    
    // Get pending matches
    const { data: matchesData, error: matchesError } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'pending')
      .order('matched_at', { ascending: false });
    
    // Get recent votes
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (queueError || matchesError || votesError) {
      return NextResponse.json({
        error: 'Failed to fetch state',
        details: {
          queueError: queueError?.message,
          matchesError: matchesError?.message,
          votesError: votesError?.message,
        }
      }, { status: 500 });
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      queue: {
        entries: queueData || [],
        count: queueData?.length || 0,
        byStatus: {
          spin_active: queueData?.filter(q => q.status === 'spin_active').length || 0,
          queue_waiting: queueData?.filter(q => q.status === 'queue_waiting').length || 0,
          vote_active: queueData?.filter(q => q.status === 'vote_active').length || 0,
          idle: queueData?.filter(q => q.status === 'idle').length || 0,
        }
      },
      matches: {
        pending: matchesData || [],
        count: matchesData?.length || 0,
      },
      votes: {
        recent: votesData || [],
        count: votesData?.length || 0,
      }
    });
  } catch (e: any) {
    console.error('Error in debug state API route:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
