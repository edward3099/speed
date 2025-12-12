import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const room = searchParams.get('room')
    const username = searchParams.get('username')

    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing "room" or "username" query parameter' },
        { status: 400 }
      )
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      if (process.env.NODE_ENV === 'development') {
        console.error('LiveKit credentials missing:', {
          hasApiKey: !!apiKey,
          hasApiSecret: !!apiSecret,
          apiKeyLength: apiKey?.length || 0,
          apiSecretLength: apiSecret?.length || 0
        })
      }
      return NextResponse.json(
        { error: 'Server misconfigured: Missing LiveKit credentials' },
        { status: 500 }
      )
    }

    // Validate inputs
    if (!room || !username) {
      return NextResponse.json(
        { error: 'Missing "room" or "username" query parameter' },
        { status: 400 }
      )
    }

    // Validate room name format (alphanumeric, hyphens, underscores only)
    const roomNameRegex = /^[a-zA-Z0-9_-]+$/
    if (!roomNameRegex.test(room)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Invalid room name format:', room)
      }
      return NextResponse.json(
        { error: 'Invalid room name format' },
        { status: 400 }
      )
    }

    try {
      // Create token following LiveKit's official pattern
      // Reference: https://github.com/livekit/node-sdks/blob/main/packages/livekit-server-sdk/README.md
      const at = new AccessToken(apiKey, apiSecret, {
        identity: username,
        // TTL is optional - default is 6h, but we set it explicitly for clarity
        ttl: '6h',
      })

      // Add grant for room access - this is required
      at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: true,
        canSubscribe: true,
      })

      // Generate JWT token (async in v2.x)
      const token = await at.toJwt()
      
      // Validate token was generated
      if (!token || typeof token !== 'string' || token.length === 0) {
        console.error('Token generation returned empty/invalid token')
        return NextResponse.json(
          { error: 'Failed to generate valid token' },
          { status: 500 }
        )
      }
      
      // Decode token to verify structure (for debugging - don't expose in production)
      let tokenPayload: any = null
      try {
        const tokenParts = token.split('.')
        if (tokenParts.length === 3) {
          // Decode JWT payload (second part)
          tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        }
      } catch (decodeError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Could not decode token for verification:', decodeError)
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ LiveKit token generated successfully', {
          room,
          username,
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 20) + '...',
          tokenPayload: tokenPayload ? {
            sub: tokenPayload.sub, // identity
            video: tokenPayload.video, // grants
            exp: tokenPayload.exp,
            iat: tokenPayload.iat
          } : null
        })
      }
      
      return NextResponse.json({ 
        token,
        expiresIn: 21600, // 6 hours in seconds for client-side tracking
        // Include debug info in development only
        ...(process.env.NODE_ENV === 'development' && tokenPayload ? {
          debug: {
            identity: tokenPayload.sub,
            room: tokenPayload.video?.room,
            canPublish: tokenPayload.video?.canPublish,
            canSubscribe: tokenPayload.video?.canSubscribe,
            expiresAt: new Date(tokenPayload.exp * 1000).toISOString()
          }
        } : {})
      })
    } catch (tokenError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating LiveKit token:', {
          error: tokenError,
          message: tokenError?.message,
          stack: tokenError?.stack,
          room,
          username,
          hasApiKey: !!apiKey,
          hasApiSecret: !!apiSecret
        })
      }
      return NextResponse.json(
        { 
          error: 'Failed to generate token',
          details: tokenError?.message || 'Unknown error'
        },
        { status: 500 }
      )
    }
    } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error generating LiveKit token:', error)
    }
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}

