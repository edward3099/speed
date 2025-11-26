-- ============================================================================
-- Blueprint Migration 1102: Check Reveal Timeouts
-- ============================================================================
-- Part 7.4: Reveal Timeout Scheduler
-- ============================================================================

CREATE OR REPLACE FUNCTION check_reveal_timeouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  timed_out_matches UUID[];
  match_record RECORD;
  reveal_timeout_seconds INTEGER := 15; -- 15 second reveal timeout
BEGIN
  -- Find matches where:
  -- 1. Status is pending (in reveal phase)
  -- 2. Created more than reveal_timeout_seconds ago
  -- 3. Users are in 'paired' state (not yet voted)
  SELECT ARRAY_AGG(DISTINCT m.id) INTO timed_out_matches
  FROM matches m
  INNER JOIN matching_queue mq1 ON mq1.user_id = m.user1_id
  INNER JOIN matching_queue mq2 ON mq2.user_id = m.user2_id
  WHERE m.status = 'pending'
    AND m.created_at < NOW() - (reveal_timeout_seconds || ' seconds')::INTERVAL
    AND (mq1.status = 'paired' OR mq2.status = 'paired')
    AND (
      -- At least one user hasn't revealed
      m.metadata->'revealed_users' IS NULL
      OR
      jsonb_array_length(COALESCE(m.metadata->'revealed_users', '[]'::JSONB)) < 2
    );
  
  -- Process each timed-out match
  IF timed_out_matches IS NOT NULL THEN
    FOREACH match_record.id IN ARRAY timed_out_matches
    LOOP
      SELECT m.* INTO match_record
      FROM matches m
      WHERE m.id = match_record.id;
      
      -- Find which user hasn't revealed
      IF m.metadata->'revealed_users' IS NULL OR 
         NOT (match_record.user1_id::TEXT = ANY(
           SELECT jsonb_array_elements_text(COALESCE(m.metadata->'revealed_users', '[]'::JSONB))
         )) THEN
        PERFORM handle_reveal_timeout(match_record.id, match_record.user1_id);
      ELSIF NOT (match_record.user2_id::TEXT = ANY(
        SELECT jsonb_array_elements_text(COALESCE(m.metadata->'revealed_users', '[]'::JSONB))
      )) THEN
        PERFORM handle_reveal_timeout(match_record.id, match_record.user2_id);
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'checked', NOW(),
    'timed_out_matches', COALESCE(array_length(timed_out_matches, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION check_reveal_timeouts IS 'Checks for reveal timeouts - should be called by scheduler every 10 seconds';

