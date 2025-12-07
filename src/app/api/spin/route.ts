import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logApi, profiler } from '@/lib/debug'

/**
 * POST /api/spin
 * 
 * Simple spin endpoint - adds user to queue
 * Calls join_queue SQL function
 */
export async function POST(request: NextRequest) {
  try {
    logApi.info('Spin request received')
    
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logApi.warn('Unauthorized spin request', { authError: authError?.message })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    logApi.info('User joining queue', { userId: user.id })
    
    // Call join_queue function with performance measurement
    const { error: joinError } = await profiler.measure('join-queue-rpc', async () => {
      return await supabase.rpc('join_queue', {
        p_user_id: user.id
      })
    }, { userId: user.id })
    
    if (joinError) {
      logApi.error('Error joining queue', { 
        error: joinError.message, 
        userId: user.id,
        details: joinError 
      })
      console.error('Error joining queue:', joinError)
      return NextResponse.json(
        { error: 'Failed to join queue', details: joinError.message },
        { status: 500 }
      )
    }
    
    logApi.info('User joined queue successfully', { userId: user.id })
    
    return NextResponse.json({
      success: true,
      message: 'Joined queue successfully'
    })
    
  } catch (error: any) {
    logApi.error('Error in /api/spin', { 
      error: error.message, 
      stack: error.stack 
    })
    
    console.error('Error in /api/spin:', error)
    
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}

