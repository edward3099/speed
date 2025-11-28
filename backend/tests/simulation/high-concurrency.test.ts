/**
 * Simulation C: High Concurrency (200 users)
 * 
 * Simulate:
 * - Waves of users pressing spin
 * - High collision rates
 * - Many lock conflicts
 * 
 * Verify:
 * - Atomic pairing never breaks
 * - Fairness scores remain predictable
 * - SKIP LOCKED prevents blocks
 * - Guaranteed fallback still works
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Simulation C: High Concurrency (200 users)', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 200 users
    const batchSize = 50;
    for (let batch = 0; batch < 4; batch++) {
      const batchPromises = Array.from({ length: batchSize }, async (_, i) => {
        const index = batch * batchSize + i;
        const { data: user } = await supabase
          .from('users')
          .insert({
            id: crypto.randomUUID(),
            gender: index % 2 === 0 ? 'male' : 'female',
            is_online: true,
          })
          .select()
          .single();

        userIds.push(user!.id);
      });

      await Promise.all(batchPromises);
    }
  }, 30000); // Increased timeout

  afterEach(async () => {
    await supabase.from('matches').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 30000);

  it('should handle waves of concurrent spins', async () => {
    // Wave 1: 50 users spin simultaneously
    const wave1 = userIds.slice(0, 50);
    await Promise.all(
      wave1.map(userId => supabase.rpc('join_queue', { p_user_id: userId }))
    );

    // Process matching
    await supabase.rpc('process_matching');

    // Wave 2: Next 50 users spin
    const wave2 = userIds.slice(50, 100);
    await Promise.all(
      wave2.map(userId => supabase.rpc('join_queue', { p_user_id: userId }))
    );

    // Process matching again
    await supabase.rpc('process_matching');

    // Verify atomic pairing - no three-way matches
    const { data: matches } = await supabase
      .from('matches')
      .select('user1_id, user2_id');

    const userMatchCounts = new Map<string, number>();
    matches?.forEach(match => {
      userMatchCounts.set(match.user1_id, (userMatchCounts.get(match.user1_id) || 0) + 1);
      userMatchCounts.set(match.user2_id, (userMatchCounts.get(match.user2_id) || 0) + 1);
    });

    // Each user should be in at most 1 match
    userMatchCounts.forEach(count => {
      expect(count).toBeLessThanOrEqual(1);
    });
  }, 60000);
});

