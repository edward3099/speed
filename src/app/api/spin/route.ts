import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Join queue
    const { data: joined, error: joinError } = await supabase.rpc('join_queue', {
      p_user_id: user.id
    })
    
    if (joinError) {
      console.error('Error joining queue:', joinError)
      return NextResponse.json({ error: joinError.message }, { status: 400 })
    }
    
    if (!joined) {
      return NextResponse.json({ 
        error: 'Cannot join queue - you may be offline or in cooldown' 
      }, { status: 400 })
    }
    
    // Trigger matching process
    const { data: matchCount, error: matchError } = await supabase.rpc('process_matching')
    
    if (matchError) {
      console.error('Error in matching:', matchError)
      // Don't fail - user is still in queue
    }
    
    // Check if we got matched
    const { data: match } = await supabase.rpc('get_active_match', {
      p_user_id: user.id
    })
    
    if (match && match.length > 0) {
      return NextResponse.json({ 
        success: true, 
        matched: true,
        match: match[0]
      })
    }
    
    // Get queue status
    const { data: queueStatus } = await supabase.rpc('get_queue_status', {
      p_user_id: user.id
    })
    
    return NextResponse.json({ 
      success: true, 
      matched: false,
      queue: queueStatus?.[0] || null
    })
  } catch (error: unknown) {
    console.error('Spin error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
