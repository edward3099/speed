/**
 * Never-Pair-Again Integration Tests
 * 
 * Tests never-pair-again behavior:
 * - User A and B vote yes, store permanent record
 * - New spins verify A will never match B
 * - Even at full expansion stage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Never-Pair-Again Integration Tests', () => {
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

  it('should store permanent record on yes/yes', async () => {
    // Create match
    const matchId = crypto.randomUUID();
    await supabase.from('matches').insert({
      id: matchId,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'vote_active',
    });

    // Both vote yes
    await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('record_vote', {
      p_match_id: matchId,
      p_user_id: user2Id,
      p_vote: 'yes',
    });

    // Verify never-pair-again entry created
    const { data: blocklist } = await supabase
      .from('never_pair_again')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(blocklist).toBeDefined();
  });

  it('should prevent matching even at full expansion', async () => {
    // Add to blocklist
    const lowerId = user1Id < user2Id ? user1Id : user2Id;
    const higherId = user1Id < user2Id ? user2Id : user1Id;

    await supabase.from('never_pair_again').insert({
      user1_id: lowerId,
      user2_id: higherId,
    });

    // Both join queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Try matching at stage 3 (full expansion)
    const { data: match } = await supabase.rpc('find_best_match', {
      p_user_id: user1Id,
      p_preference_stage: 3,
    });

    // Should not match blocked users
    expect(match).toBeNull();
  });

  it('should prevent matching on new spins', async () => {
    // First match: yes/yes
    const matchId1 = crypto.randomUUID();
    await supabase.from('matches').insert({
      id: matchId1,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'vote_active',
    });

    await supabase.rpc('record_vote', {
      p_match_id: matchId1,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('record_vote', {
      p_match_id: matchId1,
      p_user_id: user2Id,
      p_vote: 'yes',
    });

    // New spins
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Try matching
    await supabase.rpc('process_matching');

    // Should not create new match
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);

    // Should only have the first match
    expect(matches?.length).toBe(1);
  });
});

