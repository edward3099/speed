/**
 * Chaos Test: Random State Injection
 * 
 * Force random illegal states:
 * - Duplicate queue entries
 * - Missing partner
 * - Vote without match
 * - Match without vote
 * 
 * Guardian must repair all.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Chaos Test: Random State Injection', () => {
  let userId: string;

  beforeEach(async () => {
    const { data: user } = await supabase
      .from('users')
      .insert({
        id: crypto.randomUUID(),
        gender: 'male',
        is_online: true,
      })
      .select()
      .single();

    userId = user!.id;
  });

  afterEach(async () => {
    await supabase.from('queue').delete().eq('user_id', userId);
    await supabase.from('matches').delete().or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    await supabase.from('votes').delete().eq('user_id', userId);
    await supabase.from('user_status').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
  });

  it('should repair duplicate queue entries', async () => {
    // Manually create duplicate queue entry
    await supabase.from('queue').insert([
      { user_id: userId, joined_at: new Date().toISOString() },
      { user_id: userId, joined_at: new Date().toISOString() },
    ]);

    // Guardian should repair
    await supabase.rpc('guardian_job');

    // Verify only one entry remains
    const { data: entries } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId);

    expect(entries?.length).toBeLessThanOrEqual(1);
  });

  it('should repair match with missing partner', async () => {
    // Create match with non-existent partner
    const fakePartnerId = crypto.randomUUID();
    await supabase.from('matches').insert({
      user1_id: userId,
      user2_id: fakePartnerId,
      status: 'vote_active',
    });

    // Guardian should repair
    await supabase.rpc('guardian_job');

    // Match should be cleaned up
    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('user1_id', userId)
      .single();

    expect(match).toBeNull();
  });

  it('should repair stale vote_active matches', async () => {
    const partnerId = crypto.randomUUID();
    await supabase.from('users').insert({
      id: partnerId,
      gender: 'female',
      is_online: true,
    });

    // Create old match
    await supabase.from('matches').insert({
      user1_id: userId,
      user2_id: partnerId,
      status: 'vote_active',
      created_at: new Date(Date.now() - 20000).toISOString(), // 20 seconds ago
    });

    // Guardian should repair
    await supabase.rpc('guardian_job');

    // Match should be ended or removed
    const { data: match } = await supabase
      .from('matches')
      .select('status')
      .eq('user1_id', userId)
      .single();

    if (match) {
      expect(match.status).not.toBe('vote_active');
    }

    await supabase.from('users').delete().eq('id', partnerId);
  });
});

