-- ============================================================================
-- Blueprint Migration 1101: Check Vote Timeouts
-- ============================================================================
-- Part 7.3: THE ONLY FUNCTION THAT CHECKS FOR IDLE VOTERS
-- ============================================================================

-- THE ONLY FUNCTION THAT CHECKS FOR IDLE VOTERS
CREATE OR REPLACE FUNCTION check_vote_timeouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  timed_out_matches UUID[];
  match_record RECORD;
  vote_timeout_seconds INTEGER := 30; -- 30 second vote timeout
BEGIN
  -- Find matches where:
  -- 1. Status is pending (in voting phase)
  -- 2. Created more than vote_timeout_seconds ago
  -- 3. At least one user hasn't voted
  SELECT ARRAY_AGG(DISTINCT m.id) INTO timed_out_matches
  FROM matches m
  WHERE m.status = 'pending'
    AND m.created_at < NOW() - (vote_timeout_seconds || ' seconds')::INTERVAL
    AND EXISTS (
      -- Match has users in vote_active state
      SELECT 1 FROM matching_queue mq
      WHERE mq.status = 'vote_active'
        AND (mq.user_id = m.user1_id OR mq.user_id = m.user2_id)
    )
    AND (
      -- At least one user hasn't voted
      NOT EXISTS (
        SELECT 1 FROM votes v
        WHERE v.match_id = m.id AND v.user_id = m.user1_id
      )
      OR
      NOT EXISTS (
        SELECT 1 FROM votes v
        WHERE v.match_id = m.id AND v.user_id = m.user2_id
      )
    );
  
  -- Process each timed-out match
  IF timed_out_matches IS NOT NULL THEN
    FOREACH match_record.id IN ARRAY timed_out_matches
    LOOP
      -- Find which user(s) are idle
      SELECT m.* INTO match_record
      FROM matches m
      WHERE m.id = match_record.id;
      
      -- Check which user hasn't voted
      IF NOT EXISTS (
        SELECT 1 FROM votes WHERE match_id = match_record.id AND user_id = match_record.user1_id
      ) THEN
        PERFORM handle_idle_voter(match_record.id, match_record.user1_id);
      ELSIF NOT EXISTS (
        SELECT 1 FROM votes WHERE match_id = match_record.id AND user_id = match_record.user2_id
      ) THEN
        PERFORM handle_idle_voter(match_record.id, match_record.user2_id);
      END IF;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'checked', NOW(),
    'timed_out_matches', COALESCE(array_length(timed_out_matches, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION check_vote_timeouts IS 'THE ONLY FUNCTION THAT CHECKS FOR IDLE VOTERS - Should be called by scheduler every 10 seconds';

