-- ============================================================================
-- Blueprint Migration 502: Handle User Offline
-- ============================================================================
-- Part 5.2: THE ONLY FUNCTION THAT HANDLES OFFLINE USERS (with grace period)
-- ============================================================================

-- THE ONLY FUNCTION THAT HANDLES OFFLINE USERS (with grace period)
CREATE OR REPLACE FUNCTION handle_user_offline(
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_state user_matching_state;
BEGIN
  -- 1. Mark as soft_offline (not fully offline yet - 10 second grace period)
  UPDATE matching_queue
  SET status = 'soft_offline',
      disconnected_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 2. Get current state (before soft_offline)
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- 3. Log soft offline (grace period started)
  -- Final offline handling happens in finalize_user_offline() after 10 seconds
  PERFORM log_event('user_offline_soft', p_user_id, 
    jsonb_build_object('reconnection_window', '10s', 'grace_period_start', NOW()),
    'INFO',
    'handle_user_offline'
  );
END;
$$;

COMMENT ON FUNCTION handle_user_offline IS 'Marks user as soft_offline (10-second grace period) - finalize_user_offline() handles final cleanup';

