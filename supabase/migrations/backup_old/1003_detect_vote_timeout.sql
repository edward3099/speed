-- ============================================================================
-- Blueprint Migration 1003: Detect Vote Timeout
-- ============================================================================
-- Part 9.5.3: Real-Time Vote Timeout Detection
-- ============================================================================

-- Detect vote timeouts in real-time (called on vote check)
CREATE OR REPLACE FUNCTION detect_vote_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_record RECORD;
  v_vote_timeout_seconds INTEGER := 30;
BEGIN
  -- Find active match in voting phase
  SELECT m.*
  INTO v_match_record
  FROM matches m
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM matching_queue
      WHERE user_id IN (m.user1_id, m.user2_id)
        AND status = 'vote_active'
    );
  
  IF v_match_record.id IS NULL THEN
    RETURN FALSE; -- No active vote
  END IF;
  
  -- Check if vote timeout exceeded (30 seconds since voting started)
  -- Voting starts when match transitions to vote_active
  IF v_match_record.metadata->>'voting_started_at' IS NOT NULL THEN
    IF NOW() - (v_match_record.metadata->>'voting_started_at')::TIMESTAMPTZ > 
       (v_vote_timeout_seconds || ' seconds')::INTERVAL THEN
      -- Check if both users have voted
      IF (v_match_record.user1_vote IS NULL OR v_match_record.user2_vote IS NULL) THEN
        -- Timeout - handle idle voter
        PERFORM handle_idle_voter(
          v_match_record.id,
          CASE WHEN v_match_record.user1_vote IS NULL THEN v_match_record.user1_id
               ELSE v_match_record.user2_id END
        );
        RETURN TRUE;
      END IF;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION detect_vote_timeout IS 'Detects vote timeouts in real-time (30 second timeout)';

