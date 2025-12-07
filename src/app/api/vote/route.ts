import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/vote
 * 
 * Simple vote endpoint
 * Records vote and resolves outcome
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
    
    // Get vote data from request body
    const body = await request.json()
    const { match_id, vote } = body
    
    if (!match_id) {
      return NextResponse.json(
        { error: 'match_id is required' },
        { status: 400 }
      )
    }
    
    if (!vote || !['yes', 'pass'].includes(vote)) {
      return NextResponse.json(
        { error: 'vote must be "yes" or "pass"' },
        { status: 400 }
      )
    }
    
    // Call record_vote_and_resolve function (if it exists)
    // Otherwise, we'll need to create a simple version
    const { data: voteData, error: voteError } = await supabase.rpc('record_vote_and_resolve', {
      p_user_id: user.id,
      p_match_id: match_id,
      p_vote: vote
    })
    
    if (voteError) {
      // Log the full error object to see what we're getting
      console.error('Error recording vote - FULL ERROR:', JSON.stringify(voteError, null, 2))
      console.error('Error recording vote - error keys:', Object.keys(voteError))
      
      // Try to extract error message from various possible locations
      // Supabase RPC errors can have different structures
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
      
      // Log all error properties for debugging
      const errorInfo = {
        message: errorMessage,
        hint: errorHint,
        code: errorCode,
        fullError: voteError,
        errorType: typeof voteError,
        errorConstructor: voteError?.constructor?.name,
        errorString: String(voteError),
        errorKeys: Object.keys(voteError || {})
      }
      
      console.error('Error recording vote - COMPLETE ERROR INFO:', JSON.stringify(errorInfo, null, 2))
      
      return NextResponse.json(
        { 
          error: 'Failed to record vote', 
          details: errorMessage,
          hint: errorHint,
          code: errorCode,
          error_info: errorInfo // Include full error info for debugging
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(voteData)
    
  } catch (error: any) {
    console.error('Error in /api/vote:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

