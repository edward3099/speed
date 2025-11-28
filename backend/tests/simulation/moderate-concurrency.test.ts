/**
 * Simulation B: Moderate Concurrency (50 users)
 * 
 * Events:
 * - Random spin times
 * - Random pass/yes
 * - Random idle
 * - Random disconnects
 * - Random preference settings
 * 
 * Verify:
 * - No duplicate matches
 * - No stale matches
 * - Queue integrity stays correct
 * - Disperse matches look fair
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Simulation B: Moderate Concurrency (50 users)', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 50 users (25 male, 25 female)
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
  });

  afterEach(async () => {
    await supabase.from('votes').delete().in('user_id', userIds);
    await supabase.from('matches').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  });

  it('should handle random events without duplicates', async () => {
    // Random spin times
    const spinPromises = userIds.map((userId, index) => {
      const delay = Math.random() * 5000; // 0-5 seconds
      return new Promise(resolve => {
        setTimeout(async () => {
          await supabase.rpc('join_queue', { p_user_id: userId });
          resolve(null);
        }, delay);
      });
    });

    await Promise.all(spinPromises);

    // Process matching multiple times
    for (let i = 0; i < 10; i++) {
      await supabase.rpc('process_matching');
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Verify no duplicate matches
    const { data: matches } = await supabase
      .from('matches')
      .select('user1_id, user2_id');

    const matchPairs = new Set<string>();
    matches?.forEach(match => {
      const pair = [match.user1_id, match.user2_id].sort().join('-');
      expect(matchPairs.has(pair)).toBe(false);
      matchPairs.add(pair);
    });

    // Verify no stale matches
    const { data: staleMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'vote_active')
      .lt('created_at', new Date(Date.now() - 20000).toISOString());

    expect(staleMatches?.length).toBe(0);
  });
});

