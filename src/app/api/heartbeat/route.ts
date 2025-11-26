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
    
    // Update heartbeat
    const { error } = await supabase
      .from('users')
      .update({ 
        online: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    // Update user_status heartbeat
    await supabase
      .from('user_status')
      .update({ 
        last_heartbeat: new Date().toISOString(),
        online_status: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
