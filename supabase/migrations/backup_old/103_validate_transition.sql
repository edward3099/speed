-- ============================================================================
-- Blueprint Migration 103: Validate Transition
-- ============================================================================
-- Part 1.3: Valid Transitions (Centralized Rules)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_transition(
  p_current_state user_matching_state,
  p_event_type TEXT,
  p_event_data JSONB
) RETURNS user_matching_state AS $$
BEGIN
  CASE p_event_type
    WHEN 'spin_start' THEN
      -- Allow transition from NULL (user not in queue), idle, ended, disconnected, soft_offline
      -- Also allow from queue_waiting, paired, vote_active (force respin)
      IF p_current_state IS NULL OR p_current_state IN (
        'idle', 
        'ended', 
        'disconnected', 
        'soft_offline',
        'queue_waiting',  -- Allow respin from queue
        'paired',         -- Allow respin from paired (match broken)
        'vote_active'     -- Allow respin from vote (after pass)
      ) THEN
        RETURN 'spin_active';
      END IF;
      
    WHEN 'queue_joined' THEN
      -- Only allow from spin_active
      IF p_current_state = 'spin_active' THEN
        RETURN 'queue_waiting';
      END IF;
      
    WHEN 'match_found' THEN
      -- Allow from queue_waiting or spin_active
      IF p_current_state IN ('queue_waiting', 'spin_active') THEN
        RETURN 'paired';
      END IF;
      
    WHEN 'reveal_complete' THEN
      -- Only allow from paired
      IF p_current_state = 'paired' THEN
        RETURN 'vote_active';
      END IF;
      
    WHEN 'both_voted_yes' THEN
      -- Only allow from vote_active
      IF p_current_state = 'vote_active' THEN
        RETURN 'video_date';
      END IF;
      
    WHEN 'one_voted_pass' THEN
      -- Only allow from vote_active (respin)
      IF p_current_state = 'vote_active' THEN
        RETURN 'spin_active';
      END IF;
      
    WHEN 'session_ended' THEN
      -- Only allow from video_date
      IF p_current_state = 'video_date' THEN
        RETURN 'ended';
      END IF;
      
    WHEN 'user_disconnected' THEN
      -- Allow from any state (grace period)
      RETURN 'soft_offline';
      
    WHEN 'user_reconnected' THEN
      -- Only allow from disconnected or soft_offline
      IF p_current_state IN ('disconnected', 'soft_offline') THEN
        -- Return to appropriate state based on context
        RETURN determine_reconnect_state(p_event_data);
      END IF;
      
    WHEN 'grace_period_expired' THEN
      -- Only allow from soft_offline
      IF p_current_state = 'soft_offline' THEN
        RETURN 'disconnected';
      END IF;
      
    ELSE
      -- Unknown event type
      RAISE EXCEPTION 'Unknown event type: %', p_event_type;
  END CASE;
  
  -- If we get here, the transition is invalid for this state/event combination
  RAISE EXCEPTION 'Invalid transition from state % on event %', p_current_state, p_event_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_transition IS 'Validates state transitions based on current state and event type';

