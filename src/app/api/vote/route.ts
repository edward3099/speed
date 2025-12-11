import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateRequestBody, validateEnum, validateUUID } from '@/lib/request-validation'
import { handleApiError } from '@/lib/api-error-handler'
import { cache, CacheKeys } from '@/lib/cache/simple-cache'

/**
 * POST /api/vote
 * 
 * Simple vote endpoint
 * Records vote and resolves outcome
 */
export async function POST(request: NextRequest) {
  console.log('🔵 /api/vote called')
  
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('❌ /api/vote: Unauthorized', { authError: authError?.message })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('✅ /api/vote: User authenticated', { userId: user.id })
    
    // Get and validate vote data from request body
    const body = await request.json()
    console.log('📥 /api/vote: Request body', { match_id: body.match_id, vote: body.vote })
    
    // Validate required fields
    const bodyValidation = validateRequestBody(body, ['match_id', 'vote'])
    if (!bodyValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: bodyValidation.errors },
        { status: 400 }
      )
    }
    
    const { match_id, vote } = body
    
    // Validate match_id is a valid UUID
    const uuidValidation = validateUUID(match_id, 'match_id')
    if (!uuidValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: uuidValidation.errors },
        { status: 400 }
      )
    }
    
    // Validate vote is one of allowed values
    const voteValidation = validateEnum(vote, ['yes', 'pass'] as const, 'vote')
    if (!voteValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: voteValidation.errors },
        { status: 400 }
      )
    }
    
    // Get match info first to know both user IDs for cache invalidation
    const { data: matchInfo } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('match_id', match_id)
      .single()
    
    // Call record_vote function (new zero-issues architecture)
    console.log('🔄 /api/vote: Calling record_vote RPC', { user_id: user.id, match_id, vote })
    
    const { data: voteData, error: voteError } = await supabase.rpc('record_vote', {
      p_user_id: user.id,
      p_match_id: match_id,
      p_vote: vote
    })
    
    console.log('📊 /api/vote: RPC response', { voteData, voteError: voteError?.message, voteErrorCode: voteError?.code })
    
    // Invalidate cache for both users in the match when vote is recorded
    // This ensures polling detects vote changes immediately
    if (matchInfo) {
      // Invalidate cache for both users (regardless of vote error - cache should be cleared)
      cache.delete(CacheKeys.userMatchStatus(matchInfo.user1_id))
      cache.delete(CacheKeys.userMatchStatus(matchInfo.user2_id))
      console.log('🗑️ /api/vote: Cache invalidated for both users')
    }
    
    if (voteError) {
      console.error('❌ /api/vote: Vote error', { 
        message: voteError.message,
        code: voteError.code,
        details: voteError.details,
        hint: voteError.hint
      })
      // Extract error message from various possible locations
      const errorMessage = 
        voteError.message || 
        (voteError as any)?.error?.message ||
        voteError.details || 
        (voteError as any)?.error?.details ||
        (voteError as any)?.error ||
        String(voteError) ||
        'Unknown error occurred while recording vote'
      
      const errorHint = voteError.hint || (voteError as any)?.error?.hint || null
      const errorCode = voteError.code || (voteError as any)?.error?.code || null
      
      // Log error with context
      handleApiError(voteError, {
        route: '/api/vote',
        userId: user.id,
        metadata: { match_id, vote, errorHint, errorCode },
      })
      
      return NextResponse.json(
        { 
          error: 'Failed to record vote', 
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
          ...(process.env.NODE_ENV === 'development' && { hint: errorHint, code: errorCode }),
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(voteData)
    
  } catch (error: unknown) {
    const { status, response } = handleApiError(error, {
      route: '/api/vote',
    })
    return NextResponse.json(response, { status })
  }
}

