import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { match_id, vote_type } = body
    
    if (!match_id || !vote_type || !['yes', 'pass'].includes(vote_type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    
    // Record vote
    const { data, error } = await supabase.rpc('record_vote', {
      p_user_id: user.id,
      p_match_id: match_id,
      p_vote_type: vote_type
    })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    // If outcome requires respin, trigger matching
    if (data?.outcome === 'yes_pass' || data?.outcome === 'both_pass') {
      await supabase.rpc('process_matching')
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
