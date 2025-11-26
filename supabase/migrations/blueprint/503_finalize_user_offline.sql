-- ============================================================================
-- Blueprint Migration 503: Finalize User Offline
-- ============================================================================
-- Part 5.2: Finalize offline after 10-second grace period
-- ============================================================================

-- Finalize offline after 10-second grace period
CREATE OR REPLACE FUNCTION finalize_user_offline(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
  active_match_id UUID;
  partner_id UUID;
  disconnected_time TIMESTAMPTZ;
BEGIN
  -- Check if still in soft_offline and > 10 seconds
  SELECT status, disconnected_at INTO user_state, disconnected_time
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  IF user_state != 'soft_offline' THEN
    -- User reconnected, do nothing
    RETURN;
  END IF;
  
  IF disconnected_time IS NULL OR disconnected_time > NOW() - INTERVAL '10 seconds' THEN
    -- Still in grace period
    RETURN;
  END IF;
  
  -- Finalize offline (grace period expired)
  UPDATE profiles SET is_online = FALSE WHERE id = p_user_id;
  
  -- Handle based on previous state
  IF user_state = 'queue_waiting' OR user_state = 'spin_active' THEN
    PERFORM queue_remove(p_user_id, 'user_offline_after_grace');
    
  ELSIF user_state = 'vote_active' THEN
    SELECT id INTO active_match_id
    FROM matches
    WHERE (user1_id = p_user_id OR user2_id = p_user_id)
      AND status = 'pending';
    
    IF active_match_id IS NOT NULL THEN
      SELECT 
        CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
      INTO partner_id
      FROM matches
      WHERE id = active_match_id;
      
      -- Clean up metadata (revealed_users) before deleting match
      UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = active_match_id;
      DELETE FROM matches WHERE id = active_match_id;
      DELETE FROM votes WHERE match_id = active_match_id;
      
      PERFORM state_machine_transition(partner_id, 'partner_disconnected', 
        jsonb_build_object('after_grace_period', true));
      PERFORM apply_fairness_boost(partner_id, 10, 'partner_went_offline_after_grace');
    END IF;
    
    PERFORM queue_remove(p_user_id, 'user_offline_after_grace');
  END IF;
  
  -- Transition to disconnected
  PERFORM state_machine_transition(p_user_id, 'grace_period_expired');
END;
$$;

COMMENT ON FUNCTION finalize_user_offline IS 'Finalizes offline status after 10-second grace period expires - breaks matches and removes from queue';

