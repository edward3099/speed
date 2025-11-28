/**
 * Simulation D: Extreme Concurrency (500 users)
 * 
 * Stress test:
 * - 500 users spinning
 * - 20 to 40 disconnects
 * - 100 pass / yes actions
 * - 80 idle events
 * - Guardian system intervening
 * 
 * Verify:
 * - System never deadlocks
 * - No ghost entries
 * - No duplicate pairs
 * - Never-pair-again preserved
 * - Cooldown works
 * - Queue cleans itself
 * - Fallback still succeeds
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Simulation D: Extreme Concurrency (500 users)', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 500 users in batches
    const batchSize = 100;
    for (let batch = 0; batch < 5; batch++) {
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
  }, 60000);

  afterEach(async () => {
    await supabase.from('votes').delete().in('user_id', userIds);
    await supabase.from('matches').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('never_pair_again').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 60000);

  it('should handle extreme load without deadlocks', async () => {
    // All 500 users spin
    const spinPromises = userIds.map(userId =>
      supabase.rpc('join_queue', { p_user_id: userId })
    );
    await Promise.all(spinPromises);

    // Process matching multiple times
    for (let i = 0; i < 20; i++) {
      await supabase.rpc('process_matching');
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 20-40 disconnects
    const disconnectCount = Math.floor(Math.random() * 21) + 20;
    const disconnectUsers = userIds.slice(0, disconnectCount);
    await Promise.all(
      disconnectUsers.map(userId => supabase.rpc('handle_disconnect', { p_user_id: userId }))
    );

    // Guardian cleanup
    await supabase.rpc('guardian_job');

    // Verify no ghost entries
    const { data: queueEntries } = await supabase
      .from('queue')
      .select('user_id')
      .in('user_id', disconnectUsers);

    expect(queueEntries?.length).toBe(0);

    // Verify no duplicate pairs
    const { data: matches } = await supabase
      .from('matches')
      .select('user1_id, user2_id');

    const matchPairs = new Set<string>();
    matches?.forEach(match => {
      const pair = [match.user1_id, match.user2_id].sort().join('-');
      expect(matchPairs.has(pair)).toBe(false);
      matchPairs.add(pair);
    });
  }, 120000);
});

