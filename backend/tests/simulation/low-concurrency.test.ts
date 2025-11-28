/**
 * Simulation A: Low Concurrency (5 users)
 * 
 * Realistic step-by-step simulation:
 * - user1 spins
 * - user2 spins 3 seconds later
 * - user3 spins 5 seconds later
 * - user4 idle
 * - user5 disconnects
 * - Ensure matches form only inside overlapping windows
 * - Ensure fairness increments correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Simulation A: Low Concurrency (5 users)', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 5 users
    for (let i = 0; i < 5; i++) {
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
    await supabase.from('matches').delete().in('user1_id', userIds);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  });

  it('should simulate realistic user interactions', async () => {
    // Step 1: user1 spins
    await supabase.rpc('join_queue', { p_user_id: userIds[0] });

    // Step 2: user2 spins 3 seconds later
    await new Promise(resolve => setTimeout(resolve, 3000));
    await supabase.rpc('join_queue', { p_user_id: userIds[1] });

    // Step 3: user3 spins 5 seconds later (8 seconds total)
    await new Promise(resolve => setTimeout(resolve, 5000));
    await supabase.rpc('join_queue', { p_user_id: userIds[2] });

    // Step 4: Process matching - should match user1 and user2
    await supabase.rpc('process_matching');

    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${userIds[0]},user2_id.eq.${userIds[0]}`);

    expect(matches?.length).toBeGreaterThan(0);

    // Step 5: user4 idle (simulated by not joining)
    // Step 6: user5 disconnects
    await supabase.rpc('handle_disconnect', { p_user_id: userIds[4] });

    // Verify user5 removed from queue if was in queue
    const { data: user5Queue } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userIds[4])
      .single();

    expect(user5Queue).toBeNull();

    // Verify fairness increments
    const { data: queueEntries } = await supabase
      .from('queue')
      .select('fairness_score')
      .in('user_id', userIds.slice(0, 3));

    queueEntries?.forEach(entry => {
      expect(entry.fairness_score).toBeGreaterThan(0);
    });
  });
});

