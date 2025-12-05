import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/spin
 * 
 * Simple spin endpoint - adds user to queue
 * Calls join_queue SQL function
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
    
    // Call join_queue function
    const { error: joinError } = await supabase.rpc('join_queue', {
      p_user_id: user.id
    })
    
    if (joinError) {
      console.error('Error joining queue:', joinError)
      return NextResponse.json(
        { error: 'Failed to join queue', details: joinError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Joined queue successfully'
    })
    
  } catch (error: any) {
    console.error('Error in /api/spin:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

