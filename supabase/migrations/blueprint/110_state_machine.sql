-- ============================================================================
-- Migration 110: State Machine Transitions
-- ============================================================================
-- Part 4.2: Legal state transitions enforcement
-- ============================================================================

-- Validate state transition
CREATE OR REPLACE FUNCTION validate_state_transition(
  p_user_id UUID,
  p_from_state TEXT,
  p_to_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Define legal transitions
  CASE p_from_state
    WHEN 'idle' THEN
      RETURN p_to_state IN ('spin_active');
    WHEN 'spin_active' THEN
      RETURN p_to_state IN ('queue_waiting', 'idle');
    WHEN 'queue_waiting' THEN
      RETURN p_to_state IN ('paired', 'idle');
    WHEN 'paired' THEN
      RETURN p_to_state IN ('vote_active', 'idle');
    WHEN 'vote_active' THEN
      RETURN p_to_state IN ('spin_active', 'idle', 'cooldown');
    WHEN 'cooldown' THEN
      RETURN p_to_state IN ('idle');
    WHEN 'offline' THEN
      RETURN p_to_state IN ('idle');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

-- Execute state transition
CREATE OR REPLACE FUNCTION execute_state_transition(
  p_user_id UUID,
  p_to_state TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_state TEXT;
BEGIN
  -- Get current state
  SELECT state INTO current_state
  FROM user_status
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Create initial state
    INSERT INTO user_status (user_id, state, online_status, last_heartbeat)
    VALUES (p_user_id, 'idle', TRUE, NOW());
    current_state := 'idle';
  END IF;
  
  -- Validate transition
  IF NOT validate_state_transition(p_user_id, current_state, p_to_state) THEN
    -- Log illegal transition attempt
    INSERT INTO debug_logs (user_id, event_type, metadata, severity)
    VALUES (
      p_user_id,
      'illegal_state_transition',
      jsonb_build_object('from', current_state, 'to', p_to_state),
      'error'
    );
    RETURN FALSE;
  END IF;
  
  -- Execute transition
  UPDATE user_status
  SET state = p_to_state,
      last_state = current_state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_state_transition IS 'Validates legal state transitions according to Part 4.2';
COMMENT ON FUNCTION execute_state_transition IS 'Executes state transition with validation';
