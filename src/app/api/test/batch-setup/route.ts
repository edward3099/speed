/**
 * BATCH SETUP ENDPOINT: /api/test/batch-setup
 * 
 * Pre-creates a pool of test users for load testing
 * This avoids creating users on every request
 * 
 * Run once before tests: POST /api/test/batch-setup?count=1000
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireTestApiKey } from '@/lib/middleware/test-endpoint-auth'

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production'

export async function POST(request: NextRequest) {
  // Check API key authentication (required in production)
  const authResult = requireTestApiKey(request)
  if (authResult) {
    return authResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const count = parseInt(searchParams.get('count') || '1000', 10)
    const genderRatio = parseFloat(searchParams.get('genderRatio') || '0.714') // 500/700 = 0.714

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const createdUsers: string[] = []
    const errors: string[] = []

    // Create users in batches of 50 for efficiency
    const batchSize = 50
    const batches = Math.ceil(count / batchSize)

    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * batchSize
      const batchEnd = Math.min(batchStart + batchSize, count)
      
      const batchPromises = []
      
      for (let i = batchStart; i < batchEnd; i++) {
        const gender = Math.random() < genderRatio ? 'male' : 'female'
        
        batchPromises.push(
          createTestUser(supabase, '', gender, i)
            .then((actualUserId) => {
              if (actualUserId) {
                createdUsers.push(actualUserId)
              }
            })
            .catch((error) => {
              errors.push(`User ${i}: ${error.message}`)
            })
        )
      }
      
      await Promise.all(batchPromises)
      
      // Small delay between batches to avoid overwhelming the database
      if (batch < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return NextResponse.json({
      success: true,
      created: createdUsers.length,
      errors: errors.length,
      user_ids: createdUsers.slice(0, 100), // Return first 100 IDs as sample
      message: `Created ${createdUsers.length} test users. ${errors.length} errors.`
    })

  } catch (error: any) {
    console.error('Error in /api/test/batch-setup:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

async function createTestUser(supabase: any, userId: string, gender: string, index: number) {
  try {
    // Check if user already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (existingProfile) {
      return // User already exists
    }

    // Check if auth user exists (with error handling)
    let authUser = null
    try {
      const { data } = await supabase.auth.admin.getUserById(userId)
      authUser = data?.user
    } catch (e) {
      // User doesn't exist, will create
    }
    
    if (!authUser) {
      // Create auth user (without specifying ID - let Supabase generate it)
      // Then we'll update the profile to match
      const email = `k6-test-${index}-${Date.now()}@test.com`
      const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: email,
        password: 'test-password-123',
        email_confirm: true,
        user_metadata: { test_user_id: userId }
      })

      if (createUserError) {
        throw new Error(`Auth user creation failed: ${createUserError.message}`)
      }

      // Use the generated user ID
      const actualUserId = newUser.user.id
      
      // Create profile with actual user ID
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: actualUserId,
          name: `Test User ${index}`,
          age: 25 + Math.floor(Math.random() * 15),
          bio: 'k6 test user',
          photo: '',
          gender: gender,
          onboarding_completed: true,
        })

      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`)
      }
      
      return actualUserId
    } else {
      // Auth user exists, just create/update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          name: `Test User ${index}`,
          age: 25 + Math.floor(Math.random() * 15),
          bio: 'k6 test user',
          photo: '',
          gender: gender,
          onboarding_completed: true,
        })
        .select()

      if (profileError) {
        // Try update instead
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            name: `Test User ${index}`,
            age: 25 + Math.floor(Math.random() * 15),
            gender: gender,
            onboarding_completed: true,
          })
          .eq('id', userId)

        if (updateError) {
          throw new Error(`Profile update failed: ${updateError.message}`)
        }
      }
      
      return userId
    }
  } catch (error: any) {
    throw error
  }
}

