/**
 * Schema Adapter
 * 
 * Maps test expectations to actual database schema:
 * - Tests expect `users` table → actual is `profiles` table
 * - Tests expect `user_status.status` → actual is `user_status.state`
 * - Tests expect `queue.joined_at` → actual is `queue.spin_started_at`
 * - Tests expect `never_pair_again.user1_id/user2_id` → actual is `user1/user2`
 * - Tests expect `record_vote(p_vote)` → actual is `record_vote(p_vote_type)`
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Schema mapping helpers
export const schema = {
  // Table names
  users: 'profiles',
  user_status: 'user_status',
  queue: 'queue',
  matches: 'matches',
  votes: 'votes',
  never_pair_again: 'never_pair_again',
  debug_logs: 'debug_logs',

  // Column mappings
  columns: {
    // users/profiles
    is_online: 'online', // profiles has both is_online and online, use online
    
    // user_status
    status: 'state', // user_status.state not status
    
    // queue
    joined_at: 'spin_started_at', // queue.spin_started_at not joined_at
    
    // never_pair_again
    user1_id: 'user1',
    user2_id: 'user2',
    
    // matches
    created_at: 'matched_at', // matches.matched_at not created_at
  },
};

// Helper functions for common operations
export async function createTestUser(gender: 'male' | 'female' = 'male') {
  const email = `test-${crypto.randomUUID()}@test.com`;
  const password = 'testpass123';
  
  // First create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    throw authError;
  }

  if (!authUser?.user?.id) {
    throw new Error('Failed to create auth user: user is null');
  }

  const userId = authUser.user.id;

  // Then create profile
  const { data: user, error: profileError } = await supabase
    .from(schema.users)
    .insert({
      id: userId,
      name: `Test User ${userId.substring(0, 8)}`,
      age: 25,
      gender,
      online: true,
      is_online: true,
    })
    .select()
    .single();

  if (profileError) {
    // Cleanup auth user if profile creation fails
    await supabase.auth.admin.deleteUser(userId);
    console.error('Error creating profile:', profileError);
    throw profileError;
  }

  if (!user) {
    // Cleanup auth user if profile creation fails
    await supabase.auth.admin.deleteUser(userId);
    throw new Error('Failed to create profile: user is null');
  }

  return user;
}

export async function getUserStatus(userId: string) {
  const { data } = await supabase
    .from(schema.user_status)
    .select('state')
    .eq('user_id', userId)
    .single();

  return data?.state;
}

export async function getQueueEntry(userId: string) {
  const { data } = await supabase
    .from(schema.queue)
    .select('*')
    .eq('user_id', userId)
    .single();

  return data;
}

export async function getMatch(userId: string) {
  const { data } = await supabase
    .from(schema.matches)
    .select('*')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .single();

  return data;
}

export async function recordVote(matchId: string, userId: string, vote: 'yes' | 'pass') {
  // Use record_vote which now accepts UUID match_id (fixed in migration)
  const { data, error } = await supabase.rpc('record_vote', {
    p_match_id: matchId,
    p_user_id: userId,
    p_vote_type: vote,
  });

  return { data, error };
}

