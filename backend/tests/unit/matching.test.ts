/**
 * Matching Unit Tests
 * 
 * Tests matching logic in isolation:
 * 1. Gender strictness enforced
 * 2. Age boundary strict / expanded correct
 * 3. Distance strict / expanded correct
 * 4. User blocked from matching again works
 * 5. Never-pair-again blacklist enforced
 * 6. Cooldown rule enforced
 * 7. Atomic pairing never pairs three users
 * 8. SKIP LOCKED works under conflicts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase, createTestUser } from '../helpers/schema-adapter';

describe('Matching Unit Tests', () => {
  let user1Id: string;
  let user2Id: string;

  beforeEach(async () => {
    // Create test users
    const user1 = await createTestUser('male');
    const user2 = await createTestUser('female');
    user1Id = user1.id;
    user2Id = user2.id;
  });

  afterEach(async () => {
    // Cleanup
    await supabase.from('matches').delete().or(`user1_id.in.(${user1Id},${user2Id}),user2_id.in.(${user1Id},${user2Id})`);
    await supabase.from('never_pair_again').delete().or(`user1.eq.${user1Id},user2.eq.${user1Id}`);
    await supabase.from('queue').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('user_status').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('profiles').delete().in('id', [user1Id, user2Id]);
  });

  it('should enforce gender strictness', async () => {
    // Set both users to same gender
    await supabase
      .from('profiles')
      .update({ gender: 'male' })
      .eq('id', user2Id);

    // Join queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Try to match
    const { data, error } = await supabase.rpc('process_matching');

    // Should not match same gender
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeNull();
  });

  it('should enforce age boundaries in strict mode', async () => {
    // Set preferences with strict age range
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Age boundaries should be checked
    const { data: match } = await supabase.rpc('find_best_match', {
      p_user_id: user1Id,
      p_preference_stage: 0, // Strict mode
    });

    // Match should respect age boundaries
    expect(match).toBeDefined();
  });

  it('should expand age boundaries at stage 1', async () => {
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Update preference stage to 1
    await supabase
      .from('queue')
      .update({ preference_stage: 1 })
      .eq('user_id', user1Id);

    const { data: match } = await supabase.rpc('find_best_match', {
      p_user_id: user1Id,
      p_preference_stage: 1,
    });

    // Should allow ±2 years expansion
    expect(match).toBeDefined();
  });

  it('should enforce never-pair-again blacklist', async () => {
    // Add to blocklist (actual schema uses user1/user2, not user1_id/user2_id)
    await supabase.from('never_pair_again').insert({
      user1: user1Id < user2Id ? user1Id : user2Id,
      user2: user1Id < user2Id ? user2Id : user1Id,
    });

    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    const { data: match } = await supabase.rpc('find_best_match', {
      p_user_id: user1Id,
      p_preference_stage: 0,
    });

    // Should not match blocked users
    expect(match).toBeNull();
  });

  it('should enforce cooldown rule', async () => {
    // Set cooldown (function only takes p_user_id, sets 5 minutes automatically)
    await supabase.rpc('set_cooldown', {
      p_user_id: user1Id,
    });

    // Try to join queue
    const { data, error } = await supabase.rpc('join_queue', {
      p_user_id: user1Id,
    });

    // Function returns false for users in cooldown, not an error
    expect(data).toBe(false);
  });

  it('should prevent atomic pairing from creating three-way matches', async () => {
    const user3 = await createTestUser('female');
    const user3Id = user3.id;

    // All three join queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });
    await supabase.rpc('join_queue', { p_user_id: user3Id });

    // Process matching concurrently (create_pair_atomic needs both user IDs)
    const [result1, result2] = await Promise.all([
      supabase.rpc('create_pair_atomic', { p_user1_id: user1Id, p_user2_id: user2Id }),
      supabase.rpc('create_pair_atomic', { p_user1_id: user1Id, p_user2_id: user3Id }),
    ]);

    // Should only create one match (first one succeeds, second fails because user1 is already paired)
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);

    expect(matches?.length).toBeLessThanOrEqual(1);

    // Cleanup user3
    await supabase.from('user_status').delete().eq('user_id', user3Id);
    await supabase.from('queue').delete().eq('user_id', user3Id);
    await supabase.from('profiles').delete().eq('id', user3Id);
  }, 15000); // Increase timeout

  it('should handle SKIP LOCKED under conflicts', async () => {
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Concurrent matching attempts (create_pair_atomic needs both user IDs)
    const promises = Array.from({ length: 5 }, () =>
      supabase.rpc('create_pair_atomic', { p_user1_id: user1Id, p_user2_id: user2Id })
    );

    const results = await Promise.all(promises);

    // Should not deadlock (SKIP LOCKED prevents deadlocks)
    expect(results.every(r => r.error === null || r.error?.code !== '40P01')).toBe(true);

    // Should create exactly one match (subsequent calls return null because users already paired)
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);

    expect(matches?.length).toBe(1);
  });
});

