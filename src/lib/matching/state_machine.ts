/**
 * State Machine Helper
 * 
 * Wrapper functions for state machine transitions
 * All state changes must go through these functions
 */

import { createClient } from '@/lib/supabase/server';

export type UserMatchingState = 
  | 'idle'
  | 'spin_active'
  | 'queue_waiting'
  | 'paired'
  | 'vote_active'
  | 'video_date'
  | 'ended'
  | 'soft_offline'
  | 'disconnected';

export type StateTransitionEvent =
  | 'spin_start'
  | 'queue_joined'
  | 'match_found'
  | 'reveal_complete'
  | 'both_voted_yes'
  | 'one_voted_pass'
  | 'session_ended'
  | 'user_disconnected'
  | 'user_reconnected'
  | 'grace_period_expired';

export interface StateTransitionResult {
  user_id: string;
  from_state: UserMatchingState;
  to_state: UserMatchingState;
  timestamp: string;
}

/**
 * Transition user state through the state machine
 * 
 * @param userId - User ID
 * @param eventType - Event type triggering the transition
 * @param eventData - Additional event data (optional)
 * @returns Transition result
 */
export async function transitionState(
  userId: string,
  eventType: StateTransitionEvent,
  eventData?: Record<string, any>
): Promise<StateTransitionResult> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('state_machine_transition', {
    p_user_id: userId,
    p_event_type: eventType,
    p_event_data: eventData || {}
  });

  if (error) {
    throw new Error(`State transition failed: ${error.message}`);
  }

  return data as StateTransitionResult;
}

/**
 * Get current state for a user
 * 
 * @param userId - User ID
 * @returns Current state or null if not in queue
 */
export async function getCurrentState(
  userId: string
): Promise<UserMatchingState | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('matching_queue')
    .select('status')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.status as UserMatchingState;
}

/**
 * Check if user is in a matchable state
 * 
 * @param userId - User ID
 * @returns True if user can be matched
 */
export async function isMatchable(userId: string): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('is_matchable', {
    p_user_id: userId
  });

  if (error) {
    console.error('Error checking if matchable:', error);
    return false;
  }

  return data === true;
}

