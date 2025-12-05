-- ============================================================================
-- State Repair Function
-- ============================================================================
-- Phase 4.6: Fixes users stuck in intermediate states
-- ============================================================================

-- Function to repair stuck states
CREATE OR REPLACE FUNCTION repair_stuck_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repaired INTEGER := 0;
  v_temp INTEGER;
BEGIN
  -- Fix users in 'paired' state but vote_window never started (after 5s)
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE state = 'paired'
    AND match_id IN (
      SELECT match_id FROM matches
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '5 seconds'
        AND vote_window_started_at IS NULL
    );
  
  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_repaired := v_repaired + v_temp;
  
  -- Fix users in 'vote_window' but timer expired (should have been handled by auto_resolve_expired_vote_windows, but double-check)
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
        AND status = 'vote_active'
        AND outcome IS NULL
    );
  
  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_repaired := v_repaired + v_temp;
  
  -- Fix users with 'both_yes' outcome but no video-date
  BEGIN
    INSERT INTO video_dates (match_id, user1_id, user2_id, status)
    SELECT 
      m.match_id::TEXT,
      m.user1_id,
      m.user2_id,
      'countdown'
    FROM matches m
    WHERE m.outcome = 'both_yes'
      AND NOT EXISTS (
        SELECT 1 FROM video_dates vd
        WHERE vd.match_id = m.match_id::TEXT
      )
    ON CONFLICT DO NOTHING;
    
    -- Update user states to idle for these matches
    UPDATE users_state
    SET
      state = 'idle',
      partner_id = NULL,
      match_id = NULL,
      updated_at = NOW()
    WHERE match_id IN (
      SELECT match_id FROM matches
      WHERE outcome = 'both_yes'
        AND EXISTS (
          SELECT 1 FROM video_dates vd
          WHERE vd.match_id = matches.match_id::TEXT
        )
    )
    AND state != 'idle';
    
  EXCEPTION
    WHEN undefined_table THEN
      -- video_dates table doesn't exist, skip
      NULL;
  END;
  
  -- Fix users in invalid states (should not happen with state transition validation, but safety check)
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE state NOT IN ('idle', 'waiting', 'paired', 'vote_window', 'video_date', 'ended');
  
  GET DIAGNOSTICS v_temp = ROW_COUNT;
  v_repaired := v_repaired + v_temp;
  
  RETURN v_repaired;
END;
$$;

COMMENT ON FUNCTION repair_stuck_states IS 'Fixes users stuck in intermediate states - runs every 10 seconds';

