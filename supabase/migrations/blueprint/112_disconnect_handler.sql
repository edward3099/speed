-- ============================================================================
-- Migration 112: Disconnect Handler
-- ============================================================================
-- Part 4.7: Disconnection behavior
-- ============================================================================

-- Handle user disconnect
CREATE OR REPLACE FUNCTION handle_disconnect(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  partner_vote TEXT;
BEGIN
  -- Get active match if exists
  SELECT * INTO active_match
  FROM matches
  WHERE (user1_id = p_user_id OR user2_id = p_user_id)
    AND status IN ('pending', 'vote_active')
  LIMIT 1;
  
  IF FOUND THEN
    -- Get partner ID
    partner_id := CASE 
      WHEN active_match.user1_id = p_user_id THEN active_match.user2_id
      ELSE active_match.user1_id
    END;
    
    -- Check if partner voted yes
    SELECT vote_type INTO partner_vote
    FROM votes
    WHERE match_id = active_match.id AND voter_id = partner_id;
    
    -- If partner voted yes, give boost and auto respin
    IF partner_vote = 'yes' THEN
      PERFORM apply_yes_boost(partner_id);
      PERFORM execute_state_transition(partner_id, 'spin_active');
      PERFORM join_queue(partner_id);
    END IF;
    
    -- Break match
    DELETE FROM matches WHERE id = active_match.id;
    DELETE FROM votes WHERE match_id = active_match.id;
  END IF;
  
  -- Remove from queue
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Apply cooldown
  PERFORM set_cooldown(p_user_id);
  
  -- Log disconnect
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'user_disconnected', jsonb_build_object('had_match', FOUND), 'warning');
END;
$$;

COMMENT ON FUNCTION handle_disconnect IS 'Handles user disconnect: breaks match, applies cooldown, gives partner boost if yes voter';
