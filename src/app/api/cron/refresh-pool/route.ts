/**
 * CRON ENDPOINT: /api/cron/refresh-pool
 * 
 * DEPRECATED: This endpoint is no longer used in Zero Issues Architecture
 * matching_pool materialized view has been removed
 * Matching now uses direct queries on users_state table
 * 
 * This endpoint is kept for backwards compatibility but does nothing
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'matching_pool has been removed. Matching uses direct queries now.',
    timestamp: new Date().toISOString(),
  })
}

export const POST = GET

