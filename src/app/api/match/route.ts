import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get active match
    const { data: match, error: matchError } = await supabase.rpc('get_active_match', {
      p_user_id: user.id
    })
    
    if (matchError) {
      console.error('Error getting match:', matchError)
      return NextResponse.json({ error: matchError.message }, { status: 400 })
    }
    
    if (match && match.length > 0) {
      return NextResponse.json({ 
        matched: true,
        match: match[0]
      })
    }
    
    // Get queue status
    const { data: queueStatus } = await supabase.rpc('get_queue_status', {
      p_user_id: user.id
    })
    
    return NextResponse.json({ 
      matched: false,
      queue: queueStatus?.[0] || null
    })
  } catch (error: unknown) {
    console.error('Match check error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
