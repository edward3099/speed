import { NextResponse } from 'next/server';
// Import only the logging functions to avoid server-side issues with timing module
import { getLogs, getLogsByType, getLogsByUser, getErrors } from '@/lib/debug/core/logging';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/debug/logs
 * 
 * Get debug logs from the debugging toolkit
 * 
 * Query parameters:
 * - type: Filter by event type (e.g., 'spin', 'spinStart', 'vote')
 * - user: Filter by user ID
 * - limit: Number of logs to return (default: 100)
 * - errors: If true, return only errors
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const user = searchParams.get('user');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const errorsOnly = searchParams.get('errors') === 'true';

    let logs;

    if (errorsOnly) {
      logs = getErrors(limit);
    } else if (type) {
      logs = getLogsByType(type, limit);
    } else if (user) {
      logs = getLogsByUser(user, limit);
    } else {
      logs = getLogs(limit);
    }

    // Filter for spin-related events if no specific type was requested
    if (!type && !user && !errorsOnly) {
      const spinLogs = logs.filter(log => 
        log.type.toLowerCase().includes('spin') ||
        log.type.toLowerCase().includes('queue') ||
        log.type.toLowerCase().includes('match') ||
        log.type.toLowerCase().includes('pair')
      );

      return NextResponse.json({
        success: true,
        count: spinLogs.length,
        total: logs.length,
        logs: spinLogs,
        message: `Found ${spinLogs.length} spin-related logs out of ${logs.length} total logs`
      });
    }

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs,
      filters: {
        type: type || null,
        user: user || null,
        errorsOnly,
        limit
      }
    });
  } catch (error: any) {
    console.error('Error fetching debug logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch debug logs'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/debug/logs
 * 
 * Receive debug logs from client-side and store them in database
 * This allows client-side logs to be accessible via the API
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { logs } = await request.json();

    if (!Array.isArray(logs)) {
      return NextResponse.json(
        { success: false, error: 'Logs must be an array' },
        { status: 400 }
      );
    }

    // Store logs in database via spark_event_log
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    const logPromises = logs.map(async (log: any) => {
      try {
        await supabase.rpc('spark_log_event', {
          p_event_type: log.type || 'debug_log',
          p_event_message: log.metadata?.message || log.type || 'Debug log',
          p_event_data: {
            level: log.level,
            user: log.user,
            metadata: log.metadata,
            error: log.error,
            timestamp: log.timestamp
          },
          p_user_id: log.user || authUser?.id || null,
          p_severity: log.level === 'error' ? 'ERROR' : log.level === 'warn' ? 'WARNING' : 'INFO',
          p_function_name: 'debug_toolkit_client',
          p_success: log.level !== 'error'
        });
      } catch (err) {
        console.error('Error storing client log:', err);
      }
    });

    await Promise.all(logPromises);

    return NextResponse.json({
      success: true,
      stored: logs.length,
      message: `Stored ${logs.length} client-side logs to database`
    });
  } catch (error: any) {
    console.error('Error storing client logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to store client logs'
      },
      { status: 500 }
    );
  }
}

