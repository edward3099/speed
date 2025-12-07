-- ============================================================================
-- Acknowledge Match Atomic Function
-- ============================================================================
-- Atomically acknowledges a match, transitions to vote_window when both acknowledge,
-- and logs the operation. Includes preventive measures like advisory locks.
-- ============================================================================

CREATE OR REPLACE FUNCTION acknowledge_match_atomic(
  p_user_id UUID,
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_user_state RECORD;
  v_partner_state RECORD;
  v_lock_acquired BOOLEAN;
  v_vote_window_started BOOLEAN := FALSE;
  v_start_time TIMESTAMPTZ := NOW();
  v_error_message TEXT := NULL;
BEGIN
  -- Try to acquire advisory lock on match (non-blocking)
  -- This prevents multiple concurrent acknowledgment attempts for the same match
  SELECT pg_try_advisory_xact_lock(hashtext(p_match_id::TEXT)) INTO v_lock_acquired;

  IF NOT v_lock_acquired THEN
    -- Another process is already processing this match
    -- Return current state without error (idempotent)
    SELECT vote_window_expires_at INTO v_match
    FROM matches
    WHERE match_id = p_match_id;
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'vote_window_started', v_match.vote_window_expires_at IS NOT NULL,
      'vote_window_expires_at', v_match.vote_window_expires_at,
      'waiting_for_partner', v_match.vote_window_expires_at IS NULL
    );
  END IF;

  -- Get match info with FOR UPDATE to lock the row
  SELECT user1_id, user2_id, status, vote_window_started_at, vote_window_expires_at
  INTO v_match
  FROM matches
  WHERE match_id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_error_message := 'Match not found: ' || p_match_id;
    RAISE EXCEPTION '%', v_error_message;
  END IF;

  -- Get user state with FOR UPDATE
  SELECT state, partner_id, match_id, acknowledged_at
  INTO v_user_state
  FROM users_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_error_message := 'User state not found: ' || p_user_id;
    RAISE EXCEPTION '%', v_error_message;
  END IF;

  -- Validate user is in correct state (paired or vote_window)
  IF v_user_state.state NOT IN ('paired', 'vote_window') THEN
    v_error_message := format('User cannot acknowledge from state: %s', v_user_state.state);
    RAISE EXCEPTION '%', v_error_message;
  END IF;

  -- Validate match_id matches
  IF v_user_state.match_id != p_match_id THEN
    v_error_message := format('User match_id (%s) does not match provided match_id (%s)', v_user_state.match_id, p_match_id);
    RAISE EXCEPTION '%', v_error_message;
  END IF;

  -- If already in vote_window, vote window already started - return success
  IF v_user_state.state = 'vote_window' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'vote_window_started', TRUE,
      'vote_window_expires_at', v_match.vote_window_expires_at,
      'waiting_for_partner', FALSE
    );
  END IF;

  -- Mark user as acknowledged (idempotent - update acknowledged_at)
  UPDATE users_state
  SET
    acknowledged_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Get partner state to check if both acknowledged
  SELECT state, acknowledged_at
  INTO v_partner_state
  FROM users_state
  WHERE user_id = v_user_state.partner_id;

  -- Check if both users have acknowledged (or partner already in vote_window)
  IF v_partner_state.acknowledged_at IS NOT NULL OR v_partner_state.state = 'vote_window' THEN
    -- Both acknowledged - start vote window
    -- Update match to set vote_window_started_at if not already set
    IF v_match.vote_window_started_at IS NULL THEN
      UPDATE matches
      SET
        status = 'vote_active',
        vote_window_started_at = NOW(),
        vote_window_expires_at = NOW() + INTERVAL '10 seconds',
        updated_at = NOW()
      WHERE match_id = p_match_id;
    END IF;

    -- Transition both users to vote_window state
    UPDATE users_state
    SET
      state = 'vote_window',
      updated_at = NOW()
    WHERE user_id IN (p_user_id, v_user_state.partner_id);

    v_vote_window_started := TRUE;

    -- Log flow step for both users
    INSERT INTO flow_log (match_id, user_id, step, metadata)
    VALUES (p_match_id, p_user_id, 'vote_window_started', jsonb_build_object('triggered_by', p_user_id))
    ON CONFLICT DO NOTHING;
    
    INSERT INTO flow_log (match_id, user_id, step, metadata)
    VALUES (p_match_id, v_user_state.partner_id, 'vote_window_started', jsonb_build_object('triggered_by', p_user_id))
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get updated match info for return
  SELECT vote_window_expires_at INTO v_match
  FROM matches
  WHERE match_id = p_match_id;

  -- Log acknowledgment
  INSERT INTO voting_log (match_id, user_id, action, duration_ms, metadata)
  VALUES (
    p_match_id,
    p_user_id,
    'acknowledged',
    EXTRACT(EPOCH FROM (NOW() - v_start_time)) * 1000,
    jsonb_build_object(
      'vote_window_started', v_vote_window_started,
      'waiting_for_partner', NOT v_vote_window_started
    )
  );

  -- Log flow step
  INSERT INTO flow_log (match_id, user_id, step, metadata)
  VALUES (p_match_id, p_user_id, 'acknowledged', jsonb_build_object('vote_window_started', v_vote_window_started))
  ON CONFLICT DO NOTHING;

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'vote_window_started', v_vote_window_started,
    'vote_window_expires_at', v_match.vote_window_expires_at,
    'waiting_for_partner', NOT v_vote_window_started
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO voting_log (match_id, user_id, action, duration_ms, error_message, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'acknowledgment_failed',
      EXTRACT(EPOCH FROM (NOW() - v_start_time)) * 1000,
      COALESCE(v_error_message, SQLERRM),
      jsonb_build_object('error_code', SQLSTATE)
    );
    RAISE; -- Re-raise the exception
END;
$$;

COMMENT ON FUNCTION acknowledge_match_atomic IS 'Atomically acknowledges a match, transitions to vote_window when both acknowledge, and logs the operation with preventive locks and validation.';












