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
    const { data, error } = await supabase.rpc('join_queue', {
      p_user_id: user.id
    })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    if (!data) {
      return NextResponse.json({ error: 'Cannot join queue (offline, cooldown, or already in queue)' }, { status: 400 })
    }
    
    // Trigger matching process
    await supabase.rpc('process_matching')
    
    return NextResponse.json({ success: true, message: 'Joined queue' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
