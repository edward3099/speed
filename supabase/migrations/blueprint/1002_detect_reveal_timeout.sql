-- ============================================================================
-- Blueprint Migration 1002: Detect Reveal Timeout
-- ============================================================================
-- Part 9.5.2: Real-Time Reveal Timeout Detection
-- ============================================================================

-- Detect reveal timeouts in real-time (called on reveal check)
CREATE OR REPLACE FUNCTION detect_reveal_timeout(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_record RECORD;
  v_reveal_timeout_seconds INTEGER := 15;
BEGIN
  -- Find active match in reveal phase
  SELECT m.*, m.metadata->>'revealed_users' AS revealed_users_json
  INTO v_match_record
  FROM matches m
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM matching_queue
      WHERE user_id IN (m.user1_id, m.user2_id)
        AND status = 'paired'
    );
  
  IF v_match_record.id IS NULL THEN
    RETURN FALSE; -- No active reveal
  END IF;
  
  -- Check if reveal timeout exceeded (15 seconds since match created)
  IF NOW() - v_match_record.created_at > (v_reveal_timeout_seconds || ' seconds')::INTERVAL THEN
    -- Check if both users have revealed
    IF (v_match_record.revealed_users_json IS NULL OR 
        jsonb_array_length(v_match_record.revealed_users_json::jsonb) < 2) THEN
      -- Timeout - handle idle reveal
      PERFORM handle_reveal_timeout(v_match_record.id, p_user_id);
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION detect_reveal_timeout IS 'Detects reveal timeouts in real-time (15 second timeout)';

