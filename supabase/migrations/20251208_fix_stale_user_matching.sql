-- ============================================================================
-- Fix Stale User Matching
-- ============================================================================
-- CRITICAL FIX: Prevent stale (inactive) users from matching with active users
-- Based on edge case test analysis showing stale users matching
-- ============================================================================
-- 
-- Problem: Stale users (inactive >30s) are matching with active users
-- Root Cause: matching_pool materialized view may contain stale users between refreshes
-- 
-- Solution:
-- 1. Reduce stale threshold from 30s to 20s (more aggressive)
-- 2. Add double-check in process_matching to verify both users are active before matching
-- 3. Ensure matching_pool excludes stale users more aggressively
-- ============================================================================

-- Step 1: Update matching_pool view to use more aggressive stale threshold (20 seconds)
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
  -- Calculate activity priority: higher for more recent activity
  CASE 
    WHEN us.last_active > NOW() - INTERVAL '5 seconds' THEN 3  -- Very active (last 5s)
    WHEN us.last_active > NOW() - INTERVAL '10 seconds' THEN 2 -- Active (last 10s)
    WHEN us.last_active > NOW() - INTERVAL '20 seconds' THEN 1 -- Recently active (last 20s)
    ELSE 0  -- Stale (should be filtered out)
  END as activity_priority
FROM queue q
INNER JOIN users_state us ON q.user_id = us.user_id
WHERE us.state = 'waiting'
  -- CRITICAL: More aggressive stale user filtering (20 seconds instead of 30)
  AND us.last_active > NOW() - INTERVAL '20 seconds' -- Only active users (reduced from 30s)
ORDER BY 
  -- Prioritize more active users first
  CASE 
    WHEN us.last_active > NOW() - INTERVAL '5 seconds' THEN 3
    WHEN us.last_active > NOW() - INTERVAL '10 seconds' THEN 2
    WHEN us.last_active > NOW() - INTERVAL '20 seconds' THEN 1
    ELSE 0
  END DESC,
  q.fairness DESC, 
  q.waiting_since ASC;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_matching_pool_user_id ON matching_pool(user_id);
CREATE INDEX IF NOT EXISTS idx_matching_pool_priority ON matching_pool(activity_priority DESC, fairness DESC, waiting_since ASC);
CREATE INDEX IF NOT EXISTS idx_matching_pool_state ON matching_pool(state, last_active DESC);

