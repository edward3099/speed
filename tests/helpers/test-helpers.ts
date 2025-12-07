import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Test Helper Functions
 * Shared utilities for all test files
 */

// Use service role client to bypass RLS for test data creation
// Service role key bypasses RLS policies, allowing us to create test data
export const supabase = createClient(
  supabaseUrl, 
  supabaseServiceKey || supabaseAnonKey
);

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a test user with profile and initial state
 */
export async function createTestUser(userId: string, initialState: 'idle' | 'waiting' = 'idle') {
  // Check if profile already exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();
  
  // Create profile first (required by foreign key for users_state and queue)
  if (!existingProfile) {
    // Check if auth user exists
    let authUser = null;
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      authUser = data?.user;
    } catch (e) {
      // User doesn't exist, will create
    }
    
    // Create auth user if it doesn't exist (required by profiles foreign key)
    if (!authUser) {
      const email = `test-${userId.substring(0, 8)}@test.com`;
      const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
        id: userId, // Use the provided userId
        email: email,
        password: 'test-password-123',
        email_confirm: true,
        user_metadata: { test_user: true },
      });
      
      if (createUserError) {
        throw new Error(`Failed to create auth user: ${createUserError.message}`);
      }
      
      // Wait a bit for foreign key constraint to be satisfied
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Create profile (now that auth user exists)
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      name: `Test User ${userId.substring(0, 8)}`,
      age: 25,
      gender: 'male',
      onboarding_completed: true,
      created_at: new Date().toISOString(),
    });
    
    // If profile creation failed (and not duplicate), throw error
    if (profileError && profileError.code !== '23505') { // 23505 = unique violation
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }
    
    // Wait a bit for foreign key constraint to be satisfied
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Create user state
  const { error: stateError } = await supabase.from('users_state').insert({
    user_id: userId,
    state: initialState,
    last_active: new Date().toISOString(),
    fairness: 0,
  });
  
  // If state already exists, update it
  if (stateError && stateError.code === '23505') {
    await supabase
      .from('users_state')
      .update({
        state: initialState,
        last_active: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else if (stateError) {
    throw new Error(`Failed to create user state: ${stateError.message}`);
  }
  
  // If waiting, add to queue
  if (initialState === 'waiting') {
    const { error: queueError } = await supabase.from('queue').insert({
      user_id: userId,
      fairness: 0,
      waiting_since: new Date().toISOString(),
      preference_stage: 0,
    });
    
    // If queue entry already exists, update it
    if (queueError && queueError.code === '23505') {
      await supabase
        .from('queue')
        .update({
          waiting_since: new Date().toISOString(),
          preference_stage: 0,
        })
        .eq('user_id', userId);
    } else if (queueError) {
      throw new Error(`Failed to create queue entry: ${queueError.message}`);
    }
  }
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(userIds: string[]) {
  // Clean up in reverse order of dependencies
  // First, delete votes
  try {
    await supabase.from('votes').delete().in('voter_id', userIds);
  } catch (e) {
    // Table might not exist
  }
  
  // Delete matches (this prevents "matched before" checks from blocking new matches)
  try {
    await supabase.from('matches').delete().or(
      `user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`
    );
  } catch (e) {
    // Ignore errors
  }
  
  // Delete from never_pair_again if table exists
  try {
    await supabase.from('never_pair_again').delete().or(
      `user1.in.(${userIds.join(',')}),user2.in.(${userIds.join(',')})`
    );
  } catch (e) {
    // Table might not exist, ignore
  }
  
  // Delete user state and queue
  await supabase.from('users_state').delete().in('user_id', userIds);
  await supabase.from('queue').delete().in('user_id', userIds);
  
  // Delete profiles
  await supabase.from('profiles').delete().in('id', userIds);
  
  // Clean up auth users (using admin API)
  for (const userId of userIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      // Ignore errors (user may not exist)
    }
  }
}





