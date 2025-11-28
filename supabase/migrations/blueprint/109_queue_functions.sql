-- ============================================================================
-- Migration 109: Queue Functions
-- ============================================================================
-- Part 5.3: Queue management
-- ============================================================================

-- Join queue
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_online BOOLEAN;
  user_cooldown TIMESTAMPTZ;
BEGIN
  -- Check user is online (from profiles table)
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Remove from queue if already exists (allows re-joining)
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO UPDATE
  SET fairness_score = 0,
      spin_started_at = NOW(),
      preference_stage = 0,
      updated_at = NOW();
  
  -- Ensure user_status exists and update to spin_active
  -- Use INSERT ... ON CONFLICT to handle both new and existing users
  INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  VALUES (p_user_id, 'spin_active', NOW(), 'idle', NOW(), NOW(), TRUE, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(user_status.state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW(),
      online_status = TRUE,
      last_heartbeat = NOW();
  
  RETURN TRUE;
END;
$$;

-- Remove from queue
CREATE OR REPLACE FUNCTION remove_from_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM queue WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Joins user to queue - validates online, cooldown, duplicates';
COMMENT ON FUNCTION remove_from_queue IS 'Removes user from queue';
