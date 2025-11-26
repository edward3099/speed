-- ============================================================================
-- Blueprint Migration 501: Heartbeat Update
-- ============================================================================
-- Part 5.1: THE ONLY FUNCTION THAT HANDLES HEARTBEAT
-- ============================================================================

-- THE ONLY FUNCTION THAT HANDLES HEARTBEAT
CREATE OR REPLACE FUNCTION heartbeat_update(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
BEGIN
  -- 1. Update last_seen timestamp (but NOT is_online yet)
  -- is_online is only updated by handle_user_offline() and finalize_user_offline()
  UPDATE profiles
  SET last_seen = NOW()
  WHERE id = p_user_id;
  
  -- 2. Check if user was previously offline
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  IF user_state = 'soft_offline' THEN
    -- User reconnected within grace period
    -- Restore to previous state (before soft_offline)
    UPDATE matching_queue
    SET status = COALESCE(
      (SELECT status FROM matching_queue WHERE user_id = p_user_id 
       ORDER BY updated_at DESC LIMIT 1),
      'queue_waiting'
    ),
    disconnected_at = NULL,
    updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Now mark as online (after restoring queue state)
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
    
    PERFORM state_machine_transition(p_user_id, 'user_reconnected');
  ELSIF user_state = 'disconnected' THEN
    -- Mark as online first
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
    PERFORM state_machine_transition(p_user_id, 'user_reconnected');
  ELSE
    -- User is active - ensure they're marked online
    UPDATE profiles SET is_online = TRUE WHERE id = p_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION heartbeat_update IS 'THE ONLY FUNCTION THAT HANDLES HEARTBEAT - Updates last_seen and handles reconnection from soft_offline';

