-- ============================================================================
-- Enhanced Matching Function with Status History
-- ============================================================================
-- Based on Trade Matching Engine: Better chunked processing and history tracking
-- ============================================================================

-- Enhanced process_matching with status history logging
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
BEGIN
  v_processing_start := clock_timestamp();
  
  -- Process queue: find pairs
  -- Order by fairness DESC, waiting_since ASC (long waiters first)
  -- Chunked processing: Process up to 50 users per run (prevents overload)
  FOR v_user1 IN
    SELECT 
      q.user_id,
      q.fairness,
      q.waiting_since,
      us.state
    FROM queue q
    INNER JOIN users_state us ON q.user_id = us.user_id
    WHERE us.state = 'waiting'
      AND us.last_active > NOW() - INTERVAL '30 seconds' -- Only online users
    ORDER BY q.fairness DESC, q.waiting_since ASC
    LIMIT 50 -- Chunked processing: max 50 users per run
  LOOP
    -- Skip if user1 is already matched (safety check)
    IF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_user1.user_id
      AND state IN ('paired', 'vote_window', 'video_date')
    ) THEN
      CONTINUE;
    END IF;

    -- Find a partner for user1
    -- Exclude: same user, already matched, offline, matched before
    SELECT 
      q.user_id,
      q.fairness,
      q.waiting_since
    INTO v_potential_match
    FROM queue q
    INNER JOIN users_state us ON q.user_id = us.user_id
    WHERE us.user_id != v_user1.user_id
      AND us.state = 'waiting'
      AND us.last_active > NOW() - INTERVAL '30 seconds'
      -- Check match history: never match same pair twice
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = v_user1.user_id AND m.user2_id = us.user_id)
           OR (m.user1_id = us.user_id AND m.user2_id = v_user1.user_id)
      )
      -- User2 not already matched
      AND NOT EXISTS (
        SELECT 1 FROM users_state
        WHERE user_id = us.user_id
        AND state IN ('paired', 'vote_window', 'video_date')
      )
    ORDER BY q.fairness DESC, q.waiting_since ASC
    LIMIT 1;

    -- If we found a partner, create match
    IF v_potential_match IS NOT NULL THEN
      v_match_id := gen_random_uuid();

      -- Create match (status history will be logged by trigger)
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

      -- Log match creation (if logging table exists)
      BEGIN
        INSERT INTO matching_log (
          user1_id,
          user2_id,
          match_id,
          action,
          created_at
        )
        VALUES (
          v_user1.user_id,
          v_potential_match.user_id,
          v_match_id,
          'match_created',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Logging table might not exist, ignore
        NULL;
      END;

      -- Break after creating one match (process one at a time for simplicity)
      -- This ensures fairness: long waiters get matched first
      EXIT;
    END IF;
  END LOOP;

  -- Calculate processing time
  v_processing_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_processing_start)) * 1000;

  -- Log heartbeat (if table exists)
  BEGIN
    INSERT INTO matching_heartbeat (
      processed_at,
      queue_size,
      matches_attempted,
      matches_created,
      processing_time_ms,
      metadata
    )
    VALUES (
      NOW(),
      (SELECT COUNT(*) FROM queue),
      0, -- Will be updated if we track attempts
      v_matches_created,
      v_processing_time_ms,
      jsonb_build_object(
        'chunk_size', 50,
        'users_processed', v_matches_created
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Heartbeat table might not exist, ignore
    NULL;
  END;

  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Enhanced matching function with chunked processing (50 users per run), status history tracking, and performance monitoring';

