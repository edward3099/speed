/**
 * Diagnostics endpoint to check LiveKit configuration
 * This helps identify if environment variables are properly set in Vercel
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  // Trim whitespace/newlines from URL (common issue when setting env vars)
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim()

  const diagnostics = {
    environment: process.env.NODE_ENV,
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    hasWsUrl: !!wsUrl,
    apiKeyLength: apiKey?.length || 0,
    apiSecretLength: apiSecret?.length || 0,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 4) + '...' : null,
    wsUrl: wsUrl || null,
    errors: [] as string[],
    warnings: [] as string[],
    recommendations: [] as string[]
  }

  // Check for missing variables
  if (!apiKey) {
    diagnostics.errors.push('LIVEKIT_API_KEY is missing')
    diagnostics.recommendations.push('Set LIVEKIT_API_KEY in Vercel dashboard: Settings > Environment Variables')
  } else if (apiKey.length < 10) {
    diagnostics.warnings.push('LIVEKIT_API_KEY seems too short (expected ~15-20 characters)')
  }

  if (!apiSecret) {
    diagnostics.errors.push('LIVEKIT_API_SECRET is missing')
    diagnostics.recommendations.push('Set LIVEKIT_API_SECRET in Vercel dashboard: Settings > Environment Variables')
  } else if (apiSecret.length < 30) {
    diagnostics.warnings.push('LIVEKIT_API_SECRET seems too short (expected ~40+ characters)')
  }

  if (!wsUrl) {
    diagnostics.errors.push('NEXT_PUBLIC_LIVEKIT_URL is missing')
    diagnostics.recommendations.push('Set NEXT_PUBLIC_LIVEKIT_URL in Vercel dashboard (e.g., wss://your-project.livekit.cloud)')
  } else if (!wsUrl.startsWith('wss://') && !wsUrl.startsWith('ws://')) {
    diagnostics.errors.push('NEXT_PUBLIC_LIVEKIT_URL must start with wss:// or ws://')
  }

  // Check if we're in production and variables are missing
  if (process.env.NODE_ENV === 'production' && diagnostics.errors.length > 0) {
    diagnostics.recommendations.push('After adding environment variables in Vercel, redeploy your application')
  }

  return NextResponse.json({
    success: diagnostics.errors.length === 0,
    ...diagnostics
  }, {
    status: diagnostics.errors.length > 0 ? 500 : 200
  })
}
