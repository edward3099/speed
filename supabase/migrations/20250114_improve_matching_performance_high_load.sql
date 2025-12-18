-- ============================================================================
-- Improve Matching Performance for High Load Scenarios
-- ============================================================================
-- Recommendations from 100-user stress test analysis:
-- 1. Increase matching window from 30s to 90s for high-load scenarios
-- 2. Add better handling for users stuck in waiting state
-- 3. Improve state synchronization
-- ============================================================================

-- 1. Update try_match_user to use 90-second window for high-load scenarios
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
  v_waiting_window INTERVAL := INTERVAL '90 seconds'; -- Increased from 30s to 90s
  v_activity_window INTERVAL := INTERVAL '10 seconds'; -- Increased from 5s to 10s
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

  -- IMPROVED: Verify user is actively waiting with extended window for high load
  -- Must have joined queue recently (within 90 seconds) OR have recent activity (within 10 seconds)
  -- This allows more time for matching in high-load scenarios while still preventing stale matches
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
      -- Joined queue within last 90 seconds (actively spinning - extended for high load)
      waiting_since > NOW() - v_waiting_window
      OR
      -- OR has recent activity (within 10 seconds - actively waiting with heartbeats)
      last_active > NOW() - v_activity_window
    );
  
  IF NOT FOUND THEN
    -- User not actively available for matching
    RETURN NULL;
  END IF;

  -- Find best partner
  -- IMPROVED: Partner must also be actively waiting (same extended criteria)
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
    -- Partner must have joined queue recently OR have recent activity
    AND (
      -- Joined queue within last 90 seconds (actively spinning - extended for high load)
      us.waiting_since > NOW() - v_waiting_window
      OR
      -- OR has recent activity (within 10 seconds - actively waiting with heartbeats)
      us.last_active > NOW() - v_activity_window
    )
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

  -- IMPROVED: Final double-check partner still actively available (same extended criteria)
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND state = 'waiting'
      -- Partner must have joined queue recently OR have recent activity
      AND (
        -- Joined queue within last 90 seconds (actively spinning - extended for high load)
        waiting_since > NOW() - v_waiting_window
        OR
        -- OR has recent activity (within 10 seconds - actively waiting with heartbeats)
        last_active > NOW() - v_activity_window
      )
  ) THEN
    -- Partner no longer actively available
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

COMMENT ON FUNCTION try_match_user IS 'Event-driven matching for specific user. Uses advisory locks and double-check locking. IMPROVED: Extended window to 90s for high-load scenarios. Only matches users who actively spun (joined queue within 90s) OR have recent activity (within 10s). Returns match_id if matched, NULL otherwise.';

-- 2. Create function to retry matching for stuck users (users waiting > 30s)
CREATE OR REPLACE FUNCTION retry_matching_stuck_users()
RETURNS TABLE(
  retried_count INTEGER,
  matched_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_match_id UUID;
  v_retried_count INTEGER := 0;
  v_matched_count INTEGER := 0;
  v_waiting_threshold INTERVAL := INTERVAL '30 seconds'; -- Users waiting longer than this
BEGIN
  -- Find users stuck in waiting state (waiting > 30s but still have recent activity)
  -- This helps match users who got stuck due to race conditions or high load
  FOR v_user IN
    SELECT 
      us.user_id,
      us.waiting_since,
      us.last_active
    FROM users_state us
    WHERE us.state = 'waiting'
      -- User has been waiting for more than 30 seconds
      AND us.waiting_since < NOW() - v_waiting_threshold
      -- But still has recent activity (within last 30 seconds - still active)
      AND us.last_active > NOW() - INTERVAL '30 seconds'
      -- And hasn't been waiting too long (less than 5 minutes - prevent infinite retries)
      AND us.waiting_since > NOW() - INTERVAL '5 minutes'
    ORDER BY us.waiting_since ASC
    LIMIT 50 -- Process max 50 users per run
  LOOP
    v_retried_count := v_retried_count + 1;
    
    -- Try to match this user
    SELECT try_match_user(v_user.user_id) INTO v_match_id;
    
    IF v_match_id IS NOT NULL THEN
      v_matched_count := v_matched_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_retried_count, v_matched_count;
END;
$$;

COMMENT ON FUNCTION retry_matching_stuck_users IS 'Retries matching for users stuck in waiting state (>30s). Helps recover from race conditions and high-load scenarios. Processes max 50 users per run.';

-- 3. Create function to monitor stuck users and log metrics
CREATE OR REPLACE FUNCTION monitor_stuck_users()
RETURNS TABLE(
  stuck_waiting_count INTEGER,
  stuck_spinning_count INTEGER,
  avg_waiting_time_seconds NUMERIC,
  max_waiting_time_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stuck_waiting INTEGER;
  v_stuck_spinning INTEGER;
  v_avg_waiting NUMERIC;
  v_max_waiting NUMERIC;
BEGIN
  -- Count users stuck in waiting state (>60 seconds)
  SELECT COUNT(*)
  INTO v_stuck_waiting
  FROM users_state
  WHERE state = 'waiting'
    AND waiting_since < NOW() - INTERVAL '60 seconds';
  
  -- Count users stuck in spinning (on /spinning page but state is waiting for >60s)
  -- This indicates state synchronization issues
  SELECT COUNT(*)
  INTO v_stuck_spinning
  FROM users_state
  WHERE state = 'waiting'
    AND waiting_since < NOW() - INTERVAL '60 seconds'
    AND last_active > NOW() - INTERVAL '30 seconds'; -- Still active but stuck
  
  -- Calculate average waiting time for stuck users
  SELECT 
    COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - waiting_since))), 0),
    COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - waiting_since))), 0)
  INTO v_avg_waiting, v_max_waiting
  FROM users_state
  WHERE state = 'waiting'
    AND waiting_since < NOW() - INTERVAL '60 seconds';
  
  RETURN QUERY SELECT 
    v_stuck_waiting::INTEGER,
    v_stuck_spinning::INTEGER,
    ROUND(v_avg_waiting, 2),
    ROUND(v_max_waiting, 2);
END;
$$;

COMMENT ON FUNCTION monitor_stuck_users IS 'Monitors users stuck in waiting/spinning state. Returns counts and timing metrics for debugging and alerting.';

-- 4. Create index to improve performance of stuck user queries
CREATE INDEX IF NOT EXISTS idx_users_state_stuck_waiting 
ON users_state(state, waiting_since, last_active)
WHERE state = 'waiting';

COMMENT ON INDEX idx_users_state_stuck_waiting IS 'Index to improve performance of queries finding stuck users in waiting state.';















