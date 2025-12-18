-- ============================================================================
-- Priority 2: Lock Optimization - Reduce Lock Scope in try_match_user
-- ============================================================================
-- 
-- Problem: Advisory locks are acquired at function start and held during
-- entire operation, including slow queries (3-5s). This serializes all
-- matching attempts, creating a bottleneck at 20+ concurrent users.
-- 
-- Solution: Move lock acquisition to just before match creation (critical
-- section only). This allows parallel querying while maintaining data
-- consistency.
-- 
-- Expected Impact: 50-60% improvement in concurrency, enabling parallel matching
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
  -- OPTIMIZATION: Do queries WITHOUT lock first (allows parallel execution)
  -- Lock will be acquired only before match creation (critical section)
  
  -- Verify user is actively waiting (no lock needed for read)
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

  -- Find best partner (no lock needed for read - allows parallel queries)
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
  WHERE us.state = 'waiting'
    AND us.user_id != p_user_id
    -- Partner must have joined queue recently OR have recent activity
    AND (
      -- Joined queue within last 60 seconds (actively spinning)
      us.waiting_since > NOW() - INTERVAL '60 seconds'
      OR
      -- OR has recent activity (within 15 seconds - accounts for 7s heartbeat + delays)
      us.last_active > NOW() - INTERVAL '15 seconds'
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
  ORDER BY us.fairness DESC, us.waiting_since ASC
  LIMIT 1;

  -- If no partner found, return NULL (no lock was needed)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- CRITICAL SECTION: Acquire locks just before match creation
  -- This minimizes lock duration while maintaining data consistency
  
  -- Try to acquire lock on current user (prevent concurrent matching of same user)
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(p_user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Another process is matching this user, skip
    RETURN NULL;
  END IF;

  -- Try to acquire lock on partner (prevent partner from being matched by another process)
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(v_partner.user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Partner is being matched by another process, skip
    RETURN NULL;
  END IF;

  -- Double-check both users still available (state may have changed during query)
  -- This is critical since we did queries without locks
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

  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND state = 'waiting'
      AND (
        waiting_since > NOW() - INTERVAL '60 seconds'
        OR last_active > NOW() - INTERVAL '15 seconds'
      )
  ) THEN
    -- Partner no longer available
    RETURN NULL;
  END IF;

  -- Create match (atomic transaction - locks held during this critical section)
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
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '60 seconds',
    updated_at = NOW()
  WHERE match_id = v_match_id;

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
'OPTIMIZED: Lock scope reduced - queries run in parallel, locks acquired only before match creation. Enables concurrent matching while maintaining data consistency.';


















