-- ============================================================================
-- Auto-Remove Offline Users Function
-- ============================================================================
-- Phase 4.4: Removes offline users from queue and cancels matches
-- ============================================================================

-- Function to auto-remove offline users
CREATE OR REPLACE FUNCTION auto_remove_offline_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_removed INTEGER := 0;
  v_cancelled INTEGER := 0;
BEGIN
  -- Remove offline users from queue
  -- Users are offline if last_active > 10 seconds ago
  DELETE FROM queue
  WHERE user_id IN (
    SELECT user_id FROM users_state
    WHERE last_active < NOW() - INTERVAL '10 seconds'
      AND state = 'waiting'
  );
  
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  
  -- Cancel matches with offline users
  UPDATE matches
  SET
    status = 'cancelled',
    ended_at = NOW(),
    updated_at = NOW()
  WHERE match_id IN (
    SELECT m.match_id FROM matches m
    JOIN users_state u1 ON m.user1_id = u1.user_id
    JOIN users_state u2 ON m.user2_id = u2.user_id
    WHERE (u1.last_active < NOW() - INTERVAL '10 seconds' 
       OR u2.last_active < NOW() - INTERVAL '10 seconds')
    AND m.status IN ('pending', 'vote_active')
  );
  
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  
  -- Update user states to idle for offline users in matches
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE last_active < NOW() - INTERVAL '10 seconds'
    AND state IN ('paired', 'vote_window');
  
  RETURN v_removed + v_cancelled;
END;
$$;

COMMENT ON FUNCTION auto_remove_offline_users IS 'Removes offline users (last_active > 10s) from queue and cancels their matches - runs every 2 seconds';

