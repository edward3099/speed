/**
 * Load Test 2: Database Lock Pressure
 * 
 * Simulate 8 parallel pairing attempts
 * Ensure SKIP LOCKED prevents deadlocks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Load Test 2: Database Lock Pressure', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 16 users (8 pairs)
    for (let i = 0; i < 16; i++) {
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

    // All join queue
    await Promise.all(
      userIds.map(userId => supabase.rpc('join_queue', { p_user_id: userId }))
    );
  }, 30000);

  afterEach(async () => {
    await supabase.from('matches').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 30000);

  it('should handle 8 parallel pairing attempts without deadlock', async () => {
    // 8 parallel pairing attempts
    const pairingPromises = Array.from({ length: 8 }, (_, i) => {
      const user1Id = userIds[i * 2];
      return supabase.rpc('create_pair_atomic', { p_user1_id: user1Id });
    });

    const results = await Promise.all(pairingPromises);

    // Should not deadlock (no lock timeout errors)
    results.forEach(result => {
      expect(result.error?.code).not.toBe('40P01'); // Deadlock detected
    });

    // Should create exactly 4 matches (8 users = 4 pairs)
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);

    expect(matches?.length).toBe(4);
  });
});

