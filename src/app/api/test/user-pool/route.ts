/**
 * USER POOL ENDPOINT: /api/test/user-pool
 * 
 * Returns available test users from the pool
 * Used by k6 tests to get pre-created users
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

export async function GET(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const count = parseInt(searchParams.get('count') || '10', 10)
    const gender = searchParams.get('gender') || null

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get test users by name pattern (email is in auth.users, not profiles)
    let query = supabase
      .from('profiles')
      .select('id, gender, name')
      .eq('onboarding_completed', true)
      .like('name', 'Test User%')
      .limit(count * 2) // Get more to ensure we have enough

    if (gender) {
      query = query.eq('gender', gender)
    }

    const { data: users, error } = await query
    
    if (error) {
      throw error
    }
    
    // Filter to ensure we have test users and limit to requested count
    const testUsers = (users || []).filter(u => u.name?.startsWith('Test User')).slice(0, count)
    
    return NextResponse.json({
      success: true,
      count: testUsers.length,
      user_ids: testUsers.map(u => u.id)
    })

  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in /api/test/user-pool:', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    }
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
