-- ============================================================================
-- Fix Simultaneous Spin Race Condition
-- ============================================================================
-- Issue: When both users click "Start Spin" simultaneously, only one gets matched
--        because one user tries to match before the other joins the queue
-- Fix: Make partner query more lenient - also check for users who just joined
--      queue (very recent waiting_since) even if they're still processing
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

  -- Verify user is actively waiting
  -- Must have joined queue recently (within 60 seconds) OR have recent activity (within 15 seconds)
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
    -- User must have joined queue recently OR have recent activity
    AND (
      -- Joined queue within last 60 seconds (actively spinning)
      waiting_since > NOW() - INTERVAL '60 seconds'
      OR
      -- OR has recent activity (within 15 seconds - accounts for 7s heartbeat + delays)
      last_active > NOW() - INTERVAL '15 seconds'
    );
  
  IF NOT FOUND THEN
    -- User not actively available for matching
    RETURN NULL;
  END IF;

  -- Find best partner
  -- CRITICAL FIX: Partner query is more lenient to handle simultaneous spins
  -- Check for partners who are 'waiting' OR 'idle' but very recently active (just joined)
  -- This handles race conditions where partner is still processing join_queue
  SELECT 
    us.user_id,
    us.fairness,
    us.waiting_since
  INTO v_partner
  FROM users_state us
  INNER JOIN profiles p1 ON us.user_id = p1.id
  INNER JOIN profiles p2 ON v_user_state.user_id = p2.id
  LEFT JOIN user_preferences up1 ON us.user_id = up1.user_id -- Partner's preferences
  LEFT JOIN user_preferences up2 ON v_user_state.user_id = up2.user_id -- Current user's preferences
  WHERE us.user_id != p_user_id
    -- CRITICAL FIX: More lenient partner check - include users who just joined queue
    -- Check for 'waiting' state OR 'idle' state with very recent activity (within 2 seconds)
    -- This handles simultaneous spins where partner is still processing join_queue
    AND (
      -- Partner is waiting (normal case)
      (us.state = 'waiting' AND (
        us.waiting_since > NOW() - INTERVAL '60 seconds'
        OR us.last_active > NOW() - INTERVAL '15 seconds'
      ))
      OR
      -- Partner is idle but very recently active (just clicked spin, join_queue still processing)
      (us.state = 'idle' AND us.last_active > NOW() - INTERVAL '2 seconds')
    )
    -- Gender compatibility (opposite genders)
    AND p1.gender != p2.gender
    AND p1.gender IS NOT NULL
    AND p2.gender IS NOT NULL
    -- City preference matching: users match if they have at least one city in common
    -- OR if either user has no city preference (NULL or empty array)
    AND (
      -- Both have no city preference (match anyone)
      (up1.city IS NULL OR array_length(up1.city, 1) IS NULL)
      AND (up2.city IS NULL OR array_length(up2.city, 1) IS NULL)
      OR
      -- Current user has no city preference (match anyone)
      (up2.city IS NULL OR array_length(up2.city, 1) IS NULL)
      OR
      -- Partner has no city preference (match anyone)
      (up1.city IS NULL OR array_length(up1.city, 1) IS NULL)
      OR
      -- Both have city preferences - check for overlap (at least one city in common)
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(up1.city, ARRAY[]::TEXT[])) AS city1
        WHERE city1 = ANY(COALESCE(up2.city, ARRAY[]::TEXT[]))
      )
    )
    -- Age range matching: user's age must be within partner's min_age/max_age
    -- AND partner's age must be within user's min_age/max_age
    AND (
      -- Current user's age is within partner's age range
      (up1.min_age IS NULL OR p2.age >= up1.min_age)
      AND (up1.max_age IS NULL OR p2.age <= up1.max_age)
    )
    AND (
      -- Partner's age is within current user's age range
      (up2.min_age IS NULL OR p1.age >= up2.min_age)
      AND (up2.max_age IS NULL OR p1.age <= up2.max_age)
    )
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
  ORDER BY 
    -- Prioritize 'waiting' state over 'idle' state
    CASE WHEN us.state = 'waiting' THEN 0 ELSE 1 END,
    us.fairness DESC, 
    us.waiting_since ASC
  LIMIT 1;

  -- If no partner found, return NULL (no lock was needed)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- CRITICAL SECTION: Acquire locks just before match creation
  -- Try to acquire lock on partner (prevent partner from being matched by another process)
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(v_partner.user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Partner is being matched by another process, skip
    RETURN NULL;
  END IF;

  -- Double-check both users still available (state may have changed during query)
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = p_user_id
      AND state = 'waiting'
      AND (
        waiting_since > NOW() - INTERVAL '60 seconds'
        OR last_active > NOW() - INTERVAL '15 seconds'
      )
  ) THEN
    -- Current user no longer available
    RETURN NULL;
  END IF;

  -- CRITICAL FIX: Double-check partner - if partner was 'idle', ensure they're now 'waiting'
  -- This handles the race condition where partner was idle when we queried but is now waiting
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND (
        -- Partner is waiting (normal case)
        (state = 'waiting' AND (
          waiting_since > NOW() - INTERVAL '60 seconds'
          OR last_active > NOW() - INTERVAL '15 seconds'
        ))
        OR
        -- Partner is idle but very recently active (just joined queue, state update pending)
        (state = 'idle' AND last_active > NOW() - INTERVAL '2 seconds')
      )
      AND state != 'matched' -- Partner not already matched
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

  -- Insert match with status='paired' initially
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

  -- CRITICAL FIX: Initialize vote window immediately after match creation (60 seconds)
  -- Set status to 'active' (required by constraint when vote_window_expires_at is set)
  -- This prevents matches from getting stuck in 'paired' state
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '60 seconds', -- FIXED: 60 seconds, not 10
    updated_at = NOW()
  WHERE match_id = v_match_id;

  -- Update both users to matched state
  -- CRITICAL FIX: Update partner even if they were 'idle' (they're now matched)
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
  IF NOT EXISTS (
    SELECT 1 FROM match_history
    WHERE (user1_id = v_user1_id AND user2_id = v_user2_id)
       OR (user1_id = v_user2_id AND user2_id = v_user1_id)
  ) THEN
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
    );
  END IF;

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION try_match_user IS 
'Event-driven matching for specific user. FIXED: Handles simultaneous spins by checking for idle users with recent activity. Uses advisory locks and double-check locking. Returns match_id if matched, NULL otherwise. Sets vote window to 60 seconds.';



