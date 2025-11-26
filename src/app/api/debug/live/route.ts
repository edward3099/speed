import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Live monitoring endpoint for debugging
 * Returns the latest 200 events from debug_logs
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('debug_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching debug logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch debug logs', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      logs: data || [],
    })
  } catch (error) {
    console.error('Unexpected error in /api/debug/live:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

