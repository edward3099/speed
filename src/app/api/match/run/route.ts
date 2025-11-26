import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/match/run
 * 
 * Runs the matching orchestrator to process users in the queue
 * This is the main entry point for the matching system
 * 
 * Body: (optional)
 * - force: boolean - Force run even if another process is running
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

    // Call matching orchestrator
    const { data, error } = await supabase.rpc('matching_orchestrator');

    if (error) {
      console.error('Error running matching orchestrator:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to run matching orchestrator'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Matching orchestrator completed successfully'
    });
  } catch (error: any) {
    console.error('Error in /api/match/run:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/match/run
 * 
 * Health check for matching orchestrator
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Just verify the function exists
    const { error } = await supabase.rpc('matching_orchestrator');

    // If we get a "locked" response, that's actually good - means function exists
    if (error && !error.message.includes('locked')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Matching orchestrator not available'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Matching orchestrator is available'
    });
  } catch (error: any) {
    console.error('Error checking matching orchestrator:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}

