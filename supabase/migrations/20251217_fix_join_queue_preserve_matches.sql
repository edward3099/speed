-- ============================================================================
-- Fix: join_queue should NOT clear matches when user is already matched
-- ============================================================================
-- Issue: When both users spin simultaneously, the second user's join_queue
--        call clears their match_id, destroying the match that was just created
-- Fix: Only allow join_queue if user is in 'idle' or 'waiting' state
--      If user is already 'matched', return early without clearing match
-- ============================================================================

CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
  v_current_state TEXT;
BEGIN
  -- Get current state and fairness
  SELECT 
    COALESCE(state, 'idle'),
    COALESCE(fairness, 0)
  INTO v_current_state, v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- CRITICAL FIX: If user is already matched, don't clear their match!
  -- They should stay matched and not rejoin queue
  IF v_current_state = 'matched' THEN
    -- User is already matched - don't clear their match_id
    -- Just update last_active to keep them online
    UPDATE users_state
    SET
      last_active = NOW(),
      updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN; -- Exit early, don't clear match
  END IF;

  -- Only allow joining queue from 'idle' or 'waiting' states
  -- This prevents clearing matches when user is already matched
  IF v_current_state NOT IN ('idle', 'waiting') THEN
    -- Invalid state transition - log and return
    -- Don't throw error, just silently return (idempotent behavior)
    RETURN;
  END IF;

  -- Single atomic operation: Update or insert user state
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
    fairness = COALESCE(users_state.fairness, 0)
  WHERE users_state.state IN ('idle', 'waiting'); -- Only update if in valid states
  
  -- Note: Database constraints ensure valid state transitions
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Add user to queue (idle → waiting). CRITICAL: Preserves matches - does NOT clear match_id if user is already matched. Only allows joining from idle or waiting states.';



