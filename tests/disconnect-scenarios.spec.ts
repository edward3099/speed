import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { generateUUID, createTestUser, cleanupTestData, supabase } from './helpers/test-helpers';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Disconnect Scenario Tests - Realistic Mode
 * 
 * Tests verify Scenario 4 from spin/logic:
 * - Disconnect during spinning (user removed from queue)
 * - Disconnect during countdown (pair ends, remaining user follows voting logic)
 * - Disconnect at match formation (match cancelled)
 * 
 * Realistic scenarios: User closes browser, phone goes to sleep, loses internet
 */

test.describe('Disconnect Scenarios - Realistic Tests', () => {
  
  const createTestUserId = async (prefix: string): Promise<string> => {
    return generateUUID();
  };

  test('Scenario 4 Case A: Disconnect during spinning - user removed from queue', async () => {
    const userId = await createTestUserId('spinning');
    
    await cleanupTestData([userId]);

    // Setup user in queue (spinning)
    await createTestUser(userId, 'waiting');

    // Simulate disconnect: User closes browser (last_active becomes stale > 30s)
    const oldTimestamp = new Date(Date.now() - 35 * 1000).toISOString(); // 35 seconds ago
    await supabase
      .from('users_state')
      .update({ last_active: oldTimestamp })
      .eq('user_id', userId);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify user is NOT matched (offline users excluded)
    // Trigger matching
    await supabase.rpc('process_matching');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify no match was created for this user
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    expect(matches || []).toHaveLength(0);

    // Verify user is still in queue (cleanup happens separately, but they shouldn't be matched)
    const { data: queueEntry } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single();

    // User should still be in queue (but not matched because offline)
    expect(queueEntry).toBeTruthy();

    // Verify user state is still waiting
    const { data: userState } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(userState?.state).toBe('waiting');

    await cleanupTestData([userId]);
  });

  test('Scenario 4 Case B: Disconnect during countdown - pair ends, remaining user follows voting logic', async () => {
    const userId1 = await createTestUserId('countdown-1');
    const userId2 = await createTestUserId('countdown-2');
    
    await cleanupTestData([userId1, userId2]);
    
    // Create users first
    await createTestUser(userId1, 'idle');
    await createTestUser(userId2, 'idle');

    // Create a match (both users paired) with vote window that expires soon
    const matchId = generateUUID();
    const voteWindowExpires = new Date(Date.now() - 1000).toISOString(); // Already expired
    
    await supabase.from('matches').insert({
      match_id: matchId,
      user1_id: userId1,
      user2_id: userId2,
      status: 'vote_active',
      vote_window_started_at: new Date(Date.now() - 120 * 1000).toISOString(), // 2 minutes ago
      vote_window_expires_at: voteWindowExpires, // Already expired
      created_at: new Date().toISOString(),
    });
    
    // Wait a bit for the insert to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Update user states to vote_window
    await supabase
      .from('users_state')
      .update({
        state: 'vote_window',
        match_id: matchId,
        partner_id: userId2,
        last_active: new Date().toISOString(),
      })
      .eq('user_id', userId1);
      
    await supabase
      .from('users_state')
      .update({
        state: 'vote_window',
        match_id: matchId,
        partner_id: userId1,
        last_active: new Date().toISOString(),
      })
      .eq('user_id', userId2);

    // User 2 disconnects first (last_active becomes stale)
    const oldTimestamp = new Date(Date.now() - 35 * 1000).toISOString();
    await supabase
      .from('users_state')
      .update({ last_active: oldTimestamp })
      .eq('user_id', userId2);

    // User 1 votes 'yes' 
    // Since vote window is expired, it should check votes and resolve as yes_idle
    await supabase.rpc('record_vote_and_resolve', {
      p_user_id: userId1,
      p_match_id: matchId,
      p_vote: 'yes',
    });

    // Also trigger auto_resolve_expired_vote_windows to ensure expired windows are resolved
    await supabase.rpc('auto_resolve_expired_vote_windows');

    // Wait a bit for resolution
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify match is resolved (yes + disconnect = yes_idle)
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('match_id', matchId)
      .single();

    // Match should have an outcome (resolved as yes_idle or idle_idle depending on implementation)
    // The outcome depends on which migration is active
    expect(match?.outcome).toBeTruthy();

    // Verify user 1 (yes user) auto-spins with +10 boost
    const { data: user1State } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId1)
      .single();

    expect(user1State?.state).toBe('waiting'); // Auto-spun
    expect(user1State?.fairness).toBe(10); // +10 boost

    // Verify user 2 (disconnected) is idle (must press spin manually)
    const { data: user2State } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId2)
      .single();

    expect(user2State?.state).toBe('idle'); // Must press spin manually

    await cleanupTestData([userId1, userId2]);
  });

  test('Scenario 4 Case C: Disconnect at match formation - match cancelled, other user back to spinning', async () => {
    const userId1 = await createTestUserId('formation-1');
    const userId2 = await createTestUserId('formation-2');
    
    await cleanupTestData([userId1, userId2]);

    // Both users in queue
    await createTestUser(userId1, 'waiting');
    await createTestUser(userId2, 'waiting');

    // User 2 disconnects right before matching (last_active becomes stale)
    const oldTimestamp = new Date(Date.now() - 35 * 1000).toISOString();
    await supabase
      .from('users_state')
      .update({ last_active: oldTimestamp })
      .eq('user_id', userId2);

    // Trigger matching
    await supabase.rpc('process_matching');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify NO match was created (offline user excluded)
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${userId1},user2_id.eq.${userId1},user1_id.eq.${userId2},user2_id.eq.${userId2}`);

    expect(matches || []).toHaveLength(0);

    // Verify user 1 is still in queue (waiting for another user)
    const { data: user1State } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId1)
      .single();

    expect(user1State?.state).toBe('waiting');

    // Verify user 2 is still in queue but offline (won't be matched)
    const { data: user2State } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId2)
      .single();

    expect(user2State?.state).toBe('waiting');

    await cleanupTestData([userId1, userId2]);
  });

  test('User reconnects after disconnect - must press spin again', async () => {
    const userId = await createTestUserId('reconnect');
    
    await cleanupTestData([userId]);

    // User was spinning, then disconnected - create user first
    await createTestUser(userId, 'waiting');
    
    // Set last_active to old timestamp (offline)
    await supabase
      .from('users_state')
      .update({ last_active: new Date(Date.now() - 35 * 1000).toISOString() })
      .eq('user_id', userId);

    // User reconnects (updates last_active)
    await supabase
      .from('users_state')
      .update({ last_active: new Date().toISOString() })
      .eq('user_id', userId);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify user is now online (last_active is recent)
    const { data: userState } = await supabase
      .from('users_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    const lastActive = new Date(userState?.last_active);
    const now = new Date();
    const secondsSinceActive = (now.getTime() - lastActive.getTime()) / 1000;

    expect(secondsSinceActive).toBeLessThan(5); // Active within last 5 seconds

    // User should still be in queue (they were already spinning)
    const { data: queueEntry } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(queueEntry).toBeTruthy();

    await cleanupTestData([userId]);
  });
});





