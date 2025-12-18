-- ============================================================================
-- Fix: Set last_active on Initial Join Queue
-- ============================================================================
-- CRITICAL FIX: Users who join queue should be immediately eligible for matching
-- 
-- Problem: join_queue doesn't set last_active, so users have NULL last_active
-- Result: Users are excluded from matching_pool (requires last_active > NOW() - 10s)
-- Impact: 10-second delay before users can be matched after joining
-- 
-- Solution: Set last_active = NOW() when user first joins queue
-- After that, only heartbeat should update it (to maintain eligibility)
-- ============================================================================

CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
  v_current_state TEXT;
  v_start_time TIMESTAMPTZ;
  v_duration_ms INTEGER;
  v_is_new_user BOOLEAN;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get current state
  SELECT state INTO v_current_state
  FROM users_state
  WHERE user_id = p_user_id;
  
  -- Check if this is a new user (no existing state)
  v_is_new_user := (v_current_state IS NULL);
  
  -- Get current fairness (default to 0 if new user)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update or insert user state (idempotent)
  -- CRITICAL FIX: Set last_active = NOW() when user first joins
  -- This gives users immediate eligibility for matching
  -- After this, only heartbeat should update last_active (to maintain eligibility)
  INSERT INTO users_state (
    user_id,
    state,
    waiting_since,
    fairness,
    partner_id,
    match_id,
    last_active,  -- CRITICAL: Set on initial join for immediate eligibility
    updated_at
  )
  VALUES (
    p_user_id,
    'waiting',
    NOW(),
    COALESCE(v_fairness, 0),
    NULL,
    NULL,
    NOW(),  -- CRITICAL: Set last_active on join so user is immediately eligible
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    state = 'waiting',
    waiting_since = NOW(),
    partner_id = NULL,
    match_id = NULL,
    -- CRITICAL: Only update last_active if it's NULL or very old (>30s)
    -- This preserves recent heartbeat timestamps while fixing stale users
    last_active = CASE
      WHEN users_state.last_active IS NULL THEN NOW()  -- Never had heartbeat, set now
      WHEN users_state.last_active <= NOW() - INTERVAL '30 seconds' THEN NOW()  -- Very stale, refresh
      ELSE users_state.last_active  -- Recent heartbeat, preserve it
    END,
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
  BEGIN
    INSERT INTO spinning_log (user_id, action, duration_ms, metadata)
    VALUES (
      p_user_id,
      'join_succeeded',
      v_duration_ms,
      jsonb_build_object(
        'fairness', COALESCE(v_fairness, 0),
        'previous_state', v_current_state,
        'last_active_set', true,
        'immediately_eligible', true
      )
    );
  EXCEPTION WHEN undefined_table THEN
    NULL; -- Ignore if table doesn't exist
  END;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
    BEGIN
      INSERT INTO spinning_log (user_id, action, duration_ms, error_message, metadata)
      VALUES (
        p_user_id,
        'join_failed',
        v_duration_ms,
        SQLERRM,
        jsonb_build_object('error_code', SQLSTATE)
      );
    EXCEPTION WHEN undefined_table THEN
      NULL; -- Ignore if table doesn't exist
    END;
    RAISE;
END;
$$;

COMMENT ON FUNCTION join_queue IS 'CRITICAL FIX: Sets last_active on initial join for immediate matching eligibility. After join, only heartbeat should update last_active to maintain eligibility.';






























