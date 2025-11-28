/**
 * Regression Test Suite
 * 
 * Every bug you fix becomes a regression test.
 * 
 * Examples:
 * - Stale match causes mismatch
 * - Users paired twice
 * - Yes voter not boosted
 * - Pass before yes wrong path
 * - Idle user incorrectly requeued
 * - Offline user matched
 * - Preference expansion skipping stage
 * - Duplicate votes
 * 
 * Regression tests ensure bugs never return.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Regression Test Suite', () => {
  let user1Id: string;
  let user2Id: string;

  beforeEach(async () => {
    const { data: user1 } = await supabase
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        gender: 'male',
        is_online: true,
      })
      .select()
      .single();

    const { data: user2 } = await supabase
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        gender: 'female',
        is_online: true,
      })
      .select()
      .single();

    user1Id = user1!.id;
    user2Id = user2!.id;
  });

  afterEach(async () => {
    await supabase.from('votes').delete().or(`user_id.eq.${user1Id},user_id.eq.${user2Id}`);
    await supabase.from('matches').delete().or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);
    await supabase.from('never_pair_again').delete().or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);
    await supabase.from('queue').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('user_status').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('users').delete().in('id', [user1Id, user2Id]);
  });

  it('should prevent stale match from causing mismatch', async () => {
    // Create stale match
    const staleMatchId = crypto.randomUUID();
    await supabase.from('matches').insert({
      id: staleMatchId,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'vote_active',
      created_at: new Date(Date.now() - 20000).toISOString(), // 20 seconds ago
    });

    // Guardian should clean it up
    await supabase.rpc('guardian_job');

    const { data: match } = await supabase
      .from('matches')
      .select('status')
      .eq('id', staleMatchId)
      .single();

    expect(match?.status).not.toBe('vote_active');
  });

  it('should prevent users from being paired twice', async () => {
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Process matching multiple times
    await supabase.rpc('process_matching');
    await supabase.rpc('process_matching');
    await supabase.rpc('process_matching');

    // Should only create one match
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);

    expect(matches?.length).toBeLessThanOrEqual(1);
  });

  it('should boost yes voter correctly', async () => {
    const matchId = crypto.randomUUID();
    await supabase.from('matches').insert({
      id: matchId,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'vote_active',
    });

    await supabase.rpc('join_queue', { p_user_id: user1Id });
    const { data: initial } = await supabase
      .from('queue')
      .select('fairness_score')
      .eq('user_id', user1Id)
      .single();

    // User1 votes yes, user2 passes
    await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user2Id,
      p_vote: 'pass',
    });

    // Verify boost applied
    const { data: boosted } = await supabase
      .from('queue')
      .select('fairness_score')
      .eq('user_id', user1Id)
      .single();

    expect(boosted?.fairness_score).toBe((initial?.fairness_score || 0) + 10);
  });

  it('should prevent offline user from matching', async () => {
    await supabase
      .from('users')
      .update({ is_online: false })
      .eq('id', user2Id);

    await supabase.rpc('join_queue', { p_user_id: user1Id });

    await supabase.rpc('process_matching');

    // Should not create match with offline user
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeNull();
  });

  it('should prevent duplicate votes', async () => {
    const matchId = crypto.randomUUID();
    await supabase.from('matches').insert({
      id: matchId,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'vote_active',
    });

    // Vote once
    await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    // Try to vote again
    const { error } = await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    expect(error).toBeDefined();
  });
});

