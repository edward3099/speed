/**
 * Manual matching endpoint
 * 
 * DEPRECATED: This endpoint is no longer used in Zero Issues Architecture
 * Matching is now event-driven (triggered on join_queue via try_match_user)
 * 
 * This endpoint is kept for backwards compatibility but does nothing
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Matching is now event-driven. This endpoint is deprecated.',
    matchesCreated: 0,
    timestamp: new Date().toISOString(),
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
