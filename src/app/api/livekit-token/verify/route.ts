/**
 * Verification endpoint to test LiveKit token generation and connection
 * This helps diagnose API key/secret mismatches
 */

import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY?.trim()
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim()

    const verification = {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasWsUrl: !!wsUrl,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 4) + '...' : null,
      wsUrl: wsUrl || null,
      errors: [] as string[],
      warnings: [] as string[],
      tokenTest: null as any
    }

    // Check for missing variables
    if (!apiKey) {
      verification.errors.push('LIVEKIT_API_KEY is missing')
    }
    if (!apiSecret) {
      verification.errors.push('LIVEKIT_API_SECRET is missing')
    }
    if (!wsUrl) {
      verification.errors.push('NEXT_PUBLIC_LIVEKIT_URL is missing')
    }

    // If we have credentials, try to generate a test token
    if (apiKey && apiSecret && wsUrl) {
      try {
        const testRoom = 'test-verification-room'
        const testUsername = 'test-user'
        
        const at = new AccessToken(apiKey, apiSecret, {
          identity: testUsername,
          ttl: '1h',
        })

        at.addGrant({
          roomJoin: true,
          room: testRoom,
          canPublish: true,
          canSubscribe: true,
        })

        const token = await at.toJwt()
        
        // Decode token to verify structure
        let tokenPayload: any = null
        try {
          const tokenParts = token.split('.')
          if (tokenParts.length === 3) {
            tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
          }
        } catch (e) {
          verification.errors.push('Failed to decode generated token')
        }

        verification.tokenTest = {
          success: true,
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 30) + '...',
          payload: tokenPayload ? {
            identity: tokenPayload.sub,
            room: tokenPayload.video?.room,
            canPublish: tokenPayload.video?.canPublish,
            canSubscribe: tokenPayload.video?.canSubscribe,
            expiresAt: tokenPayload.exp ? new Date(tokenPayload.exp * 1000).toISOString() : null,
            issuedAt: tokenPayload.iat ? new Date(tokenPayload.iat * 1000).toISOString() : null
          } : null,
          note: 'Token generated successfully. If connection still fails, verify API key/secret match your LiveKit Cloud project.'
        }
      } catch (tokenError: any) {
        verification.errors.push(`Token generation failed: ${tokenError?.message || 'Unknown error'}`)
        verification.tokenTest = {
          success: false,
          error: tokenError?.message,
          note: 'This indicates the API key/secret format is invalid or they don\'t match your LiveKit project.'
        }
      }
    }

    // Validate API key format (LiveKit API keys typically start with specific prefixes)
    if (apiKey) {
      // LiveKit API keys usually start with "API" or have a specific format
      if (!apiKey.startsWith('API') && apiKey.length < 10) {
        verification.warnings.push('API key format seems unusual (expected to start with "API" and be ~15-20 chars)')
      }
    }

    // Validate API secret format
    if (apiSecret) {
      if (apiSecret.length < 30) {
        verification.warnings.push('API secret seems too short (expected ~40+ characters)')
      }
    }

    // Validate URL format
    if (wsUrl) {
      if (!wsUrl.startsWith('wss://') && !wsUrl.startsWith('ws://')) {
        verification.errors.push('NEXT_PUBLIC_LIVEKIT_URL must start with wss:// or ws://')
      }
    }

    return NextResponse.json({
      success: verification.errors.length === 0,
      ...verification,
      recommendations: verification.errors.length > 0 ? [
        '1. Verify LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel match your LiveKit Cloud project',
        '2. Check that the API keys are for the correct LiveKit project/environment',
        '3. Ensure there are no extra spaces or newlines in the environment variable values',
        '4. After updating environment variables, redeploy your Vercel application',
        '5. Verify the NEXT_PUBLIC_LIVEKIT_URL matches your LiveKit Cloud project URL'
      ] : []
    }, {
      status: verification.errors.length > 0 ? 500 : 200
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: {
        message: error?.message,
        name: error?.name
      }
    }, { status: 500 })
  }
}
