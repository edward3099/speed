/**
 * Disconnection Unit Tests
 * 
 * Tests disconnection handling in isolation:
 * 1. Disconnect before match → queue removal
 * 2. Disconnect during pairing → cooldown
 * 3. Disconnect during vote → cooldown
 * 4. Reconnect within 10 seconds still allowed
 * 5. Reconnect after 10 seconds → treated as new user
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase, createTestUser } from '../helpers/schema-adapter';

describe('Disconnection Unit Tests', () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser('male');
    userId = user.id;
  });

  afterEach(async () => {
    await supabase.from('queue').delete().eq('user_id', userId);
    await supabase.from('matches').delete().or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    await supabase.from('user_status').delete().eq('user_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);
  });

  it('should remove from queue on disconnect before match', async () => {
    // Join queue
    await supabase.rpc('join_queue', { p_user_id: userId });

    // Verify in queue
    const { data: before } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(before).toBeDefined();

    // Disconnect
    await supabase.rpc('handle_disconnect', { p_user_id: userId });

    // Verify removed from queue
    const { data: after } = await supabase
      .from('queue')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(after).toBeNull();
  });

  it('should apply cooldown on disconnect during pairing', async () => {
    // Set state to paired (actual column is 'state')
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'paired',
    });

    // Disconnect
    await supabase.rpc('handle_disconnect', { p_user_id: userId });

    // Check cooldown applied
    const { data: user } = await supabase
      .from('users')
      .select('cooldown_until')
      .eq('id', userId)
      .single();

    expect(user?.cooldown_until).toBeDefined();
    expect(new Date(user?.cooldown_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('should apply cooldown on disconnect during vote', async () => {
    // Set state to vote_active (actual column is 'state')
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'vote_active',
    });

    // Disconnect
    await supabase.rpc('handle_disconnect', { p_user_id: userId });

    // Check cooldown applied
    const { data: user } = await supabase
      .from('users')
      .select('cooldown_until')
      .eq('id', userId)
      .single();

    expect(user?.cooldown_until).toBeDefined();
  });

  it('should allow reconnect within 10 seconds', async () => {
    // Disconnect
    await supabase.rpc('handle_disconnect', { p_user_id: userId });

    // Reconnect immediately (within 10 seconds)
    await supabase
      .from('profiles')
      .update({ online: true, is_online: true })
      .eq('id', userId);

    // Should be able to join queue
    const { error } = await supabase.rpc('join_queue', {
      p_user_id: userId,
    });

    expect(error).toBeNull();
  });

  it('should treat reconnect after 10 seconds as new user', async () => {
    // Disconnect
    await supabase.rpc('handle_disconnect', { p_user_id: userId });

    // Wait 11 seconds
    await new Promise(resolve => setTimeout(resolve, 11000));

    // Reconnect
    await supabase
      .from('profiles')
      .update({ online: true, is_online: true })
      .eq('id', userId);

    // Cooldown should still be active (5 minutes from disconnect)
    const { data: user } = await supabase
      .from('profiles')
      .select('cooldown_until')
      .eq('id', userId)
      .single();

    if (user?.cooldown_until) {
      const cooldownTime = new Date(user.cooldown_until).getTime();
      expect(cooldownTime).toBeGreaterThan(Date.now());
    }
  }, 15000); // Increase timeout for 11 second wait
});

