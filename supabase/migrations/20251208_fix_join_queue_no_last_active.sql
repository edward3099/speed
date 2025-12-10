-- ============================================================================
-- Fix: Don't Set last_active on join_queue - Only Update via Heartbeat
-- ============================================================================
-- CRITICAL FIX: last_active should ONLY be updated via heartbeat, not on join
-- This ensures users who join but never send heartbeat are immediately stale
-- ============================================================================

-- Update join_queue to NOT set last_active (only heartbeat should update it)
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
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get current state
  SELECT state INTO v_current_state
  FROM users_state
  WHERE user_id = p_user_id;
  
  -- Get current fairness (default to 0 if new user)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update or insert user state (idempotent)
  -- CRITICAL: Do NOT set last_active here - only heartbeat should update it
  INSERT INTO users_state (
    user_id,
    state,
    waiting_since,
    fairness,
    partner_id,
    match_id,
    updated_at
    -- last_active is NOT set here - only updated via heartbeat
  )
  VALUES (
    p_user_id,
    'waiting',
    NOW(),
    COALESCE(v_fairness, 0),
    NULL,
    NULL,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    state = 'waiting',
    waiting_since = NOW(),
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW(),
    fairness = COALESCE(users_state.fairness, 0)
    -- CRITICAL: Do NOT update last_active here - only heartbeat should update it
    -- This ensures users who join but never send heartbeat are immediately stale

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
      'previous_state', v_current_state,
      'note', 'last_active NOT set on join - only updated via heartbeat'
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

COMMENT ON FUNCTION join_queue IS 'Enhanced join_queue: Does NOT set last_active on join. last_active is only updated via heartbeat. This ensures users who join but never send heartbeat are immediately stale.';

-- Update the auto-update trigger to NOT auto-update last_active
-- Only explicit updates (e.g., from heartbeat endpoint) should update it
DROP TRIGGER IF EXISTS trigger_update_last_active ON users_state;

CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only update last_active if it's explicitly provided in NEW
  -- This allows heartbeat endpoint to update it, but prevents automatic updates
  IF NEW.last_active IS NOT NULL AND (OLD.last_active IS NULL OR NEW.last_active IS DISTINCT FROM OLD.last_active) THEN
    -- last_active was explicitly set (e.g., by heartbeat endpoint)
    -- Keep it as is
    RETURN NEW;
  ELSE
    -- last_active was not explicitly set - preserve old value (or keep NULL)
    -- This prevents stale users from appearing active
    IF OLD.last_active IS NOT NULL THEN
      NEW.last_active := OLD.last_active;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trigger_update_last_active
BEFORE UPDATE ON users_state
FOR EACH ROW
EXECUTE FUNCTION update_last_active();

COMMENT ON FUNCTION update_last_active IS 'Only updates last_active if explicitly provided. Prevents automatic updates that would make stale users appear active.';
COMMENT ON TRIGGER trigger_update_last_active ON users_state IS 'Only updates last_active when explicitly set (e.g., by heartbeat endpoint), preventing stale users from appearing active.';
