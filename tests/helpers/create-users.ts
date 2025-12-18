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
  gender: 'male' | 'female',
  age?: number
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
  // Note: location is for display only - matching uses user_preferences.city
  // Set a default location so partner info displays correctly
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      name,
      gender,
      age: age ?? 25, // Use provided age or default to 25
      bio: `Test user - ${name}`,
      photo: '',
      location: 'London, United Kingdom', // Default location for display (matching uses user_preferences.city)
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
  // Retry with exponential backoff to handle connection resets
  let retries = 3
  while (retries > 0) {
    try {
      await supabase.auth.admin.deleteUser(userId)
      return
    } catch (error: any) {
      retries--
      if (retries === 0 || error?.code !== 'ECONNRESET') {
        // Ignore errors on final retry or if it's not a connection reset
        return
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)))
    }
  }
}
