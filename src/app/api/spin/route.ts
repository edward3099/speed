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
    
    // Ensure user is marked as online and clear cooldown before joining
    await supabase
      .from('profiles')
      .update({ 
        online: true,
        cooldown_until: null,
        last_active_at: new Date().toISOString()
      })
      .eq('id', user.id)
    
    // Remove from queue if already in queue (to allow re-joining)
    await supabase.rpc('remove_from_queue', { p_user_id: user.id })
    
    // Join queue
    const { data: joined, error: joinError } = await supabase.rpc('join_queue', {
      p_user_id: user.id
    })
    
    if (joinError) {
      console.error('Error joining queue:', joinError)
      return NextResponse.json({ error: joinError.message }, { status: 400 })
    }
    
    if (!joined) {
      // Check why join failed for better error message
      const { data: profile } = await supabase
        .from('profiles')
        .select('online, cooldown_until')
        .eq('id', user.id)
        .single()
      
      const { data: inQueue } = await supabase
        .from('queue')
        .select('user_id')
        .eq('user_id', user.id)
        .single()
      
      let reason = 'unknown reason'
      if (inQueue) {
        reason = 'already in queue'
      } else if (profile && !profile.online) {
        reason = 'user is offline'
      } else if (profile && profile.cooldown_until && new Date(profile.cooldown_until) > new Date()) {
        reason = `in cooldown until ${new Date(profile.cooldown_until).toLocaleTimeString()}`
      }
      
      return NextResponse.json({ 
        error: `Cannot join queue - ${reason}` 
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
