-- ============================================================================
-- Commander SQL Functions
-- ============================================================================
-- Creates the SQL RPC functions required by the Commander backend
-- ============================================================================

-- Function: join_queue
-- Called by: backend/domain/commander.ts handleSpin()
-- Purpose: Atomically join user to queue and update state
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
BEGIN
  -- Get current fairness (default to 0 if new user)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update or insert user state
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

  -- Add to queue
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
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Atomically joins user to queue and updates state to waiting';

-- Function: create_match_atomic
-- Called by: backend/domain/matching_engine.ts createPair()
-- Purpose: Atomically create match and update both user states with locking
CREATE OR REPLACE FUNCTION create_match_atomic(
  p_user1_id UUID,
  p_user2_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_user1_state TEXT;
  v_user2_state TEXT;
BEGIN
  -- Lock both users in consistent order (prevent deadlocks)
  -- Always lock lower UUID first
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first
    SELECT state INTO v_user1_state
    FROM users_state
    WHERE user_id = p_user1_id
    FOR UPDATE NOWAIT;

    -- Lock user2
    SELECT state INTO v_user2_state
    FROM users_state
    WHERE user_id = p_user2_id
    FOR UPDATE NOWAIT;
  ELSE
    -- Lock user2 first
    SELECT state INTO v_user2_state
    FROM users_state
    WHERE user_id = p_user2_id
    FOR UPDATE NOWAIT;

    -- Lock user1
    SELECT state INTO v_user1_state
    FROM users_state
    WHERE user_id = p_user1_id
    FOR UPDATE NOWAIT;
  END IF;

  -- Verify both users are in waiting state
  IF v_user1_state != 'waiting' OR v_user2_state != 'waiting' THEN
    RAISE EXCEPTION 'Users must be in waiting state to create match. User1: %, User2: %', v_user1_state, v_user2_state;
  END IF;

  -- Check if either user is already paired
  IF EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id IN (p_user1_id, p_user2_id)
    AND (state = 'paired' OR state = 'vote_window')
  ) THEN
    RAISE EXCEPTION 'One or both users are already paired';
  END IF;

  -- Generate match ID
  v_match_id := gen_random_uuid();

  -- Create match
  INSERT INTO matches (
    match_id,
    user1_id,
    user2_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_match_id,
    p_user1_id,
    p_user2_id,
    'pending',
    NOW(),
    NOW()
  );

  -- Update user1 state
  UPDATE users_state
  SET
    state = 'paired',
    partner_id = p_user2_id,
    match_id = v_match_id,
    updated_at = NOW()
  WHERE user_id = p_user1_id;

  -- Update user2 state
  UPDATE users_state
  SET
    state = 'paired',
    partner_id = p_user1_id,
    match_id = v_match_id,
    updated_at = NOW()
  WHERE user_id = p_user2_id;

  -- Remove both users from queue
  DELETE FROM queue
  WHERE user_id IN (p_user1_id, p_user2_id);

  -- Return match ID as JSON object (matches TypeScript expectation)
  RETURN json_build_object('match_id', v_match_id);
END;
$$;

COMMENT ON FUNCTION create_match_atomic IS 'Atomically creates match with row-level locking to prevent double-pairing';

