import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Background Matching Job API Route
 * 
 * This endpoint calls process_unmatched_users() to match users who have been
 * waiting 5+ seconds in the queue.
 * 
 * Should be called every 10-30 seconds via:
 * - Vercel Cron Jobs (if deployed on Vercel)
 * - External cron service (EasyCron, Cronitor, etc.)
 * - GitHub Actions scheduled workflow
 * 
 * Security: Add authentication token to prevent unauthorized access
 */

// Optional: Add authentication token check
const AUTH_TOKEN = process.env.BACKGROUND_MATCHING_TOKEN;

export async function POST(request: Request) {
  try {
    // Optional: Verify authentication token
    if (AUTH_TOKEN) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const supabase = await createClient();

    // Call the background matching function
    const { data: matchesCreated, error } = await supabase.rpc(
      'process_unmatched_users'
    );

    if (error) {
      console.error('Background matching error:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          matchesCreated: null,
        },
        { status: 500 }
      );
    }

    // Also record metrics
    const { error: metricsError } = await supabase.rpc('record_matching_metrics');
    if (metricsError) {
      console.warn('Metrics recording error:', metricsError);
    }

    return NextResponse.json({
      success: true,
      matchesCreated: matchesCreated || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Background matching exception:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        matchesCreated: null,
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET() {
  return POST(new Request('http://localhost', { method: 'POST' }));
}

