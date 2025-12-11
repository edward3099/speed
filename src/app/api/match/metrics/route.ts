import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateRequestBody, validateUUID } from '@/lib/request-validation'
import { handleApiError } from '@/lib/api-error-handler'

/**
 * POST /api/match/metrics
 * 
 * Records vote window metrics for monitoring
 * Used by frontend to track user experience
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
    
    const body = await request.json()
    
    // Validate required fields
    const bodyValidation = validateRequestBody(body, ['match_id', 'metric_type'])
    if (!bodyValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: bodyValidation.errors },
        { status: 400 }
      )
    }
    
    const { match_id, metric_type, value } = body
    
    // Validate match_id
    const uuidValidation = validateUUID(match_id, 'match_id')
    if (!uuidValidation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: uuidValidation.errors },
        { status: 400 }
      )
    }
    
    // Validate metric_type
    const validTypes = ['window_seen', 'window_expired_before_seen', 'redirect_delay_ms', 'acknowledged', 'voted', 'window_expired_after_see']
    if (!validTypes.includes(metric_type)) {
      return NextResponse.json(
        { error: 'Invalid metric_type', valid_types: validTypes },
        { status: 400 }
      )
    }
    
    // Verify user is part of this match
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('user1_id, user2_id')
      .eq('match_id', match_id)
      .single()
    
    if (matchError || !match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      )
    }
    
    if (match.user1_id !== user.id && match.user2_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - not part of this match' },
        { status: 403 }
      )
    }
    
    // Record metric
    const { error: insertError } = await supabase
      .from('vote_window_metrics')
      .insert({
        match_id,
        user_id: user.id,
        metric_type,
        value: value || null
      })
    
    if (insertError) {
      handleApiError(insertError, {
        route: '/api/match/metrics',
        userId: user.id,
        metadata: { match_id, metric_type },
      })
      return NextResponse.json(
        { error: 'Failed to record metric' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error: unknown) {
    const { status, response } = handleApiError(error, {
      route: '/api/match/metrics',
    })
    return NextResponse.json(response, { status })
  }
}
