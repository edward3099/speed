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
    
    // Get vote from request body
    const body = await request.json()
    const { match_id, vote } = body
    
    if (!match_id || !vote) {
      return NextResponse.json({ error: 'match_id and vote are required' }, { status: 400 })
    }
    
    if (!['yes', 'pass'].includes(vote)) {
      return NextResponse.json({ error: 'vote must be "yes" or "pass"' }, { status: 400 })
    }
    
    // Record vote
    const { data: result, error: voteError } = await supabase.rpc('record_vote', {
      p_user_id: user.id,
      p_match_id: match_id,
      p_vote: vote
    })
    
    if (voteError) {
      console.error('Error recording vote:', voteError)
      return NextResponse.json({ error: voteError.message }, { status: 400 })
    }
    
    // If outcome is spin_active (yes voter respins), trigger matching
    if (result?.your_state === 'spin_active') {
      await supabase.rpc('process_matching')
    }
    
    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Vote error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
