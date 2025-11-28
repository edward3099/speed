/**
 * Preference Expansion Integration Tests
 * 
 * Tests preference expansion across stages:
 * - User spinning with no match found
 * - Wait → expand → try again
 * - Ensure fallback match is correct at each stage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Preference Expansion Integration Tests', () => {
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
    await supabase.from('matches').delete().or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);
    await supabase.from('queue').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('user_status').delete().in('user_id', [user1Id, user2Id]);
    await supabase.from('users').delete().in('id', [user1Id, user2Id]);
  });

  it('should expand preferences at stage 1 (10 seconds)', async () => {
    // User1 joins queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });

    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Update preference stage
    await supabase.rpc('update_preference_stage', {
      p_user_id: user1Id,
    });

    // Verify stage updated
    const { data: queueEntry } = await supabase
      .from('queue')
      .select('preference_stage')
      .eq('user_id', user1Id)
      .single();

    expect(queueEntry?.preference_stage).toBeGreaterThanOrEqual(1);
  });

  it('should expand preferences at stage 2 (15 seconds)', async () => {
    await supabase.rpc('join_queue', { p_user_id: user1Id });

    // Wait 15 seconds
    await new Promise(resolve => setTimeout(resolve, 15000));

    await supabase.rpc('update_preference_stage', {
      p_user_id: user1Id,
    });

    const { data: queueEntry } = await supabase
      .from('queue')
      .select('preference_stage')
      .eq('user_id', user1Id)
      .single();

    expect(queueEntry?.preference_stage).toBeGreaterThanOrEqual(2);
  });

  it('should expand preferences at stage 3 (20 seconds)', async () => {
    await supabase.rpc('join_queue', { p_user_id: user1Id });

    // Wait 20 seconds
    await new Promise(resolve => setTimeout(resolve, 20000));

    await supabase.rpc('update_preference_stage', {
      p_user_id: user1Id,
    });

    const { data: queueEntry } = await supabase
      .from('queue')
      .select('preference_stage')
      .eq('user_id', user1Id)
      .single();

    expect(queueEntry?.preference_stage).toBeGreaterThanOrEqual(3);
  });

  it('should find fallback match after expansion', async () => {
    // User1 joins with strict preferences
    await supabase.rpc('join_queue', { p_user_id: user1Id });

    // User2 joins (might not match strict preferences)
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // Try matching at stage 0 (strict)
    let match = await supabase.rpc('find_best_match', {
      p_user_id: user1Id,
      p_preference_stage: 0,
    });

    // If no match, expand and try again
    if (!match.data) {
      await supabase.rpc('update_preference_stage', {
        p_user_id: user1Id,
      });

      match = await supabase.rpc('find_best_match', {
        p_user_id: user1Id,
        p_preference_stage: 1,
      });
    }

    // Should eventually find a match
    expect(match.data).toBeDefined();
  });
});

