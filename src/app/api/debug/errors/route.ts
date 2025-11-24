import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/errors
 * 
 * Returns recent errors from the database event log.
 * Query parameters:
 * - limit: Number of errors to return (default: 50)
 * - user: Filter by user ID
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const userId = searchParams.get('user');
    
    // Query spark_event_log table for errors (actual table name)
    let query = supabase
      .from('spark_event_log')
      .select('*')
      .or('severity.eq.ERROR,log_level.eq.ERROR')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching debug errors:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      errors: data || [],
      count: data?.length || 0,
      filters: {
        limit,
        user: userId || null,
      }
    });
  } catch (e: any) {
    console.error('Error in debug errors API route:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
