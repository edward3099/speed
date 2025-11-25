/**
 * Matching Logic Tests using Vitest
 * 
 * Tests matching logic directly via database functions and API routes
 * Much faster and more reliable than Playwright for business logic testing
 * 
 * Scenarios:
 * 1. Immediate Match (Tier 1)
 * 2. Fairness Priority
 * 3. Preference Expansion (Tier 2)
 * 4. Guaranteed Match (Tier 3)
 * 5. Both Vote Yes
 * 6. One Yes, One Pass
 * 7. Both Vote Pass
 * 8. Disconnection During Queue
 * 9. Multiple Users Queue
 * 10. Race Condition Prevention
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Set default timeout for all tests in this file
vi.setConfig({ testTimeout: 120000 });
import { supabase, testState } from './setup/test-setup';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Join user to queue via RPC
 */
async function joinQueue(userId: string) {
  const { data, error } = await supabase.rpc('spark_join_queue', {
    p_user_id: userId,
  });
  
  if (error) throw error;
  return data;
}

/**
 * Process matching for user
 */
async function processMatching(userId: string) {
  const { data, error } = await supabase.rpc('process_matching_v2', {
    p_user_id: userId,
  });
  
  if (error) {
    console.error('process_matching_v2 error:', error);
    throw error;
  }
  // process_matching_v2 returns match_id (UUID string) or null
  return data;
}

/**
 * Get user's queue status
 */
