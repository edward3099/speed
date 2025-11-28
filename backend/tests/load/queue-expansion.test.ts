/**
 * Load Test 3: Queue Expansion Under Stress
 * 
 * Simulate waiting users
 * Preference expansion must fire correctly at:
 * - 10 seconds
 * - 15 seconds  
 * - 20 seconds
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Load Test 3: Queue Expansion Under Stress', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 50 users
    for (let i = 0; i < 50; i++) {
      const { data: user } = await supabase
        .from('users')
        .insert({
          id: crypto.randomUUID(),
          gender: i % 2 === 0 ? 'male' : 'female',
          is_online: true,
        })
        .select()
        .single();

      userIds.push(user!.id);
    }
  }, 30000);

  afterEach(async () => {
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 30000);

  it('should expand preferences correctly under load', async () => {
    // All join queue simultaneously
    await Promise.all(
      userIds.map(userId => supabase.rpc('join_queue', { p_user_id: userId }))
    );

    // Wait 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Update preference stages
    await Promise.all(
      userIds.map(userId => supabase.rpc('update_preference_stage', { p_user_id: userId }))
    );

    // Verify stage 1 reached
    const { data: stage1Entries } = await supabase
      .from('queue')
      .select('preference_stage')
      .in('user_id', userIds.slice(0, 10));

    stage1Entries?.forEach(entry => {
      expect(entry.preference_stage).toBeGreaterThanOrEqual(1);
    });

    // Wait 5 more seconds (15 total)
    await new Promise(resolve => setTimeout(resolve, 5000));

    await Promise.all(
      userIds.map(userId => supabase.rpc('update_preference_stage', { p_user_id: userId }))
    );

    // Verify stage 2 reached
    const { data: stage2Entries } = await supabase
      .from('queue')
      .select('preference_stage')
      .in('user_id', userIds.slice(0, 10));

    stage2Entries?.forEach(entry => {
      expect(entry.preference_stage).toBeGreaterThanOrEqual(2);
    });

    // Wait 5 more seconds (20 total)
    await new Promise(resolve => setTimeout(resolve, 5000));

    await Promise.all(
      userIds.map(userId => supabase.rpc('update_preference_stage', { p_user_id: userId }))
    );

    // Verify stage 3 reached
    const { data: stage3Entries } = await supabase
      .from('queue')
      .select('preference_stage')
      .in('user_id', userIds.slice(0, 10));

    stage3Entries?.forEach(entry => {
      expect(entry.preference_stage).toBeGreaterThanOrEqual(3);
    });
  }, 30000);
});

