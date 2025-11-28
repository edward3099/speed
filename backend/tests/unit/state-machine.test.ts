/**
 * State Machine Unit Tests
 * 
 * Tests state transitions in isolation:
 * 1. spin_active → queue_waiting
 * 2. queue_waiting → paired
 * 3. paired → vote_active
 * 4. vote_active → ended (yes/yes)
 * 5. vote_active → spin_active (respin)
 * 6. No illegal transitions allowed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase, createTestUser } from '../helpers/schema-adapter';

describe('State Machine Unit Tests', () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser('male');
    userId = user.id;

    // Initialize state (actual column is 'state' not 'status')
    await supabase.from('user_status').insert({
      user_id: userId,
      state: 'idle',
    });
  });

  afterEach(async () => {
    await supabase.from('user_status').delete().eq('user_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);
  });

  it('should transition spin_active → queue_waiting', async () => {
    // Set initial state to spin_active
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'spin_active',
    });

    // execute_state_transition only takes p_user_id and p_to_state (gets current state itself)
    await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'queue_waiting',
    });

    const { data: status } = await supabase
      .from('user_status')
      .select('state')
      .eq('user_id', userId)
      .single();

    expect(status?.state).toBe('queue_waiting');
  });

  it('should transition queue_waiting → paired', async () => {
    // Set initial state to queue_waiting
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'queue_waiting',
    });

    await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'paired',
    });

    const { data: status } = await supabase
      .from('user_status')
      .select('state')
      .eq('user_id', userId)
      .single();

    expect(status?.state).toBe('paired');
  });

  it('should transition paired → vote_active', async () => {
    // Set initial state to paired
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'paired',
    });

    await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'vote_active',
    });

    const { data: status } = await supabase
      .from('user_status')
      .select('state')
      .eq('user_id', userId)
      .single();

    expect(status?.state).toBe('vote_active');
  });

  it('should transition vote_active → ended on yes/yes', async () => {
    // Set up match
    const partner = await createTestUser('female');
    const partnerId = partner.id;
    
    // Ensure user1_id < user2_id for constraint
    const user1Id = userId < partnerId ? userId : partnerId;
    const user2Id = userId < partnerId ? partnerId : userId;
    
    // Set user statuses to vote_active
    await supabase.from('user_status').upsert({
      user_id: user1Id,
      state: 'vote_active',
    });
    await supabase.from('user_status').upsert({
      user_id: user2Id,
      state: 'vote_active',
    });
    
    const matchId = crypto.randomUUID();
    // submit_vote expects status 'pending', not 'vote_active'
    await supabase.from('matches').insert({
      id: matchId,
      user1_id: user1Id,
      user2_id: user2Id,
      status: 'pending', // submit_vote expects 'pending'
      matched_at: new Date().toISOString(),
    });

    // Both vote yes (using submit_vote which accepts UUID and expects 'pending' status)
    const { recordVote } = await import('../helpers/schema-adapter');
    const result1 = await recordVote(matchId, user1Id, 'yes');
    const result2 = await recordVote(matchId, user2Id, 'yes');
    
    // Check for errors
    if (result1.error) {
      console.error('Error voting user1:', result1.error);
    }
    if (result2.error) {
      console.error('Error voting user2:', result2.error);
    }
    
    // Wait a bit for the vote resolution to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Cleanup partner
    await supabase.from('user_status').delete().eq('user_id', partnerId);
    await supabase.from('profiles').delete().eq('id', partnerId);

    // Per blueprint: Both yes → video_date, match status = 'ended'
    const { data: match } = await supabase
      .from('matches')
      .select('status')
      .eq('id', matchId)
      .single();

    // record_vote sets status to 'ended' when both vote yes (per blueprint)
    expect(match?.status).toBe('ended');
  }, 15000); // Increase timeout

  it('should transition vote_active → spin_active on respin', async () => {
    // Set initial state to vote_active
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'vote_active',
    });

    await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'spin_active',
    });

    const { data: status } = await supabase
      .from('user_status')
      .select('state')
      .eq('user_id', userId)
      .single();

    expect(status?.state).toBe('spin_active');
  });

  it('should reject illegal transitions', async () => {
    // Ensure state is idle
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'idle',
    });

    // Try illegal transition: idle → vote_active (function gets current state itself)
    const { data, error } = await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'vote_active',
    });

    // Function returns false for illegal transitions, logs to debug_logs
    expect(data).toBe(false);

    // State should remain unchanged
    const { data: status } = await supabase
      .from('user_status')
      .select('state')
      .eq('user_id', userId)
      .single();

    expect(status?.state).toBe('idle');
  });

  it('should reject transition from wrong current state', async () => {
    // Set state to queue_waiting (actual column is 'state')
    await supabase.from('user_status').upsert({
      user_id: userId,
      state: 'queue_waiting',
    });

    // Try transition to paired (should succeed from queue_waiting)
    // But if we try to transition to something illegal from queue_waiting, it should fail
    const { data, error } = await supabase.rpc('execute_state_transition', {
      p_user_id: userId,
      p_to_state: 'vote_active', // Illegal from queue_waiting (should go to paired first)
    });

    // Function returns false for illegal transitions
    expect(data).toBe(false);
  });
});

