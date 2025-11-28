-- ============================================================================
-- Blueprint Migration 105: Execute Transition
-- ============================================================================
-- Part 1.4: Transition Execution
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_transition(
  p_user_id UUID,
  p_from_state user_matching_state,
  p_to_state user_matching_state,
  p_event_data JSONB
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Update state atomically
  UPDATE matching_queue
  SET status = p_to_state,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Handle state-specific logic
  CASE p_to_state
    WHEN 'vote_active' THEN
      -- Reset fairness score on match
      UPDATE matching_queue
      SET fairness_score = 0,
          skip_count = 0
      WHERE user_id = p_user_id;
      
    WHEN 'spin_active' THEN
      -- Reset fairness score on respin (but keep boost if applicable)
      -- Fairness boost is applied separately via apply_fairness_boost()
      NULL;
      
    ELSE
      -- No special logic needed for other states
      NULL;
  END CASE;
  
  -- Log transition
  PERFORM log_event('state_transition', p_user_id, 
    jsonb_build_object(
      'from_state', p_from_state,
      'to_state', p_to_state,
      'event_data', p_event_data
    ),
    'INFO',
    'execute_transition'
  );
  
  -- Return result
  result := jsonb_build_object(
    'user_id', p_user_id,
    'from_state', p_from_state,
    'to_state', p_to_state,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION execute_transition IS 'Executes state transition atomically with state-specific logic';

