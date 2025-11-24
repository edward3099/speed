import { NextResponse } from 'next/server';

/**
 * Debug API Route
 * 
 * Provides endpoints to access debug logs, state, and debugging information.
 * This integrates with the debug toolkit modules.
 */

/**
 * GET /api/debug
 * 
 * Returns debug information including logs, errors, and state.
 * Query parameters:
 * - type: Filter logs by type
 * - user: Filter logs by user ID
 * - limit: Limit number of logs returned
 * - errors: Return only errors (true/false)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const user = searchParams.get('user');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const errorsOnly = searchParams.get('errors') === 'true';
    
    // Import debug toolkit (client-side only, so we'll need to check logs differently)
    // Since this is server-side, we'll return instructions for client-side access
    
    // For now, return structure for client-side debug access
    return NextResponse.json({
      message: 'Debug logs are stored client-side in memory',
      instructions: {
        clientSide: 'Use getLogs(), getErrors(), getDebugFeed() from @/lib/debug',
        api: 'This endpoint will be enhanced to access server-side logs',
      },
      availableEndpoints: {
        logs: '/api/debug/logs',
        errors: '/api/debug/errors',
        state: '/api/debug/state',
        feed: '/api/debug/feed',
      }
    });
  } catch (e: any) {
    console.error('Error in debug API route:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
