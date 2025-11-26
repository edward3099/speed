-- ============================================================================
-- Blueprint Migration 207: Is Matchable
-- ============================================================================
-- Part 2.4: Matchable State Check
-- ============================================================================

CREATE OR REPLACE FUNCTION is_matchable(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  user_state user_matching_state;
  user_online BOOLEAN;
BEGIN
  -- Check if user is online
  SELECT is_online INTO user_online
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check if user is in matchable state
  -- EXCLUDE: paired, vote_active, video_date (users already in matches)
  SELECT status INTO user_state
  FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- Only matchable if in queue states (not already matched)
  IF user_state IN ('queue_waiting', 'spin_active') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION is_matchable IS 'Checks if user is in a matchable state (excludes paired, vote_active, video_date)';

