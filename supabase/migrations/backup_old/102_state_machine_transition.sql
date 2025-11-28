-- ============================================================================
-- Blueprint Migration 102: State Machine Transition Engine
-- ============================================================================
-- Part 1.2: THE ONLY FUNCTION THAT CHANGES STATE
-- ============================================================================

-- THE ONLY FUNCTION THAT CHANGES STATE
CREATE OR REPLACE FUNCTION state_machine_transition(
  p_user_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  current_state user_matching_state;
  new_state user_matching_state;
  transition_result JSONB;
BEGIN
  -- 1. Get current state (with lock)
  SELECT status INTO current_state
  FROM matching_queue
  WHERE user_id = p_user_id
  FOR UPDATE NOWAIT;
  
  -- 2. Validate transition based on event
  new_state := validate_transition(current_state, p_event_type, p_event_data);
  
  -- 3. Execute transition atomically
  transition_result := execute_transition(p_user_id, current_state, new_state, p_event_data);
  
  -- 4. Return result
  RETURN transition_result;
END;
$$;

COMMENT ON FUNCTION state_machine_transition IS 'THE ONLY FUNCTION THAT CHANGES STATE - Single entry point for all state transitions';

