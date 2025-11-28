/**
 * Online/Offline Integration Tests
 * 
 * Tests online/offline behavior:
 * - User spins, partner goes offline at random time
 * - Ensure partner is rejected immediately
 * - Ensure offline user cannot match
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Online/Offline Integration Tests', () => {
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

  it('should reject offline user immediately when partner goes offline', async () => {
    // Both join queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });
    await supabase.rpc('join_queue', { p_user_id: user2Id });

    // User2 goes offline
    await supabase
      .from('users')
      .update({ is_online: false })
      .eq('id', user2Id);

    // Try to match
    await supabase.rpc('process_matching');

    // Should not create match with offline user
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`)
      .single();

    expect(match).toBeNull();
  });

  it('should prevent offline user from joining queue', async () => {
    // Set user offline
    await supabase
      .from('users')
      .update({ is_online: false })
      .eq('id', user1Id);

    // Try to join queue
    const { error } = await supabase.rpc('join_queue', {
      p_user_id: user1Id,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain('offline');

    // Verify not in queue
    const { data: queueEntry } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', user1Id)
      .single();

    expect(queueEntry).toBeNull();
  });

  it('should remove offline user from queue', async () => {
    // Join queue
    await supabase.rpc('join_queue', { p_user_id: user1Id });

    // Verify in queue
    const { data: before } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', user1Id)
      .single();

    expect(before).toBeDefined();

    // Go offline
    await supabase
      .from('users')
      .update({ is_online: false })
      .eq('id', user1Id);

    // Guardian should remove
    await supabase.rpc('guardian_job');

    // Verify removed
    const { data: after } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', user1Id)
      .single();

    expect(after).toBeNull();
  });
});

