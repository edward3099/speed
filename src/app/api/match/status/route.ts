import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/match/status
 * 
 * Simple status endpoint for polling
 * Returns current match status and info
 */
export async function GET(request: NextRequest) {
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
    
    // Update last_active to keep user "online" while polling
    await supabase
      .from('users_state')
      .update({ 
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
    
    // Call get_user_match_status function
    const { data: statusData, error: statusError } = await supabase.rpc('get_user_match_status', {
      p_user_id: user.id
    })
    
    if (statusError) {
      console.error('Error getting match status:', statusError)
      return NextResponse.json(
        { error: 'Failed to get match status', details: statusError.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(statusData)
    
  } catch (error: any) {
    console.error('Error in /api/match/status:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

