import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateRequestBody, validateUUID } from '@/lib/request-validation'
import { handleApiError } from '@/lib/api-error-handler'

/**
 * POST /api/match/acknowledge
 * 
 * Simple acknowledge endpoint
 * User acknowledges match, transitions to vote_window when both acknowledge
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get and validate match_id from request body
    const body = await request.json()
    
    // Validate required fields
    const bodyValidation = validateRequestBody(body, ['match_id'])
    if (!bodyValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: bodyValidation.errors },
        { status: 400 }
      )
    }
    
    const { match_id } = body
    
    // Validate match_id is a valid UUID
    const uuidValidation = validateUUID(match_id, 'match_id')
    if (!uuidValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: uuidValidation.errors },
        { status: 400 }
      )
    }
    
    // Call acknowledge_match function (returns vote window expiry time or NULL)
    const { data: voteWindowExpiresAt, error: ackError } = await supabase.rpc('acknowledge_match', {
      p_user_id: user.id,
      p_match_id: match_id
    })
    
    if (ackError) {
      handleApiError(ackError, {
        route: '/api/match/acknowledge',
        userId: user.id,
        metadata: { match_id },
      })
      return NextResponse.json(
        { 
          error: 'Failed to acknowledge match', 
          details: process.env.NODE_ENV === 'development' ? ackError.message : undefined 
        },
        { status: 500 }
      )
    }
    
    // Return vote window expiry time (or null if waiting for partner)
    return NextResponse.json({
      vote_window_expires_at: voteWindowExpiresAt,
      vote_window_active: voteWindowExpiresAt !== null
    })
    
  } catch (error: unknown) {
    const { status, response } = handleApiError(error, {
      route: '/api/match/acknowledge',
    })
    return NextResponse.json(response, { status })
  }
}

