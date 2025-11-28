/**
 * Core End-to-End Flow Integration Tests
 * 
 * Tests complete flows combining multiple modules:
 * - Scenario 1: spin → queue → match → yes/yes → end
 * - Scenario 2: spin → queue → match → yes/pass → respin
 * - Scenario 3: spin → queue → match → yes/idle → respin
 * - Scenario 4: spin → queue → match → idle/idle → stop
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Core End-to-End Flow Integration Tests', () => {
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

  it('Scenario 1: spin → queue → match → yes/yes → end', async () => {
    // Step 1: Both users spin
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Step 2: Process matching
    await supabase.rpc('process_matching');

    // Step 3: Verify match created
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeDefined();
    expect(match?.status).toBe('vote_active');

    // Step 4: Both vote yes
    await supabase.rpc('record_vote', {
      p_match_id: match!.id,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('record_vote', {
      p_match_id: match!.id,
      p_user_id: user2Id,
      p_vote: 'yes',
    });

    // Step 5: Verify match ended
    const { data: finalMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match!.id)
      .single();

    expect(finalMatch?.status).toBe('ended');
    expect(finalMatch?.outcome).toBe('both_yes');

    // Verify never-pair-again entry
    const { data: blocklist } = await supabase
      .from('never_pair_again')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(blocklist).toBeDefined();
  });

  it('Scenario 2: spin → queue → match → yes/pass → respin', async () => {
    // Step 1: Both users spin
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Step 2: Process matching
    await supabase.rpc('process_matching');

    // Step 3: Get match
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeDefined();

    // Step 4: User1 votes yes, User2 votes pass
    await supabase.rpc('record_vote', {
      p_match_id: match!.id,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('record_vote', {
      p_match_id: match!.id,
      p_user_id: user2Id,
      p_vote: 'pass',
    });

    // Step 5: Verify match ended
    const { data: finalMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match!.id)
      .single();

    expect(finalMatch?.status).toBe('ended');
    expect(finalMatch?.outcome).toBe('yes_pass');

    // Step 6: Verify user1 respins (spin_active state)
    const { data: user1Status } = await supabase
      .from('user_status')
      .select('status')
      .eq('user_id', user1Id)
      .single();

    expect(user1Status?.status).toBe('spin_active');

    // Step 7: Verify user1 got +10 boost
    const { data: queueEntry } = await supabase
      .from('queue')
      .select('fairness_score')
      .eq('user_id', user1Id)
      .single();

    expect(queueEntry?.fairness_score).toBeGreaterThanOrEqual(10);
  });

  it('Scenario 3: spin → queue → match → yes/idle → respin', async () => {
    // Step 1: Both users spin
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Step 2: Process matching
    await supabase.rpc('process_matching');

    // Step 3: Get match
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeDefined();

    // Step 4: User1 votes yes, User2 is idle
    await supabase.rpc('record_vote', {
      p_match_id: match!.id,
      p_user_id: user1Id,
      p_vote: 'yes',
    });

    await supabase.rpc('handle_idle_voter', {
      p_match_id: match!.id,
      p_idle_user_id: user2Id,
    });

    // Step 5: Verify match ended
    const { data: finalMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match!.id)
      .single();

    expect(finalMatch?.status).toBe('ended');
    expect(finalMatch?.outcome).toBe('yes_idle');

    // Step 6: Verify user1 respins
    const { data: user1Status } = await supabase
      .from('user_status')
      .select('status')
      .eq('user_id', user1Id)
      .single();

    expect(user1Status?.status).toBe('spin_active');
  });

  it('Scenario 4: spin → queue → match → idle/idle → stop', async () => {
    // Step 1: Both users spin
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Step 2: Process matching
    await supabase.rpc('process_matching');

    // Step 3: Get match
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeDefined();

    // Step 4: Both idle
    await supabase.rpc('handle_idle_voter', {
      p_match_id: match!.id,
      p_idle_user_id: user1Id,
    });

    await supabase.rpc('handle_idle_voter', {
      p_match_id: match!.id,
      p_idle_user_id: user2Id,
    });

    // Step 5: Verify match ended
    const { data: finalMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match!.id)
      .single();

    expect(finalMatch?.status).toBe('ended');
    expect(finalMatch?.outcome).toBe('both_idle');

    // Step 6: Verify neither respins
    const { data: user1Status } = await supabase
      .from('user_status')
      .select('status')
      .eq('user_id', user1Id)
      .single();

    const { data: user2Status } = await supabase
      .from('user_status')
      .select('status')
      .eq('user_id', user2Id)
      .single();

    expect(user1Status?.status).not.toBe('spin_active');
    expect(user2Status?.status).not.toBe('spin_active');
  });
});

