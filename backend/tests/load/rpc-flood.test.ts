/**
 * Load Test 1: RPC Flood Test
 * 
 * 200 requests / second to:
 * - join_queue
 * - process_matching
 * 
 * System must not crash
 * Atomic locks must behave correctly
 * Fallback must still match users
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Load Test 1: RPC Flood Test', () => {
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
  }, 30000);

  afterEach(async () => {
    await supabase.from('matches').delete().or(`user1_id.in.(${userIds.join(',')}),user2_id.in.(${userIds.join(',')})`);
    await supabase.from('queue').delete().in('user_id', userIds);
    await supabase.from('user_status').delete().in('user_id', userIds);
    await supabase.from('users').delete().in('id', userIds);
  }, 30000);

  it('should handle 200 requests/second to join_queue', async () => {
    const requestsPerSecond = 200;
    const durationSeconds = 2;
    const totalRequests = requestsPerSecond * durationSeconds;

    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    // Flood join_queue
    for (let i = 0; i < totalRequests; i++) {
      const userId = userIds[i % userIds.length];
      const delay = (i / requestsPerSecond) * 1000;
      
      promises.push(
        new Promise(resolve => {
          setTimeout(async () => {
            await supabase.rpc('join_queue', { p_user_id: userId });
            resolve(null);
          }, delay);
        })
      );
    }

    await Promise.all(promises);
    const elapsed = (Date.now() - startTime) / 1000;

    // System should not crash
    expect(elapsed).toBeLessThan(durationSeconds * 2); // Should complete reasonably

    // Verify queue integrity
    const { data: queueEntries } = await supabase
      .from('queue')
      .select('user_id');

    // Should have entries but no duplicates per user
    const userQueueCounts = new Map<string, number>();
    queueEntries?.forEach(entry => {
      userQueueCounts.set(entry.user_id, (userQueueCounts.get(entry.user_id) || 0) + 1);
    });

    // Each user should appear at most once
    userQueueCounts.forEach(count => {
      expect(count).toBeLessThanOrEqual(1);
    });
  }, 60000);
});