-- Step 2: Update process_matching to add double-check for stale users
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
  
  -- Use matching_pool materialized view for faster queries
  -- This view is pre-filtered (active users only) and pre-sorted (activity_priority DESC, fairness DESC, waiting_since ASC)
  FOR v_user1 IN
    SELECT 
      user_id,
      fairness,
      waiting_since,
      state,
      activity_priority
    FROM matching_pool
    ORDER BY activity_priority DESC, fairness DESC, waiting_since ASC
    LIMIT 150 -- Increased from 50 to 150 for better throughput under load
  LOOP
    -- CRITICAL FIX: Double-check user1 is still active (defense against stale materialized view)
    SELECT last_active INTO v_user1_last_active
    FROM users_state
    WHERE user_id = v_user1.user_id;
    
    -- Skip if user1 is stale (inactive for >20 seconds)
    IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '20 seconds' THEN
      CONTINUE; -- Skip stale user
    END IF;
    
    -- Skip if user1 is already matched (safety check)
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

    -- Find a partner for user1 using matching_pool
    -- Requirements:
    -- 1. Active users only (already filtered by matching_pool)
    -- 2. Opposite gender only (male ↔ female)
    -- 3. Respect preferences (user1's preference must match user2's gender, and vice versa)
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
    INNER JOIN users_state us ON mp.user_id = us.user_id  -- Join to get fresh last_active
    LEFT JOIN user_preferences up ON mp.user_id = up.user_id
    WHERE mp.user_id != v_user1.user_id
      -- CRITICAL FIX: Double-check user2 is still active (defense against stale materialized view)
      AND us.last_active > NOW() - INTERVAL '20 seconds'  -- Must be active within last 20 seconds
      -- Check match history: never match same pair twice
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
      -- CRITICAL: Gender compatibility - male can only match with female (and vice versa)
      -- NO same-gender matching allowed
      AND p.gender IS NOT NULL
      AND p.gender IN ('male', 'female')
      AND p.gender != v_user1_gender  -- Must be opposite gender
      -- CRITICAL: Preference matching
      -- User1's preference must match user2's gender
      AND (
        v_user1_preference = 'all'  -- User1 accepts all
        OR v_user1_preference = p.gender  -- User1's preference matches user2's gender
      )
      -- User2's preference must match user1's gender
      AND (
        COALESCE(up.gender_preference, 'all') = 'all'  -- User2 accepts all
        OR COALESCE(up.gender_preference, 'all') = v_user1_gender  -- User2's preference matches user1's gender
      )
    ORDER BY mp.activity_priority DESC, mp.fairness DESC, mp.waiting_since ASC
    LIMIT 1;

    -- If we found a partner, create match
    IF v_potential_match IS NOT NULL THEN
      -- CRITICAL FIX: Final double-check - verify both users are still active before creating match
      SELECT last_active INTO v_user1_last_active FROM users_state WHERE user_id = v_user1.user_id;
      SELECT last_active INTO v_user2_last_active FROM users_state WHERE user_id = v_potential_match.user_id;
      
      -- Skip if either user is stale
      IF v_user1_last_active IS NULL OR v_user1_last_active <= NOW() - INTERVAL '20 seconds' THEN
        CONTINUE; -- User1 became stale, skip
      END IF;
      
      IF v_user2_last_active IS NULL OR v_user2_last_active <= NOW() - INTERVAL '20 seconds' THEN
        CONTINUE; -- User2 became stale, skip
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
        'paired', -- Initial status
        NOW(),
        NOW()
      );

      -- CRITICAL FIX: Initialize vote window immediately after match creation
      -- This prevents matches from getting stuck in 'paired' state
      -- Auto-create vote_window (don't wait for acknowledgment)
      -- Set vote_window_expires_at immediately so frontend can read it
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

      -- Log match creation to matching_log (if table exists)
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
            'user1_gender', v_user1_gender,
            'user1_preference', v_user1_preference,
            'user2_gender', v_potential_match.partner_gender,
            'user2_preference', v_potential_match.partner_preference,
            'user1_fairness', v_user1.fairness,
            'user1_activity_priority', v_user1.activity_priority,
            'user1_waiting_since', v_user1.waiting_since,
            'user1_last_active', v_user1_last_active,
            'user2_fairness', v_potential_match.fairness,
            'user2_activity_priority', v_potential_match.activity_priority,
            'user2_waiting_since', v_potential_match.waiting_since,
            'user2_last_active', v_user2_last_active,
            'used_matching_pool', true,
            'prioritized_active_users', true,
            'stale_user_check', true,
            'stale_threshold_seconds', 20,
            'gender_checked', true,
            'preferences_checked', true,
            'vote_window_initialized', true,
            'vote_window_expires_at', (NOW() + INTERVAL '10 seconds')::TEXT
          )
        );
      EXCEPTION WHEN undefined_table THEN
        NULL; -- Ignore if table doesn't exist
      END;

      -- Log flow step
      BEGIN
        INSERT INTO flow_log (match_id, user_id, step, metadata)
        VALUES (
          v_match_id,
          v_user1.user_id,
          'match_created',
          jsonb_build_object('partner_id', v_potential_match.user_id)
        );
        INSERT INTO flow_log (match_id, user_id, step, metadata)
        VALUES (
          v_match_id,
          v_potential_match.user_id,
          'match_created',
          jsonb_build_object('partner_id', v_user1.user_id)
        );
      EXCEPTION WHEN undefined_table THEN
        NULL; -- Ignore if table doesn't exist
      END;

      -- CRITICAL FIX: Process multiple matches per cycle instead of just 1
      -- Process up to 10 matches per cycle for better throughput
      -- This dramatically reduces match times from 30s to <5s
      -- Maintains fairness by processing in order (activity_priority DESC, fairness DESC, waiting_since ASC)
      IF v_matches_created >= 10 THEN
        EXIT; -- Limit to 10 matches per cycle to prevent overload
      END IF;
    END IF;
  END LOOP;

  -- Calculate processing time
  v_processing_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_processing_start)) * 1000;

  -- Log processing time if matching_log exists
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
      NULL,
      NULL,
      NULL,
      'matching_run_completed',
      (SELECT COUNT(*) FROM queue),
      jsonb_build_object(
        'matches_created', v_matches_created,
        'processing_time_ms', v_processing_time_ms,
        'used_matching_pool', true,
        'prioritized_active_users', true,
        'stale_user_check', true,
        'stale_threshold_seconds', 20,
        'gender_checked', true,
        'preferences_checked', true,
        'vote_window_auto_initialized', true
      )
    );
  EXCEPTION WHEN undefined_table THEN
    NULL; -- Ignore if table doesn't exist
  END;

  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Fixed: Prevents stale users from matching. Double-checks user activity before matching. Stale threshold: 20 seconds. Processes up to 10 matches per cycle. Batch size: 150 users.';

-- Refresh the materialized view with new definition
REFRESH MATERIALIZED VIEW matching_pool;
