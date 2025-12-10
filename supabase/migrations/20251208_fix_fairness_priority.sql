-- ============================================================================
-- Fix Fairness Priority in Matching
-- ============================================================================
-- CRITICAL FIX: Prioritize waiting time (fairness) over activity priority
-- Based on analysis showing User B matched with User C instead of User A
-- ============================================================================
-- 
-- Problem: activity_priority (heartbeat recency) was overriding waiting_since (fairness)
-- Result: Users who joined later but sent more recent heartbeats got matched first
-- 
-- Solution: Reorder matching priority to prioritize fairness and waiting time
-- 1. Fairness DESC (highest fairness first)
-- 2. waiting_since ASC (longest wait first - earliest timestamp = longest wait)
-- 3. activity_priority DESC (most recent heartbeat as tiebreaker only)
-- ============================================================================

-- Step 1: Update matching_pool materialized view to prioritize fairness over activity
DROP MATERIALIZED VIEW IF EXISTS matching_pool;

CREATE MATERIALIZED VIEW matching_pool AS
SELECT 
  q.user_id,
  q.fairness,
  q.waiting_since,
  us.state,
  us.last_active,
  us.partner_id,
  us.match_id,
  -- Calculate activity priority based on heartbeat recency (for tiebreaking only)
  CASE 
    WHEN us.last_active > NOW() - INTERVAL '3 seconds' THEN 3  -- Very active (heartbeat <3s ago)
    WHEN us.last_active > NOW() - INTERVAL '6 seconds' THEN 2  -- Active (heartbeat <6s ago)
    WHEN us.last_active > NOW() - INTERVAL '10 seconds' THEN 1 -- Recently active (heartbeat <10s ago)
    ELSE 0  -- Stale (no recent heartbeat)
  END as activity_priority
FROM queue q
INNER JOIN users_state us ON q.user_id = us.user_id
WHERE us.state = 'waiting'
  -- CRITICAL: Only users with recent heartbeat (active within last 10 seconds)
  -- This ensures users are actively polling, not just joined the queue
  AND us.last_active > NOW() - INTERVAL '10 seconds' -- Must have sent heartbeat within last 10s
ORDER BY 
  -- CRITICAL FIX: Prioritize fairness and waiting time FIRST, then activity as tiebreaker
  -- 1. Fairness DESC (highest fairness first - users who have been waiting longer get priority)
  q.fairness DESC,
  -- 2. waiting_since ASC (earliest waiting_since = longest wait = highest priority)
  q.waiting_since ASC,
  -- 3. activity_priority DESC (most recent heartbeat as tiebreaker only - not primary sort)
  CASE 
    WHEN us.last_active > NOW() - INTERVAL '3 seconds' THEN 3
    WHEN us.last_active > NOW() - INTERVAL '6 seconds' THEN 2
    WHEN us.last_active > NOW() - INTERVAL '10 seconds' THEN 1
    ELSE 0
  END DESC;

-- Recreate indexes with corrected priority order
CREATE INDEX IF NOT EXISTS idx_matching_pool_user_id ON matching_pool(user_id);
CREATE INDEX IF NOT EXISTS idx_matching_pool_priority ON matching_pool(fairness DESC, waiting_since ASC, activity_priority DESC);
CREATE INDEX IF NOT EXISTS idx_matching_pool_state ON matching_pool(state, last_active DESC);

-- Step 2: Update process_matching to use corrected priority order
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
    -- CRITICAL: Double-check user1 has recent heartbeat (defense against stale materialized view)
    SELECT last_active INTO v_user1_last_active
    FROM users_state
    WHERE user_id = v_user1.user_id;
    
    -- Skip if user1 doesn't have recent heartbeat (inactive for >10 seconds)
    -- This ensures user is actively polling, not just joined the queue
    IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '10 seconds' THEN
      CONTINUE; -- Skip user without recent heartbeat
    END IF;
    
    -- Skip if user1 is already matched
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
      -- CRITICAL: Final double-check - verify both users have recent heartbeats
      SELECT last_active INTO v_user1_last_active FROM users_state WHERE user_id = v_user1.user_id;
      SELECT last_active INTO v_user2_last_active FROM users_state WHERE user_id = v_potential_match.user_id;
      
      -- Skip if either user doesn't have recent heartbeat
      IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '10 seconds' THEN
        CONTINUE; -- User1 lost heartbeat, skip
      END IF;
      
      IF v_user2_last_active IS NULL OR v_user2_last_active <= NOW() - INTERVAL '10 seconds' THEN
        CONTINUE; -- User2 lost heartbeat, skip
      END IF;
      
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

      -- Initialize vote window
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
            'fairness_prioritized', true
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

COMMENT ON FUNCTION process_matching IS 'Fixed: Prioritizes fairness and waiting time over activity priority. Users who wait longer get matched first. Activity priority is only a tiebreaker.';

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW matching_pool;
