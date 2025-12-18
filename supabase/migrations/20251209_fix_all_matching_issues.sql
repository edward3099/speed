-- ============================================================================
-- Fix All Matching Backend Issues
-- ============================================================================
-- CRITICAL FIXES:
-- 1. Add advisory locks to process_matching() to prevent race conditions
-- 2. Fix 870 stuck matches (missing vote windows)
-- 3. Cleanup 1,347 stale users
-- 4. Fix 6 mismatched partner references
-- 5. Fix 1 user matched multiple times
-- 6. Fix 1 invalid match status
-- 7. Correct ORDER BY to prioritize fairness (fix migration file mismatch)
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix Stuck Matches (870 matches without vote windows)
-- ============================================================================
UPDATE matches
SET
  vote_window_started_at = COALESCE(vote_window_started_at, created_at),
  vote_window_expires_at = COALESCE(vote_window_expires_at, created_at + INTERVAL '10 seconds'),
  updated_at = NOW()
WHERE status = 'paired'
  AND (vote_window_expires_at IS NULL OR vote_window_started_at IS NULL);

-- ============================================================================
-- STEP 2: Cleanup Stale Users (1,347 users waiting without heartbeat)
-- ============================================================================
-- Remove stale users from queue (inactive >30 seconds)
DELETE FROM queue
WHERE user_id IN (
  SELECT user_id
  FROM users_state
  WHERE state = 'waiting'
    AND (last_active IS NULL OR last_active <= NOW() - INTERVAL '30 seconds')
);

-- Reset their state to idle
UPDATE users_state
SET 
  state = 'idle', 
  match_id = NULL, 
  partner_id = NULL,
  updated_at = NOW()
WHERE state = 'waiting'
  AND (last_active IS NULL OR last_active <= NOW() - INTERVAL '30 seconds');

-- ============================================================================
-- STEP 3: Fix Mismatched Partner References (6 users)
-- ============================================================================
-- Fix users where partner reference is mismatched
UPDATE users_state us1
SET 
  partner_id = NULL, 
  match_id = NULL, 
  state = 'idle',
  updated_at = NOW()
WHERE us1.state = 'paired'
  AND EXISTS (
    SELECT 1 FROM users_state us2
    WHERE us1.partner_id = us2.user_id
      AND (us2.partner_id != us1.user_id OR us2.state != 'paired')
  );

-- ============================================================================
-- STEP 4: Fix Invalid Match Status (1 match)
-- ============================================================================
-- Valid statuses per constraint: 'paired', 'vote_active', 'completed', 'cancelled'
UPDATE matches
SET 
  status = 'cancelled',
  updated_at = NOW()
WHERE status NOT IN ('paired', 'vote_active', 'completed', 'cancelled');

-- ============================================================================
-- STEP 5: Fix User Matched Multiple Times (1 user with 2 matches)
-- ============================================================================
-- Find and cancel duplicate matches (keep the most recent one)
DO $$
DECLARE
  v_duplicate_user_id UUID;
  v_keep_match_id UUID;
  v_duplicate_match_ids UUID[];
BEGIN
  -- Find user with multiple matches
  SELECT user_id INTO v_duplicate_user_id
  FROM (
    SELECT user1_id as user_id FROM matches WHERE status = 'paired'
    UNION ALL
    SELECT user2_id as user_id FROM matches WHERE status = 'paired'
  ) all_matched_users
  GROUP BY user_id
  HAVING COUNT(*) > 1
  LIMIT 1;
  
  IF v_duplicate_user_id IS NOT NULL THEN
    -- Get all match IDs for this user
    SELECT ARRAY_AGG(match_id ORDER BY created_at DESC)
    INTO v_duplicate_match_ids
    FROM matches
    WHERE (user1_id = v_duplicate_user_id OR user2_id = v_duplicate_user_id)
      AND status = 'paired';
    
    -- Keep the most recent match (first in array)
    IF array_length(v_duplicate_match_ids, 1) > 1 THEN
      v_keep_match_id := v_duplicate_match_ids[1];
      
      -- Cancel all except the most recent
      UPDATE matches
      SET 
        status = 'cancelled',
        updated_at = NOW()
      WHERE match_id = ANY(v_duplicate_match_ids)
        AND match_id != v_keep_match_id;
    
    -- Reset state for users in cancelled matches
    UPDATE users_state
    SET 
      state = 'idle',
      match_id = NULL,
      partner_id = NULL,
      updated_at = NOW()
    WHERE match_id = ANY(v_duplicate_match_ids)
      AND match_id != v_keep_match_id;
  END IF;
