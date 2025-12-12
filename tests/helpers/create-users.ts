/**
 * Helper to create test users via backend (Supabase Admin API)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for creating test users. Make sure .env.local is configured.')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export interface TestUser {
  email: string
  password: string
  userId: string
  name: string
  gender: 'male' | 'female'
}

/**
 * Create a test user via backend
 */
export async function createTestUser(
  email: string,
  password: string,
  name: string,
  gender: 'male' | 'female'
): Promise<TestUser> {
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    throw new Error(`Failed to create auth user: ${authError.message}`)
  }

  if (!authData.user) {
    throw new Error('User creation returned no user')
  }

  const userId = authData.user.id

  // Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      name,
      gender,
      age: 25,
      bio: `Test user - ${name}`,
      photo: '',
      onboarding_completed: true,
    })

  if (profileError) {
    // Try to clean up auth user if profile creation fails
    await supabase.auth.admin.deleteUser(userId).catch(() => {})
    throw new Error(`Failed to create profile: ${profileError.message}`)
  }

  // Initialize user state (optional, but good for testing)
  try {
    await supabase
      .from('users_state')
      .upsert({
        user_id: userId,
        state: 'idle',
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
  } catch {
    // Ignore errors - might already exist
  }

  return {
    email,
    password,
    userId,
    name,
    gender,
  }
}

/**
 * Clean up test user (delete auth user and profile)
 */
export async function deleteTestUser(userId: string): Promise<void> {
  // Delete auth user (cascade should handle profile and state)
  await supabase.auth.admin.deleteUser(userId).catch(() => {
    // Ignore errors
  })
}
