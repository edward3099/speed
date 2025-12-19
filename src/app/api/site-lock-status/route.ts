import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to check site lock status
 * GET /api/site-lock-status
 */
export async function GET() {
  const siteLocked = process.env.NEXT_PUBLIC_SITE_LOCKED;
  const trimmed = siteLocked?.trim();
  const isLocked = trimmed === "true" || trimmed === "1";

  return NextResponse.json({
    siteLocked,
    trimmed,
    isLocked,
    allEnvVars: {
      NEXT_PUBLIC_SITE_LOCKED: process.env.NEXT_PUBLIC_SITE_LOCKED,
      NODE_ENV: process.env.NODE_ENV,
    }
  });
}
