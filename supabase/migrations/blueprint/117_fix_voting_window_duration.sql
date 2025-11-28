-- ============================================================================
-- Migration 117: Fix Voting Window Duration and Status Check
-- ============================================================================
-- Issue: get_voting_window_remaining was checking for 'pending' status
-- but matches are created with 'vote_active' status. Also, duration was 10s
-- but create_pair_atomic creates 30s windows.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_voting_window_remaining(
  p_match_id BIGINT
)
RETURNS INTEGER AS $$
DECLARE
  v_vote_started_at TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
  v_remaining_seconds INTEGER;
  v_voting_window_duration INTEGER := 30; -- 30 seconds voting window (matches create_pair_atomic)
BEGIN
  -- Get vote_started_at and status from matches
  SELECT vote_started_at, status
  INTO v_vote_started_at, v_status
  FROM matches
  WHERE id = p_match_id;
  
  -- If record not found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- If status is not 'vote_active' or 'pending', return 0 (voting window closed)
  IF v_status NOT IN ('vote_active', 'pending') THEN
    RETURN 0;
  END IF;
  
  -- If vote_started_at is NULL, use matched_at as fallback
  IF v_vote_started_at IS NULL THEN
    SELECT matched_at INTO v_vote_started_at
    FROM matches
    WHERE id = p_match_id;
    
    -- If matched_at is also NULL, return NULL
    IF v_vote_started_at IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  
  -- Calculate remaining seconds (30 seconds voting window)
  -- Use database NOW() for perfect synchronization
  v_remaining_seconds := GREATEST(0, v_voting_window_duration - EXTRACT(EPOCH FROM (NOW() - v_vote_started_at))::INTEGER);
  
  RETURN v_remaining_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_voting_window_remaining IS 'Returns remaining seconds in voting window (30s). Accepts vote_active and pending status. Uses database NOW() for synchronization.';




