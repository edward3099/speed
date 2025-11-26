-- ============================================================================
-- Blueprint Migration 104: Determine Reconnect State
-- ============================================================================
-- Part 1.3.1: Determine appropriate state when user reconnects
-- ============================================================================

-- Determine appropriate state when user reconnects
CREATE OR REPLACE FUNCTION determine_reconnect_state(
  p_event_data JSONB
) RETURNS user_matching_state AS $$
DECLARE
  user_id UUID;
  active_match_id UUID;
  match_status TEXT;
  partner_id UUID;
  user_vote TEXT;
  partner_vote TEXT;
  both_revealed BOOLEAN;
BEGIN
  user_id := (p_event_data->>'user_id')::UUID;
  
  -- Check if user has an active match
  SELECT id, status INTO active_match_id, match_status
  FROM matches
  WHERE (user1_id = user_id OR user2_id = user_id)
    AND status = 'pending'
  LIMIT 1;
  
  IF active_match_id IS NOT NULL THEN
    -- Get partner ID
    SELECT 
      CASE WHEN user1_id = user_id THEN user2_id ELSE user1_id END
    INTO partner_id
    FROM matches
    WHERE id = active_match_id;
    
    -- Check votes
    SELECT vote_type INTO user_vote
    FROM votes
    WHERE match_id = active_match_id AND user_id = user_id;
    
    SELECT vote_type INTO partner_vote
    FROM votes
    WHERE match_id = active_match_id AND user_id = partner_id;
    
    -- If partner voted pass, user must respin (match is broken)
    IF partner_vote = 'pass' THEN
      -- Match should have been broken, but if it still exists, break it now
      -- Clean up metadata (revealed_users)
      UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = active_match_id;
      DELETE FROM matches WHERE id = active_match_id;
      DELETE FROM votes WHERE match_id = active_match_id;
      RETURN 'spin_active'; -- Force respin
    END IF;
    
    -- If user already voted, return to vote_active
    IF user_vote IS NOT NULL THEN
      RETURN 'vote_active';
    END IF;
    
    -- If partner voted yes but user hasn't voted, check if reveal is complete
    IF partner_vote = 'yes' AND user_vote IS NULL THEN
      -- Check if both users have revealed
      SELECT 
        jsonb_array_length(COALESCE(metadata->'revealed_users', '[]'::JSONB)) >= 2
      INTO both_revealed
      FROM matches
      WHERE id = active_match_id;
      
      IF both_revealed THEN
        RETURN 'vote_active'; -- Ready to vote
      ELSE
        RETURN 'paired'; -- Still in reveal phase
      END IF;
    END IF;
    
    -- Match exists but no votes yet - return to paired (waiting for reveal)
    RETURN 'paired';
  END IF;
  
  -- No active match - return to queue_waiting (resume matching)
  RETURN 'queue_waiting';
END;
$$;

COMMENT ON FUNCTION determine_reconnect_state IS 'Determines appropriate state when user reconnects after disconnection';

