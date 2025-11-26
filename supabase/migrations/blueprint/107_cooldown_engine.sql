-- ============================================================================
-- Migration 107: Cooldown Engine
-- ============================================================================
-- Part 5.8: Cooldown management (5 minutes)
-- ============================================================================

-- Set cooldown for user (5 minutes)
CREATE OR REPLACE FUNCTION set_cooldown(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set cooldown_until to 5 minutes from now (update profiles table)
  UPDATE profiles
  SET cooldown_until = NOW() + INTERVAL '5 minutes',
      updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Update user_status to cooldown
  UPDATE user_status
  SET state = 'cooldown',
      last_state = state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Remove from queue
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Break any active matches
  UPDATE matches
  SET status = 'cancelled'
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status IN ('pending', 'vote_active');
  
  -- Log cooldown
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'cooldown_applied', jsonb_build_object('duration_minutes', 5), 'warning');
END;
$$;

-- Check if user is in cooldown
CREATE OR REPLACE FUNCTION is_in_cooldown(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cooldown_until TIMESTAMPTZ;
BEGIN
  SELECT cooldown_until INTO cooldown_until
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN cooldown_until IS NOT NULL AND cooldown_until > NOW();
END;
$$;

COMMENT ON FUNCTION set_cooldown IS 'Sets 5-minute cooldown for user (applied on disconnect)';
COMMENT ON FUNCTION is_in_cooldown IS 'Checks if user is currently in cooldown';
