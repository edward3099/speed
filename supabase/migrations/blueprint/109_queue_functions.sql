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
  -- Check user is online
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM users
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Check not already in queue
  IF EXISTS (SELECT 1 FROM queue WHERE user_id = p_user_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Update user_status to spin_active
  UPDATE user_status
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
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
