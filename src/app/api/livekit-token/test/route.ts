/**
 * Test endpoint to verify LiveKit token generation
 * Usage: GET /api/livekit-token/test?room=test-room&username=test-user
 * 
 * This endpoint helps diagnose token generation issues
 */

import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const room = searchParams.get('room') || 'test-room'
    const username = searchParams.get('username') || 'test-user'

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

    const diagnostics = {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasWsUrl: !!wsUrl,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0,
      wsUrl: wsUrl ? wsUrl.replace(/\/\/.*@/, '//***@') : null, // Hide credentials
      room,
      username,
      errors: [] as string[]
    }

    if (!apiKey) {
      diagnostics.errors.push('LIVEKIT_API_KEY is missing')
    }
    if (!apiSecret) {
      diagnostics.errors.push('LIVEKIT_API_SECRET is missing')
    }
    if (!wsUrl) {
      diagnostics.errors.push('NEXT_PUBLIC_LIVEKIT_URL is missing')
    }

    if (diagnostics.errors.length > 0) {
      return NextResponse.json({
        success: false,
        diagnostics,
        message: 'Missing required environment variables'
      }, { status: 400 })
    }

    // Try to generate a token
    try {
      const at = new AccessToken(apiKey!, apiSecret!, {
        identity: username,
        ttl: '1h',
      })

      at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: true,
        canSubscribe: true,
      })

      const token = await at.toJwt()

      // Decode token to verify
      let tokenPayload: any = null
      try {
        const tokenParts = token.split('.')
        if (tokenParts.length === 3) {
          tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        }
      } catch (e) {
        // Ignore decode errors
      }

      return NextResponse.json({
        success: true,
        diagnostics,
        token: {
          length: token.length,
          prefix: token.substring(0, 30) + '...',
          payload: tokenPayload ? {
            identity: tokenPayload.sub,
            room: tokenPayload.video?.room,
            canPublish: tokenPayload.video?.canPublish,
            canSubscribe: tokenPayload.video?.canSubscribe,
            expiresAt: tokenPayload.exp ? new Date(tokenPayload.exp * 1000).toISOString() : null,
            issuedAt: tokenPayload.iat ? new Date(tokenPayload.iat * 1000).toISOString() : null
          } : null
        },
        message: 'Token generated successfully. Verify API key/secret match your LiveKit server configuration.'
      })
    } catch (tokenError: any) {
      return NextResponse.json({
        success: false,
        diagnostics,
        error: {
          message: tokenError?.message,
          name: tokenError?.name,
          stack: tokenError?.stack
        },
        message: 'Token generation failed. Check API key/secret format and LiveKit server configuration.'
      }, { status: 500 })
    }
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

