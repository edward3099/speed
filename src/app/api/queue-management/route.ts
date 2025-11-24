import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Queue Management API Route
 * 
 * This route serves as a backup for queue management if pg_cron is not available.
 * It calls the master manage_queue_system() function which orchestrates all
 * queue management functions:
 * - cleanup_stale_queue_entries
 * - validate_queue_integrity
 * - optimize_queue_order
 * - balance_queue_gender
 * - monitor_queue_health
 * 
 * Schedule this route to run every 30-60 seconds using:
 * - Vercel Cron Jobs
 * - External cron service (cron-job.org, EasyCron, etc.)
 * - Or call it manually for testing
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    // Call the master queue management function
    const { data, error } = await supabase.rpc('manage_queue_system');

    if (error) {
      console.error('Error in queue management system:', error);
      return NextResponse.json(
        { 
          error: error.message,
          details: error
        },
        { status: 500 }
      );
    }

    console.log('Queue management system executed successfully:', data);
    
    return NextResponse.json({
      message: 'Queue management system executed',
      result: data,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Unexpected error in queue management API route:', e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and manual triggering
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Get current queue health
    const { data: health, error: healthError } = await supabase.rpc('monitor_queue_health');

    if (healthError) {
      console.error('Error getting queue health:', healthError);
      return NextResponse.json(
        { error: healthError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Queue health status',
      health: health,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Unexpected error in queue management GET route:', e);
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}

