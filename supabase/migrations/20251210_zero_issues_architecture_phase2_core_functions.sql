-- ============================================================================
-- Zero Issues Architecture: Phase 2 - Core Functions
-- ============================================================================
-- Implements event-driven matching with minimal functions:
-- 1. join_queue - Simplified, idempotent, atomic
-- 2. try_match_user - Event-driven matching for specific user
-- ============================================================================

-- ============================================================================
-- FUNCTION 1: join_queue
-- ============================================================================
-- Purpose: Add user to queue (idle → waiting)
-- Single atomic operation, idempotent, immediately eligible
-- ============================================================================

CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
BEGIN
  -- Get current fairness (preserve existing, default to 0)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

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
  WHERE users_state.state IN ('idle', 'waiting', 'matched');
  
  -- Note: Database constraints ensure valid state transitions
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Add user to queue (idle → waiting). Single atomic operation, idempotent, immediately eligible. Call try_match_user immediately after.';

-- ============================================================================
-- FUNCTION 2: try_match_user
-- ============================================================================
-- Purpose: Try to match this specific user with a partner (event-driven)
-- Uses advisory locks to prevent race conditions
-- Double-check locking ensures consistency
-- ============================================================================

CREATE OR REPLACE FUNCTION try_match_user(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_state RECORD;
  v_partner RECORD;
  v_match_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_lock_acquired BOOLEAN;
BEGIN
  -- Acquire advisory lock on user (non-blocking)
  -- Use hash of user_id for lock key
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(p_user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Another process is matching this user, skip
    RETURN NULL;
  END IF;

  -- Double-check: Verify user still in waiting state and online
  SELECT 
    user_id,
    state,
    last_active,
    fairness,
    waiting_since
  INTO v_user_state
  FROM users_state
  WHERE user_id = p_user_id
    AND state = 'waiting'
    AND last_active > NOW() - INTERVAL '10 seconds';
  
  IF NOT FOUND THEN
    -- User not available for matching
    RETURN NULL;
  END IF;

  -- Find best partner
  -- Query: waiting users, online, not same user, no match history, ordered by fairness
  SELECT 
    us.user_id,
    us.fairness,
    us.waiting_since
  INTO v_partner
  FROM users_state us
  INNER JOIN profiles p1 ON us.user_id = p1.id
  INNER JOIN profiles p2 ON v_user_state.user_id = p2.id
  WHERE us.state = 'waiting'
    AND us.user_id != p_user_id
    AND us.last_active > NOW() - INTERVAL '10 seconds'
    -- Gender compatibility (opposite genders)
    AND p1.gender != p2.gender
    AND p1.gender IS NOT NULL
    AND p2.gender IS NOT NULL
    -- No match history (bidirectional check)
    AND NOT EXISTS (
      SELECT 1 FROM match_history mh
      WHERE (mh.user1_id = p_user_id AND mh.user2_id = us.user_id)
         OR (mh.user1_id = us.user_id AND mh.user2_id = p_user_id)
    )
    -- Partner not already matched
    AND NOT EXISTS (
      SELECT 1 FROM users_state us2
      WHERE us2.user_id = us.user_id
        AND us2.state = 'matched'
    )
  ORDER BY us.fairness DESC, us.waiting_since ASC
  LIMIT 1;

  -- If no partner found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Try to acquire lock on partner
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(v_partner.user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Partner is being matched by another process, skip
    RETURN NULL;
  END IF;

  -- Double-check partner still available
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND state = 'waiting'
      AND last_active > NOW() - INTERVAL '10 seconds'
  ) THEN
    -- Partner no longer available
    RETURN NULL;
  END IF;

  -- Create match (atomic transaction)
  v_match_id := gen_random_uuid();
  
  -- Determine user order (consistent: smaller UUID first)
  IF p_user_id < v_partner.user_id THEN
    v_user1_id := p_user_id;
    v_user2_id := v_partner.user_id;
  ELSE
    v_user1_id := v_partner.user_id;
    v_user2_id := p_user_id;
  END IF;

  -- Insert match
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
    v_user1_id,
    v_user2_id,
    'paired',
    NOW(),
    NOW()
  );

  -- Update both users to matched state
  UPDATE users_state
  SET
    state = 'matched',
    match_id = v_match_id,
    partner_id = CASE 
      WHEN user_id = p_user_id THEN v_partner.user_id
      ELSE p_user_id
    END,
    updated_at = NOW()
  WHERE user_id IN (p_user_id, v_partner.user_id);

  -- Record in match_history (prevents rematching)
  INSERT INTO match_history (
    user1_id,
    user2_id,
    match_id,
    created_at
  )
  VALUES (
    v_user1_id,
    v_user2_id,
    v_match_id,
    NOW()
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION try_match_user IS 'Event-driven matching for specific user. Uses advisory locks and double-check locking. Returns match_id if matched, NULL otherwise.';







