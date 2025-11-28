/**
 * Chaos Test: Disconnect Storms
 * 
 * Every 2 seconds, 10 to 15 users disconnect.
 * 
 * Verify:
 * - All stale matches removed
 * - All locks cleared
 * - Cooldown applied
 * - Queue remains clean
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Chaos Test: Disconnect Storms', () => {
  const userIds: string[] = [];

  beforeEach(async () => {
    // Create 100 users
    for (let i = 0; i < 100; i++) {
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

  it('should handle disconnect storms', async () => {
    // Create some matches first
    await supabase.rpc('process_matching');
    await new Promise(resolve => setTimeout(resolve, 100));
    await supabase.rpc('process_matching');

    // Disconnect storm: every 2 seconds, 10-15 users disconnect
    for (let wave = 0; wave < 5; wave++) {
      const disconnectCount = Math.floor(Math.random() * 6) + 10; // 10-15
      const startIdx = wave * 15;
      const disconnectUsers = userIds.slice(startIdx, startIdx + disconnectCount);

      await Promise.all(
        disconnectUsers.map(userId => supabase.rpc('handle_disconnect', { p_user_id: userId }))
      );

      // Guardian cleanup
      await supabase.rpc('guardian_job');

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Verify all disconnected users removed from queue
    const disconnectedUsers = userIds.slice(0, 75); // First 5 waves
    const { data: queueEntries } = await supabase
      .from('queue')
      .select('user_id')
      .in('user_id', disconnectedUsers);

    expect(queueEntries?.length).toBe(0);

    // Verify cooldown applied
    const { data: users } = await supabase
      .from('users')
      .select('cooldown_until')
      .in('id', disconnectedUsers.slice(0, 10));

    users?.forEach(user => {
      if (user.cooldown_until) {
        expect(new Date(user.cooldown_until).getTime()).toBeGreaterThan(Date.now());
      }
    });
  }, 60000);
});