END $$;

-- ============================================================================
-- STEP 6: CRITICAL FIX - Add Advisory Locks to process_matching()
-- ============================================================================
-- This prevents race conditions where multiple processes match same users
CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user1 RECORD;
  v_user2 RECORD;
  v_match_id UUID;
  v_matches_created INTEGER := 0;
  v_potential_match RECORD;
  v_processing_start TIMESTAMPTZ;
  v_processing_time_ms INTEGER;
  v_user1_gender TEXT;
  v_user2_gender TEXT;
  v_user1_preference TEXT;
  v_user2_preference TEXT;
  v_user1_last_active TIMESTAMPTZ;
  v_user2_last_active TIMESTAMPTZ;
  -- CRITICAL: Add lock variables
  v_lock1_acquired BOOLEAN;
  v_lock2_acquired BOOLEAN;
BEGIN
  v_processing_start := clock_timestamp();
  
  -- Use matching_pool materialized view (pre-filtered for users with recent heartbeats)
  -- CRITICAL FIX: Order by fairness DESC, waiting_since ASC (prioritize longest waiters first)
  FOR v_user1 IN
    SELECT 
      user_id,
      fairness,
      waiting_since,
      state,
      activity_priority
    FROM matching_pool
    ORDER BY fairness DESC, waiting_since ASC, activity_priority DESC
    LIMIT 150 -- Increased from 50 to 150 for better throughput under load
  LOOP
    -- ========================================================================
    -- CRITICAL FIX: Acquire advisory lock BEFORE any checks
    -- This prevents race conditions where multiple processes match same user
    -- ========================================================================
    SELECT pg_try_advisory_xact_lock(hashtext(v_user1.user_id::TEXT)) INTO v_lock1_acquired;
    IF NOT v_lock1_acquired THEN
      CONTINUE; -- Another process is already matching this user, skip
    END IF;
    
    -- CRITICAL: Double-check user1 has recent heartbeat (defense against stale materialized view)
    SELECT last_active INTO v_user1_last_active
    FROM users_state
    WHERE user_id = v_user1.user_id;
    
    -- Skip if user1 doesn't have recent heartbeat (inactive for >10 seconds)
    IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '10 seconds' THEN
      CONTINUE; -- Skip user without recent heartbeat
    END IF;
    
    -- CRITICAL: Re-check if user1 is already matched (with lock held - double-check locking)
    IF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_user1.user_id
      AND state IN ('paired', 'vote_window', 'video_date')
    ) THEN
      CONTINUE;
    END IF;

    -- Get user1's gender and preference
    SELECT p.gender, COALESCE(up.gender_preference, 'all') INTO v_user1_gender, v_user1_preference
    FROM profiles p
    LEFT JOIN user_preferences up ON p.id = up.user_id
    WHERE p.id = v_user1.user_id;

    -- Skip if user1 has no gender or invalid gender
    IF v_user1_gender IS NULL OR v_user1_gender NOT IN ('male', 'female') THEN
      CONTINUE;
    END IF;

    -- Find a partner for user1
    -- CRITICAL FIX: Order by fairness DESC, waiting_since ASC (prioritize longest waiters first)
    SELECT 
      mp.user_id,
      mp.fairness,
      mp.waiting_since,
      mp.activity_priority,
      p.gender as partner_gender,
      COALESCE(up.gender_preference, 'all') as partner_preference,
      us.last_active as partner_last_active
    INTO v_potential_match
    FROM matching_pool mp
    INNER JOIN profiles p ON mp.user_id = p.id
    INNER JOIN users_state us ON mp.user_id = us.user_id  -- Join to get fresh heartbeat timestamp
    LEFT JOIN user_preferences up ON mp.user_id = up.user_id
    WHERE mp.user_id != v_user1.user_id
      -- CRITICAL: Double-check user2 has recent heartbeat (must be actively polling)
      AND us.last_active > NOW() - INTERVAL '10 seconds'  -- Must have sent heartbeat within last 10s
      -- Check match history
      AND NOT EXISTS (
        SELECT 1 FROM match_history mh
        WHERE (mh.user1_id = v_user1.user_id AND mh.user2_id = mp.user_id)
           OR (mh.user1_id = mp.user_id AND mh.user2_id = v_user1.user_id)
      )
      -- User2 not already matched
      AND NOT EXISTS (
        SELECT 1 FROM users_state
        WHERE user_id = mp.user_id
        AND state IN ('paired', 'vote_window', 'video_date')
      )
      -- Gender compatibility
      AND p.gender IS NOT NULL
      AND p.gender IN ('male', 'female')
      AND p.gender != v_user1_gender
      -- Preference matching
      AND (
        v_user1_preference = 'all' OR v_user1_preference = p.gender
      )
      AND (
        COALESCE(up.gender_preference, 'all') = 'all' OR COALESCE(up.gender_preference, 'all') = v_user1_gender
      )
    -- CRITICAL FIX: Order by fairness DESC, waiting_since ASC (prioritize longest waiters first)
    ORDER BY mp.fairness DESC, mp.waiting_since ASC, mp.activity_priority DESC
    LIMIT 1;

    -- If we found a partner, create match
    IF v_potential_match IS NOT NULL THEN
      -- ====================================================================
      -- CRITICAL FIX: Lock potential match BEFORE creating match
      -- This prevents race condition where multiple processes match same user
      -- ====================================================================
      SELECT pg_try_advisory_xact_lock(hashtext(v_potential_match.user_id::TEXT)) INTO v_lock2_acquired;
      IF NOT v_lock2_acquired THEN
        CONTINUE; -- Another process is already matching this user, skip
      END IF;
      
      -- CRITICAL: Final double-check - verify both users have recent heartbeats (with both locks held)
      SELECT last_active INTO v_user1_last_active FROM users_state WHERE user_id = v_user1.user_id;
      SELECT last_active INTO v_user2_last_active FROM users_state WHERE user_id = v_potential_match.user_id;
      
      -- Skip if either user doesn't have recent heartbeat
      IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '10 seconds' THEN
        CONTINUE; -- User1 lost heartbeat, skip
      END IF;
      
      IF v_user2_last_active IS NULL OR v_user2_last_active <= NOW() - INTERVAL '10 seconds' THEN
        CONTINUE; -- User2 lost heartbeat, skip
      END IF;
      
      -- CRITICAL: Final double-check that both users are still available (with both locks held)
      IF EXISTS (
        SELECT 1 FROM users_state
        WHERE user_id = v_potential_match.user_id
        AND state IN ('paired', 'vote_window', 'video_date')
      ) THEN
        CONTINUE; -- User2 was matched by another process, skip
      END IF;
      
      -- Now safe to create match (both users locked, double-checked)
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
        v_user1.user_id,
        v_potential_match.user_id,
        'paired',
        NOW(),
        NOW()
      );

      -- Initialize vote window immediately
      UPDATE matches
      SET
        vote_window_started_at = NOW(),
        vote_window_expires_at = NOW() + INTERVAL '10 seconds',
        updated_at = NOW()
      WHERE match_id = v_match_id;

      -- Update both users to 'paired' state
      UPDATE users_state
      SET
        state = 'paired',
        match_id = v_match_id,
        partner_id = CASE
          WHEN user_id = v_user1.user_id THEN v_potential_match.user_id
          ELSE v_user1.user_id
        END,
        updated_at = NOW()
      WHERE user_id IN (v_user1.user_id, v_potential_match.user_id);

      -- Remove both from queue
      DELETE FROM queue
      WHERE user_id IN (v_user1.user_id, v_potential_match.user_id);

      v_matches_created := v_matches_created + 1;

      -- Log match creation
      BEGIN
        INSERT INTO matching_log (
          user1_id,
          user2_id,
          match_id,
          action,
          queue_size,
          metadata
        )
        VALUES (
          v_user1.user_id,
          v_potential_match.user_id,
          v_match_id,
          'match_created',
          (SELECT COUNT(*) FROM queue),
          jsonb_build_object(
            'heartbeat_based', true,
            'heartbeat_threshold_seconds', 10,
            'user1_last_heartbeat', v_user1_last_active,
            'user2_last_heartbeat', v_user2_last_active,
            'vote_window_initialized', true,
            'user1_fairness', v_user1.fairness,
            'user1_waiting_since', v_user1.waiting_since,
            'user2_fairness', v_potential_match.fairness,
            'user2_waiting_since', v_potential_match.waiting_since,
            'fairness_prioritized', true,
            'locks_used', true,
            'race_condition_prevented', true
          )
        );
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;

      -- Process up to 10 matches per cycle
      IF v_matches_created >= 10 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'CRITICAL FIX: Added advisory locks to prevent race conditions. Prioritizes fairness and waiting time over activity priority. Users who wait longer get matched first. Activity priority is only a tiebreaker. Both users are locked before match creation to prevent concurrent matching.';

-- ============================================================================
-- STEP 7: Refresh matching_pool to reflect cleanup
-- ============================================================================
REFRESH MATERIALIZED VIEW matching_pool;






























