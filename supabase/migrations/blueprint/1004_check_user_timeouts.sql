-- ============================================================================
-- Blueprint Migration 1004: Check User Timeouts (Unified)
-- ============================================================================
-- Part 9.5.4: Check all timeouts for a user in real-time
-- ============================================================================

-- Check all timeouts for a user in real-time
CREATE OR REPLACE FUNCTION check_user_timeouts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timeouts JSONB := '{}'::JSONB;
BEGIN
  -- Check spin timeout
  IF detect_spin_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('spin_timeout', TRUE);
  END IF;
  
  -- Check reveal timeout
  IF detect_reveal_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('reveal_timeout', TRUE);
  END IF;
  
  -- Check vote timeout
  IF detect_vote_timeout(p_user_id) THEN
    v_timeouts := v_timeouts || jsonb_build_object('vote_timeout', TRUE);
  END IF;
  
  RETURN v_timeouts;
END;
$$;

COMMENT ON FUNCTION check_user_timeouts IS 'Unified function to check all timeouts for a user in real-time - call on every frontend heartbeat';

