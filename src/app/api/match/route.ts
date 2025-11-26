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
    const { data: match, error } = await supabase
      .from('matches')
      .select('*, user1:users!matches_user1_id_fkey(*), user2:users!matches_user2_id_fkey(*)')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq('status', 'vote_active')
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    if (!match) {
      return NextResponse.json({ match: null })
    }
    
    // Get partner info
    const partnerId = match.user1_id === user.id ? match.user2_id : match.user1_id
    
    // Get partner profile (assuming profiles table exists)
    const { data: partnerProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .single()
    
    return NextResponse.json({ 
      match: {
        id: match.id,
        partner: partnerProfile,
        vote_window_expires_at: match.vote_window_expires_at
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
