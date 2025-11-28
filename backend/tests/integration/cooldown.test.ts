/**
 * Cooldown Integration Tests
 * 
 * Tests cooldown behavior:
 * - User disconnects, cooldown applied
 * - User spins again during cooldown → denied
 * - User spins again after cooldown → allowed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Cooldown Integration Tests', () => {
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
    await supabase.from('user_status').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
  });

  it('should apply cooldown on disconnect', async () => {
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

  it('should deny queue join during cooldown', async () => {
    // Set cooldown
    await supabase.rpc('set_cooldown', {
      p_user_id: userId,
      p_minutes: 5,
    });

    // Try to join queue
    const { error } = await supabase.rpc('join_queue', {
      p_user_id: userId,
    });

    expect(error).toBeDefined();
    expect(error?.message).toContain('cooldown');
  });

  it('should allow queue join after cooldown expires', async () => {
    // Set short cooldown (1 second for testing)
    const cooldownUntil = new Date(Date.now() + 1000);
    await supabase
      .from('users')
      .update({ cooldown_until: cooldownUntil.toISOString() })
      .eq('id', userId);

    // Wait for cooldown to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Try to join queue
    const { error } = await supabase.rpc('join_queue', {
      p_user_id: userId,
    });

    expect(error).toBeNull();
  });
});