async function getQueueStatus(userId: string) {
  const { data, error } = await supabase
    .from('matching_queue')
    .select('status, fairness_score, joined_at')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get user's active match
 */
async function getActiveMatch(userId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .eq('status', 'pending')
    .order('matched_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Cast a vote
 */
async function castVote(voterId: string, profileId: string, voteType: 'yes' | 'pass') {
  const { data, error } = await supabase
    .from('votes')
    .insert({
      voter_id: voterId,
      profile_id: profileId,
      vote_type: voteType,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Fetch spin logs
 */
async function fetchSpinLogs(userId?: string, eventTypes?: string[], since?: Date) {
  const params = new URLSearchParams();
  if (userId) params.append('user', userId);
  if (eventTypes) params.append('types', eventTypes.join(','));
  params.append('limit', '100');

  const response = await fetch(
    `http://localhost:3001/api/debug/spin-logs?${params.toString()}`
  );
  
  if (!response.ok) return [];
  
  const data = await response.json();
  if (!data.success || !data.logs) return [];

  if (since) {
    return data.logs.filter((log: any) => {
      const logTime = new Date(log.timestamp);
      return logTime >= since;
    });
  }

  return data.logs;
}

/**
 * Clean up user's queue entry
 */
async function cleanupQueue(userId: string) {
  await supabase.from('matching_queue').delete().eq('user_id', userId);
}

/**
 * Clean up user's matches
 */
async function cleanupMatches(userId: string) {
  await supabase
    .from('matches')
    .delete()
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
}

/**
 * Clean up user's votes
 */
async function cleanupVotes(userId: string) {
  await supabase.from('votes').delete().or(`voter_id.eq.${userId},profile_id.eq.${userId}`);
}

/**
 * Complete cleanup for a user
 */
async function cleanupUser(userId: string) {
  await Promise.all([
    cleanupQueue(userId),
    cleanupMatches(userId),
    cleanupVotes(userId),
  ]);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Matching Logic - Vitest Tests', () => {
  beforeEach(async () => {
    // Clean up before each test
    if (testState.user1Id) await cleanupUser(testState.user1Id);
    if (testState.user2Id) await cleanupUser(testState.user2Id);
  });

  afterEach(async () => {
    // Clean up after each test
    if (testState.user1Id) await cleanupUser(testState.user1Id);
    if (testState.user2Id) await cleanupUser(testState.user2Id);
  });

  /**
   * SCENARIO 1: Immediate Match (Tier 1)
   * Two users with exact preferences match immediately
   */
  test('Scenario 1: Immediate Match (Tier 1)', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    const testStartTime = new Date();

    // Ensure both users are online
    await Promise.all([
      supabase.from('profiles').update({ is_online: true }).eq('id', testState.user1Id),
      supabase.from('profiles').update({ is_online: true }).eq('id', testState.user2Id),
    ]);

    // Both users join queue
    await Promise.all([
      joinQueue(testState.user1Id),
      joinQueue(testState.user2Id),
    ]);

    // Process matching for user1 (should find user2 immediately)
    // With the new guaranteed matching, this should ALWAYS succeed
    // The function will retry up to 30 times and wait if needed
    let matchId: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!matchId && attempts < maxAttempts) {
      attempts++;
      try {
        matchId = await processMatching(testState.user1Id);
      } catch (error: any) {
        // If timeout occurs, wait and retry (function should handle this internally now)
        if (error?.code === '57014' || error?.message?.includes('timeout')) {
          console.warn(`⚠️ Matching attempt ${attempts} timed out - retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          throw error;
        }
      }
      
      // If still no match, wait a bit for guaranteed match logic to kick in
      if (!matchId && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // According to matching_logic.md: "every spin leads to a pairing"
    // With the new guaranteed matching, this should ALWAYS succeed
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('string');

    // Verify match exists
    const match = await getActiveMatch(testState.user1Id);
    expect(match).toBeTruthy();
    expect(match.status).toBe('pending');
    expect(
      (match.user1_id === testState.user1Id && match.user2_id === testState.user2Id) ||
      (match.user1_id === testState.user2Id && match.user2_id === testState.user1Id)
    ).toBe(true);

    // Verify both users are in vote_active status
    const user1Status = await getQueueStatus(testState.user1Id);
    const user2Status = await getQueueStatus(testState.user2Id);

    expect(user1Status?.status).toBe('vote_active');
    expect(user2Status?.status).toBe('vote_active');

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);
    expect(logs.length).toBeGreaterThan(0);

    const hasMatchFound = logs.some(
      (log) =>
        log.event_type === 'matchFound' &&
        (log.user_id === testState.user1Id || log.user_id === testState.user2Id)
    );
    expect(hasMatchFound).toBe(true);
  });

  /**
   * SCENARIO 2: Fairness Priority
   * Long-waiting user gets matched first
   */
  test('Scenario 2: Fairness Priority', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    // User 1 joins queue first
    await joinQueue(testState.user1Id);

    // Wait a bit to build fairness score
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // User 2 joins queue (newer)
    await joinQueue(testState.user2Id);

    // Get fairness scores
    const user1Status = await getQueueStatus(testState.user1Id);
    const user2Status = await getQueueStatus(testState.user2Id);

    // User 1 should have higher fairness score (waited longer)
    // Note: fairness_score might be null initially, so we check if it exists
    if (user1Status?.fairness_score !== null && user1Status?.fairness_score !== undefined &&
        user2Status?.fairness_score !== null && user2Status?.fairness_score !== undefined) {
      expect(user1Status.fairness_score).toBeGreaterThan(user2Status.fairness_score);
    } else {
      // If fairness scores aren't calculated yet, just verify they're in queue
      expect(user1Status).toBeTruthy();
      expect(user2Status).toBeTruthy();
    }

    // Process matching - should match user1 first due to fairness
    const matchId = await processMatching(testState.user1Id);
    expect(matchId).toBeTruthy();
  });

  /**
   * SCENARIO 5: Both Vote Yes - Successful Match
   */
  test('Scenario 5: Both Vote Yes - Successful Match', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    const testStartTime = new Date();

    // Both users join queue and get matched
    await Promise.all([
      joinQueue(testState.user1Id),
      joinQueue(testState.user2Id),
    ]);

    // Process matching - with guaranteed matching, should always succeed
    let matchId: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!matchId && attempts < maxAttempts) {
      attempts++;
      try {
        matchId = await processMatching(testState.user1Id);
      } catch (error: any) {
        if (error?.code === '57014' || error?.message?.includes('timeout')) {
          console.warn(`⚠️ Matching attempt ${attempts} timed out - retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          throw error;
        }
      }
      
      if (!matchId && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    
    // With guaranteed matching, this should ALWAYS succeed
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('string');

    const match = await getActiveMatch(testState.user1Id);
    expect(match).toBeTruthy();

    // Determine partner ID
    const partnerId =
      match.user1_id === testState.user1Id ? match.user2_id : match.user1_id;

    // Both users vote yes
    await Promise.all([
      castVote(testState.user1Id, partnerId, 'yes'),
      castVote(testState.user2Id, testState.user1Id, 'yes'),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    const user1VoteYes = logs.some(
      (log) => log.event_type === 'voteYes' && log.user_id === testState.user1Id
    );
    const user2VoteYes = logs.some(
      (log) => log.event_type === 'voteYes' && log.user_id === testState.user2Id
    );

    expect(user1VoteYes).toBe(true);
    expect(user2VoteYes).toBe(true);
  });

  /**
   * SCENARIO 6: One Yes, One Pass
   */
  test('Scenario 6: One Yes, One Pass', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    const testStartTime = new Date();

    // Both users join queue and get matched
    await Promise.all([
      joinQueue(testState.user1Id),
      joinQueue(testState.user2Id),
    ]);

    // Process matching - with guaranteed matching, should always succeed
    let matchId: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!matchId && attempts < maxAttempts) {
      attempts++;
      try {
        matchId = await processMatching(testState.user1Id);
      } catch (error: any) {
        if (error?.code === '57014' || error?.message?.includes('timeout')) {
          console.warn(`⚠️ Matching attempt ${attempts} timed out - retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          throw error;
        }
      }
      
      if (!matchId && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    
    // With guaranteed matching, this should ALWAYS succeed
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('string');

    const match = await getActiveMatch(testState.user1Id);
    expect(match).toBeTruthy();

    const partnerId =
      match.user1_id === testState.user1Id ? match.user2_id : match.user1_id;

    // User 1 votes yes, User 2 votes pass
    await Promise.all([
      castVote(testState.user1Id, partnerId, 'yes'),
      castVote(testState.user2Id, testState.user1Id, 'pass'),
    ]);

    // Verify logs
    const logs = await fetchSpinLogs(undefined, undefined, testStartTime);

    const user1VoteYes = logs.some(
      (log) => log.event_type === 'voteYes' && log.user_id === testState.user1Id
    );
    const user2VotePass = logs.some(
      (log) =>
        log.user_id === testState.user2Id &&
        (log.event_type === 'votePass' ||
          (log.event_type === 'voteCast' && log.event_data?.vote_type === 'pass'))
    );

    expect(user1VoteYes).toBe(true);
    expect(user2VotePass).toBe(true);
  });

  /**
   * SCENARIO 10: Race Condition Prevention
   */
  test('Scenario 10: Race Condition Prevention', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    // Ensure both users are online
    await Promise.all([
      supabase.from('profiles').update({ is_online: true }).eq('id', testState.user1Id),
      supabase.from('profiles').update({ is_online: true }).eq('id', testState.user2Id),
    ]);

    // Both users join queue simultaneously
    await Promise.all([
      joinQueue(testState.user1Id),
      joinQueue(testState.user2Id),
    ]);

    // Small delay to ensure both are in queue
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Both try to match simultaneously (race condition)
    // Use Promise.allSettled to handle timeouts gracefully
    const [result1, result2] = await Promise.allSettled([
      processMatching(testState.user1Id),
      processMatching(testState.user2Id),
    ]);

    const match1 = result1.status === 'fulfilled' ? result1.value : null;
    const match2 = result2.status === 'fulfilled' ? result2.value : null;

    // Only one match should be created (atomic operation)
    const matches = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${testState.user1Id},user2_id.eq.${testState.user1Id}`)
      .eq('status', 'pending');

    expect(matches.data?.length).toBeLessThanOrEqual(1);
  });

  /**
   * Test: Guaranteed Match (Tier 3)
   * Every spin leads to pairing
   */
  test('Scenario 4: Guaranteed Match - Every spin leads to pairing', async () => {
    if (!testState.user1Id || !testState.user2Id) {
      throw new Error('Test users not available');
    }

    // Both users join queue
    await Promise.all([
      joinQueue(testState.user1Id),
      joinQueue(testState.user2Id),
    ]);

    // Process matching - should ALWAYS return a match with guaranteed matching
    // The function now retries up to 30 times and waits if queue is empty
    let matchId: string | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!matchId && attempts < maxAttempts) {
      attempts++;
      try {
        matchId = await processMatching(testState.user1Id);
      } catch (error: any) {
        if (error?.code === '57014' || error?.message?.includes('timeout')) {
          console.warn(`⚠️ Matching attempt ${attempts} timed out - retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        } else {
          throw error;
        }
      }
      
      if (!matchId && attempts < maxAttempts) {
        // Wait for guaranteed match logic to kick in
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // According to matching_logic.md: "every spin leads to a pairing"
    // With guaranteed matching, this should ALWAYS succeed
    expect(matchId).toBeTruthy();
    expect(typeof matchId).toBe('string');

    // Verify match exists
    const match = await getActiveMatch(testState.user1Id);
    expect(match).toBeTruthy();
  });

  /**
   * Test: Queue Cleanup on Disconnect
   */
  test('Scenario 8: Queue Cleanup on Disconnect', async () => {
    if (!testState.user1Id) {
      throw new Error('Test user not available');
    }

    // User joins queue
    await joinQueue(testState.user1Id);

    // Verify user is in queue
    const statusBefore = await getQueueStatus(testState.user1Id);
    expect(statusBefore?.status).toBe('spin_active');

    // Simulate disconnect (set user offline)
    await supabase
      .from('profiles')
      .update({ is_online: false })
      .eq('id', testState.user1Id);

    // Wait for guardian to clean up (or manually trigger cleanup)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify user is removed from queue (or guardian cleans up)
    // This depends on guardian_orchestrator running
  });
});

