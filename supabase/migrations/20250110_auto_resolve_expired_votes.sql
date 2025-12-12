-- ============================================================================
-- Auto-Resolve Expired Vote Windows Function
-- ============================================================================
-- Phase 4.5: Resolves expired vote windows
-- ============================================================================

-- Function to auto-resolve expired vote windows
CREATE OR REPLACE FUNCTION auto_resolve_expired_vote_windows()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resolved INTEGER := 0;
BEGIN
  -- Resolve matches with expired vote windows as 'idle_idle'
  UPDATE matches
  SET
    outcome = 'idle_idle',
    status = 'ended',
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE vote_window_expires_at < NOW()
    AND outcome IS NULL
    AND status = 'vote_active';
  
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  
  -- Update user states to idle for expired vote windows
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE state = 'vote_window'
    AND match_id IN (
      SELECT match_id FROM matches
      WHERE vote_window_expires_at < NOW()
        AND outcome = 'idle_idle'
    );
  
  -- Add to never_pair_again history for expired votes
  BEGIN
    INSERT INTO never_pair_again (user1, user2, reason)
    SELECT 
      LEAST(m.user1_id, m.user2_id),
      GREATEST(m.user1_id, m.user2_id),
      'idle_idle'
    FROM matches m
    WHERE m.vote_window_expires_at < NOW()
      AND m.outcome = 'idle_idle'
      AND NOT EXISTS (
        SELECT 1 FROM never_pair_again npa
        WHERE (npa.user1 = LEAST(m.user1_id, m.user2_id)
          AND npa.user2 = GREATEST(m.user1_id, m.user2_id))
      )
    ON CONFLICT DO NOTHING;
  EXCEPTION
    WHEN undefined_table THEN
      -- never_pair_again table doesn't exist, skip
      NULL;
  END;
  
  RETURN v_resolved;
END;
$$;

COMMENT ON FUNCTION auto_resolve_expired_vote_windows IS 'Resolves expired vote windows as idle_idle and updates user states - runs every 2 seconds';

