-- ============================================================================
-- Blueprint Migration 301: Queue Join
-- ============================================================================
-- Part 3.1: THE ONLY FUNCTION THAT ADDS USERS TO QUEUE
-- ============================================================================

-- THE ONLY FUNCTION THAT ADDS USERS TO QUEUE
CREATE OR REPLACE FUNCTION queue_join(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  queue_id UUID;
BEGIN
  -- 1. Transition to spin_active (handles NULL state for new users)
  PERFORM state_machine_transition(p_user_id, 'spin_start');
  
  -- 2. Create/update queue entry
  -- NOTE: Preferences are stored in user_preferences table, not matching_queue
  INSERT INTO matching_queue (user_id, status, joined_at)
  VALUES (p_user_id, 'spin_active', NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'spin_active',
      joined_at = NOW(),
      fairness_score = 0,
      skip_count = 0,
      updated_at = NOW(),
      -- Reset preference expansion fields
      expanded_preferences = NULL,
      expansion_level = NULL,
      original_min_age = NULL,
      original_max_age = NULL,
      original_max_distance = NULL,
      original_gender_preference = NULL,
      last_expansion_at = NULL
  RETURNING id INTO queue_id;
  
  -- 3. Calculate initial fairness score
  PERFORM calculate_fairness_score(p_user_id);
  
  -- 4. Transition to queue_waiting (state machine handles status update)
  PERFORM state_machine_transition(p_user_id, 'queue_joined');
  
  -- State machine transition already updated status to 'queue_waiting'
  -- No direct SQL update needed - state machine is single source of truth
  
  RETURN queue_id;
END;
$$;

COMMENT ON FUNCTION queue_join IS 'THE ONLY FUNCTION THAT ADDS USERS TO QUEUE - Single entry point for queue operations';

