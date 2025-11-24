import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/logs
 * 
 * Returns recent debug logs from the database event log.
 * Query parameters:
 * - limit: Number of logs to return (default: 100)
 * - type: Filter by event type
 * - level: Filter by log level (info, warn, error, debug)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const eventType = searchParams.get('type');
    const level = searchParams.get('level');
    
    // Query spark_event_log table for recent events (actual table name)
    let query = supabase
      .from('spark_event_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (eventType) {
      query = query.eq('event_type', eventType);
    }
    
    if (level) {
      // Try both severity and log_level columns
      query = query.or(`severity.eq.${level.toUpperCase()},log_level.eq.${level.toUpperCase()}`);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching debug logs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      logs: data || [],
      count: data?.length || 0,
      filters: {
        limit,
        type: eventType || null,
        level: level || null,
      }
    });
  } catch (e: any) {
    console.error('Error in debug logs API route:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
