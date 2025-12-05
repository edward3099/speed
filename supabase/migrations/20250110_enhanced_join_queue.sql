-- ============================================================================
-- Enhanced join_queue Function
-- ============================================================================
-- Phase 2.1: Add advisory locks, validation, and logging to join_queue
-- ============================================================================

-- Drop existing function to recreate with enhancements
DROP FUNCTION IF EXISTS join_queue(UUID);

-- Enhanced join_queue function with preventive measures
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
  v_current_state TEXT;
  v_lock_acquired BOOLEAN;
  v_start_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Try to acquire advisory lock (non-blocking)
  -- This prevents concurrent processing of the same user
  SELECT pg_try_advisory_xact_lock(hashtext(p_user_id::TEXT)) INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    -- Another process is already processing this user, skip
    -- Log the attempt
    INSERT INTO spinning_log (user_id, action, error_message, metadata)
    VALUES (
      p_user_id,
      'join_failed',
      'Advisory lock not acquired - concurrent processing',
      jsonb_build_object('reason', 'lock_not_acquired')
    );
    RETURN;
  END IF;
  
  -- Validate user can spin (state must be 'idle' or 'waiting')
  SELECT COALESCE(state, 'idle') INTO v_current_state
  FROM users_state
  WHERE user_id = p_user_id;
  
  -- If user is in invalid state (not idle or waiting), log and return
  IF v_current_state NOT IN ('idle', 'waiting') THEN
    INSERT INTO spinning_log (user_id, action, error_message, metadata)
    VALUES (
      p_user_id,
      'join_failed',
      format('User cannot spin from state: %s', v_current_state),
      jsonb_build_object('current_state', v_current_state)
    );
    RETURN;
  END IF;
  
  -- Get current fairness (default to 0 if new user)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update or insert user state (idempotent)
  INSERT INTO users_state (
    user_id,
    state,
    waiting_since,
    fairness,
    partner_id,
    match_id,
    last_active,
    updated_at
  )
  VALUES (
    p_user_id,
    'waiting',
    NOW(),
    COALESCE(v_fairness, 0),
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    state = 'waiting',
    waiting_since = NOW(),
    partner_id = NULL,
    match_id = NULL,
    last_active = NOW(),
    updated_at = NOW(),
    fairness = COALESCE(users_state.fairness, 0);

  -- Add to queue (idempotent)
  INSERT INTO queue (
    user_id,
    fairness,
    waiting_since,
    preference_stage,
    updated_at
  )
  VALUES (
    p_user_id,
    COALESCE(v_fairness, 0),
    NOW(),
    0,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    fairness = COALESCE(EXCLUDED.fairness, queue.fairness),
    waiting_since = NOW(),
    preference_stage = 0,
    updated_at = NOW();
  
  -- Calculate duration
  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  
  -- Log successful join
  INSERT INTO spinning_log (user_id, action, duration_ms, metadata)
  VALUES (
    p_user_id,
    'join_succeeded',
    v_duration_ms,
    jsonb_build_object(
      'fairness', COALESCE(v_fairness, 0),
      'previous_state', v_current_state
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
    INSERT INTO spinning_log (user_id, action, duration_ms, error_message, metadata)
    VALUES (
      p_user_id,
      'join_failed',
      v_duration_ms,
      SQLERRM,
      jsonb_build_object('error_code', SQLSTATE)
    );
    RAISE;
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Enhanced join_queue with advisory locks, validation, and logging - prevents concurrent processing and validates state';

