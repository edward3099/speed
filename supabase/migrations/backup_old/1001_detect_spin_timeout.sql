-- ============================================================================
-- Blueprint Migration 1001: Detect Spin Timeout
-- ============================================================================
-- Part 9.5.1: Real-Time Spin Timeout Detection
-- ============================================================================

-- Detect and handle spin timeouts in real-time (not just cron)
CREATE OR REPLACE FUNCTION detect_spin_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spin_started_at TIMESTAMPTZ;
  v_timeout_seconds INTEGER := 60; -- 60 second spin timeout
BEGIN
  -- Check if user is in spin_active state for too long
  SELECT joined_at INTO v_spin_started_at
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status = 'spin_active';
  
  IF v_spin_started_at IS NULL THEN
    RETURN FALSE; -- Not in spin state
  END IF;
  
  -- Check if timeout exceeded
  IF NOW() - v_spin_started_at > (v_timeout_seconds || ' seconds')::INTERVAL THEN
    -- Force transition to queue_waiting
    PERFORM state_machine_transition(
      p_user_id,
      'spin_timeout',
      jsonb_build_object('timeout_seconds', v_timeout_seconds)
    );
    
    PERFORM log_event('spin_timeout_detected', p_user_id, 
      jsonb_build_object('timeout_seconds', v_timeout_seconds));
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION detect_spin_timeout IS 'Detects spin timeouts in real-time (60 second timeout)';

