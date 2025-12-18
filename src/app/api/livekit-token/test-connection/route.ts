/**
 * Test endpoint to actually attempt a LiveKit connection
 * This validates that API key/secret work with the LiveKit server
 */

import { NextRequest, NextResponse } from 'next/server'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY?.trim()
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim()

    const testResult = {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasWsUrl: !!wsUrl,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0,
      wsUrl: wsUrl || null,
      errors: [] as string[],
      warnings: [] as string[],
      connectionTest: null as any
    }

    // Check for missing variables
    if (!apiKey) {
      testResult.errors.push('LIVEKIT_API_KEY is missing')
    }
    if (!apiSecret) {
      testResult.errors.push('LIVEKIT_API_SECRET is missing')
    }
    if (!wsUrl) {
      testResult.errors.push('NEXT_PUBLIC_LIVEKIT_URL is missing')
    }

    if (testResult.errors.length > 0) {
      return NextResponse.json({
        success: false,
        ...testResult,
        message: 'Missing required environment variables'
      }, { status: 400 })
    }

    // Test 1: Generate a token (this validates key/secret format)
    try {
      const testRoom = 'test-connection-room'
      const testUsername = 'test-connection-user'
      
      const at = new AccessToken(apiKey!, apiSecret!, {
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
      
      testResult.connectionTest = {
        tokenGeneration: {
          success: true,
          tokenLength: token.length,
          note: 'Token generated successfully - API key/secret format is valid'
        }
      }
    } catch (tokenError: any) {
      testResult.errors.push(`Token generation failed: ${tokenError?.message || 'Unknown error'}`)
      return NextResponse.json({
        success: false,
        ...testResult,
        message: 'Token generation failed - API key/secret format is invalid'
      }, { status: 500 })
    }

    // Test 2: Try to use RoomServiceClient to validate credentials
    // This actually connects to LiveKit server and validates the API key/secret
    try {
      const roomService = new RoomServiceClient(wsUrl!, apiKey!, apiSecret!)
      
      // Try to list rooms - this will fail with 401 if credentials are wrong
      // We use a timeout to avoid hanging
      const listRoomsPromise = roomService.listRooms()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection test timeout')), 5000)
      )
      
      try {
        await Promise.race([listRoomsPromise, timeoutPromise])
        testResult.connectionTest.serverValidation = {
          success: true,
          note: 'Successfully connected to LiveKit server - API key/secret are valid'
        }
      } catch (serverError: any) {
        const errorMsg = serverError?.message || String(serverError)
        
        // Check if it's an authentication error
        if (errorMsg.includes('401') || 
            errorMsg.includes('Unauthorized') || 
            errorMsg.includes('invalid') ||
            errorMsg.includes('authentication') ||
            errorMsg.includes('NotAllowed')) {
          testResult.errors.push('Server rejected credentials: API key/secret do not match your LiveKit Cloud project')
          testResult.connectionTest.serverValidation = {
            success: false,
            error: 'Authentication failed (401)',
            note: 'The API key and secret in Vercel do not match your LiveKit Cloud project. Update them in Vercel environment variables.'
          }
        } else if (errorMsg.includes('timeout')) {
          testResult.warnings.push('Connection test timed out - server may be unreachable or URL is incorrect')
          testResult.connectionTest.serverValidation = {
            success: false,
            error: 'Connection timeout',
            note: 'Could not reach LiveKit server. Verify NEXT_PUBLIC_LIVEKIT_URL is correct.'
          }
        } else {
          testResult.warnings.push(`Server connection test failed: ${errorMsg}`)
          testResult.connectionTest.serverValidation = {
            success: false,
            error: errorMsg,
            note: 'Could not validate server connection'
          }
        }
      }
    } catch (clientError: any) {
      testResult.errors.push(`RoomServiceClient creation failed: ${clientError?.message || 'Unknown error'}`)
      testResult.connectionTest.serverValidation = {
        success: false,
        error: clientError?.message,
        note: 'Failed to create RoomServiceClient - check URL format'
      }
    }

    const hasErrors = testResult.errors.length > 0
    const hasWarnings = testResult.warnings.length > 0

    return NextResponse.json({
      success: !hasErrors,
      ...testResult,
      message: hasErrors 
        ? 'Connection test failed - check errors above'
        : hasWarnings
        ? 'Connection test completed with warnings'
        : 'Connection test passed - credentials are valid'
    }, {
      status: hasErrors ? 500 : 200
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























