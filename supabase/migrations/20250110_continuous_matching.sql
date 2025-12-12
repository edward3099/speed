-- ============================================================================
-- Continuous Matching Function
-- ============================================================================
-- Phase 4.1: Processes queue every 2 seconds with SKIP LOCKED
-- ============================================================================

-- Function to continuously process matching
-- This should be called by a background job every 2 seconds
CREATE OR REPLACE FUNCTION continuous_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue_user RECORD;
  v_matches_created INTEGER := 0;
  v_queue_size INTEGER;
  v_start_time TIMESTAMPTZ;
  v_processing_time_ms INTEGER;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Get queue size for logging
  SELECT COUNT(*) INTO v_queue_size FROM queue;
  
  -- Process queue using SKIP LOCKED to prevent conflicts
  -- Sort by fairness DESC, waiting_since ASC (long waiters first)
  FOR v_queue_user IN
    SELECT user_id, fairness, waiting_since, preference_stage
    FROM queue
    WHERE user_id IN (
      SELECT user_id FROM users_state
      WHERE state = 'waiting'
      AND last_active > NOW() - INTERVAL '10 seconds' -- Only online users
    )
    ORDER BY fairness DESC, waiting_since ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 20 -- Process up to 20 users per run
  LOOP
    -- Try to find a partner for this user
    -- This will be handled by the matching engine in the application layer
    -- For now, we just return the queue size
    -- The actual matching logic is in backend/domain/matching_engine.ts
    NULL;
  END LOOP;
  
  -- Calculate processing time
  v_processing_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  
  -- Log heartbeat
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
    v_queue_size,
    0, -- Will be updated by actual matching logic
    v_matches_created,
    v_processing_time_ms,
    jsonb_build_object('function', 'continuous_matching')
  );
  
  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION continuous_matching IS 'Processes queue every 2 seconds with SKIP LOCKED - should be called by background job continuously';

