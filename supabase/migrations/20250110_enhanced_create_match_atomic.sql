-- ============================================================================
-- Enhanced create_match_atomic Function
-- ============================================================================
-- Phase 2.2: Add advisory locks, double-check locking, vote_window creation, and logging
-- ============================================================================

-- Drop existing function to recreate with enhancements
DROP FUNCTION IF EXISTS create_match_atomic(UUID, UUID);

-- Enhanced create_match_atomic function with preventive measures
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
  v_lock1_acquired BOOLEAN;
  v_lock2_acquired BOOLEAN;
  v_user1_waiting_since TIMESTAMPTZ;
  v_user2_waiting_since TIMESTAMPTZ;
  v_queue_size INTEGER;
  v_user1_wait_seconds INTEGER;
  v_user2_wait_seconds INTEGER;
BEGIN
  -- Try to acquire advisory locks for both users (non-blocking)
  -- Lock user1
  SELECT pg_try_advisory_xact_lock(hashtext(p_user1_id::TEXT)) INTO v_lock1_acquired;
  
  IF NOT v_lock1_acquired THEN
    -- Another process is already matching user1, skip
    RAISE EXCEPTION 'User1 is already being processed by another transaction';
  END IF;
  
  -- Lock user2
  SELECT pg_try_advisory_xact_lock(hashtext(p_user2_id::TEXT)) INTO v_lock2_acquired;
  
  IF NOT v_lock2_acquired THEN
    -- Another process is already matching user2, skip
    RAISE EXCEPTION 'User2 is already being processed by another transaction';
  END IF;
  
  -- Get queue size for logging
  SELECT COUNT(*) INTO v_queue_size FROM queue;
  
  -- Lock both users in consistent order (prevent deadlocks)
  -- Always lock lower UUID first
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first
    SELECT state, waiting_since INTO v_user1_state, v_user1_waiting_since
    FROM users_state
    WHERE user_id = p_user1_id
    FOR UPDATE NOWAIT;

    -- Lock user2
    SELECT state, waiting_since INTO v_user2_state, v_user2_waiting_since
    FROM users_state
    WHERE user_id = p_user2_id
    FOR UPDATE NOWAIT;
  ELSE
    -- Lock user2 first
    SELECT state, waiting_since INTO v_user2_state, v_user2_waiting_since
    FROM users_state
    WHERE user_id = p_user2_id
    FOR UPDATE NOWAIT;

    -- Lock user1
    SELECT state, waiting_since INTO v_user1_state, v_user1_waiting_since
    FROM users_state
    WHERE user_id = p_user1_id
    FOR UPDATE NOWAIT;
  END IF;

  -- Double-check locking: Re-validate states after acquiring locks
  -- Verify both users are in waiting state
  IF v_user1_state != 'waiting' OR v_user2_state != 'waiting' THEN
    -- Log failed attempt
    INSERT INTO matching_log (user1_id, user2_id, action, queue_size, failure_reason, metadata)
    VALUES (
      p_user1_id,
      p_user2_id,
      'match_failed',
      v_queue_size,
      format('Users must be in waiting state. User1: %, User2: %', v_user1_state, v_user2_state),
      jsonb_build_object(
        'user1_state', v_user1_state,
        'user2_state', v_user2_state
      )
    );
    RAISE EXCEPTION 'Users must be in waiting state to create match. User1: %, User2: %', v_user1_state, v_user2_state;
  END IF;

  -- Check if either user is already paired (double-check)
  IF EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id IN (p_user1_id, p_user2_id)
    AND (state = 'paired' OR state = 'vote_window')
  ) THEN
    -- Log failed attempt
    INSERT INTO matching_log (user1_id, user2_id, action, queue_size, failure_reason, metadata)
    VALUES (
      p_user1_id,
      p_user2_id,
      'match_failed',
      v_queue_size,
      'One or both users are already paired',
      jsonb_build_object(
        'user1_state', v_user1_state,
        'user2_state', v_user2_state
      )
    );
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

  -- Auto-create vote_window (don't wait for acknowledgment)
  -- Set vote_window_expires_at immediately so frontend can read it
  UPDATE matches
  SET
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '10 seconds',
    updated_at = NOW()
  WHERE match_id = v_match_id;

  -- Calculate wait times for logging
  IF v_user1_waiting_since IS NOT NULL THEN
    v_user1_wait_seconds := EXTRACT(EPOCH FROM (NOW() - v_user1_waiting_since))::INTEGER;
  ELSE
    v_user1_wait_seconds := 0;
  END IF;
  
  IF v_user2_waiting_since IS NOT NULL THEN
    v_user2_wait_seconds := EXTRACT(EPOCH FROM (NOW() - v_user2_waiting_since))::INTEGER;
  ELSE
    v_user2_wait_seconds := 0;
  END IF;
  
  -- Log successful match creation
  INSERT INTO matching_log (match_id, user1_id, user2_id, action, queue_size, wait_time_seconds, metadata)
  VALUES (
    v_match_id,
    p_user1_id,
    p_user2_id,
    'match_created',
    v_queue_size,
    GREATEST(v_user1_wait_seconds, v_user2_wait_seconds),
    jsonb_build_object(
      'user1_wait_seconds', v_user1_wait_seconds,
      'user2_wait_seconds', v_user2_wait_seconds,
      'vote_window_expires_at', (NOW() + INTERVAL '10 seconds')::TEXT
    )
  );
  
  -- Log flow step
  INSERT INTO flow_log (match_id, user_id, step, metadata)
  VALUES (
    v_match_id,
    p_user1_id,
    'match_created',
    jsonb_build_object('partner_id', p_user2_id)
  );
  
  INSERT INTO flow_log (match_id, user_id, step, metadata)
  VALUES (
    v_match_id,
    p_user2_id,
    'match_created',
    jsonb_build_object('partner_id', p_user1_id)
  );

  -- Return match ID as JSON object (matches TypeScript expectation)
  RETURN json_build_object('match_id', v_match_id);
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO matching_log (user1_id, user2_id, action, queue_size, failure_reason, metadata)
    VALUES (
      p_user1_id,
      p_user2_id,
      'match_failed',
      v_queue_size,
      SQLERRM,
      jsonb_build_object('error_code', SQLSTATE)
    );
    RAISE;
END;
$$;

COMMENT ON FUNCTION create_match_atomic IS 'Enhanced create_match_atomic with advisory locks, double-check locking, vote_window creation, and logging - prevents race conditions and ensures vote window is ready';

