-- ============================================================================
-- Blueprint Migration 701: Complete Reveal
-- ============================================================================
-- Part 5.6: THE ONLY FUNCTION THAT HANDLES REVEAL COMPLETION
-- ============================================================================

-- THE ONLY FUNCTION THAT HANDLES REVEAL COMPLETION
CREATE OR REPLACE FUNCTION complete_reveal(
  p_user_id UUID,
  p_match_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  both_revealed BOOLEAN;
  current_revealed_users JSONB;
  updated_revealed_users JSONB;
BEGIN
  -- 1. Get active match
  SELECT * INTO active_match
  FROM matches
  WHERE id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'pending'
  FOR UPDATE NOWAIT;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;
  
  -- 2. Get partner ID
  partner_id := CASE 
    WHEN active_match.user1_id = p_user_id THEN active_match.user2_id 
    ELSE active_match.user1_id 
  END;
  
  -- 3. Get current revealed users array (atomic read)
  current_revealed_users := COALESCE(active_match.metadata->'revealed_users', '[]'::JSONB);
  
  -- 4. Check if user already revealed (prevent duplicates)
  IF p_user_id::TEXT = ANY(
    SELECT jsonb_array_elements_text(current_revealed_users)
  ) THEN
    -- User already revealed, return current state
    both_revealed := jsonb_array_length(current_revealed_users) >= 2;
    IF both_revealed THEN
      RETURN jsonb_build_object('status', 'both_revealed', 'next_state', 'vote_active');
    ELSE
      RETURN jsonb_build_object('status', 'waiting_for_partner', 'current_state', 'paired');
    END IF;
  END IF;
  
  -- 5. Atomically append user to revealed_users array
  updated_revealed_users := current_revealed_users || jsonb_build_array(p_user_id::TEXT);
  
  -- 6. Update match metadata atomically using jsonb_set
  UPDATE matches
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::JSONB),
    '{revealed_users}',
    updated_revealed_users
  )
  WHERE id = p_match_id;
  
  -- 7. Check if both users have revealed
  both_revealed := jsonb_array_length(updated_revealed_users) >= 2;
  
  -- 8. If both revealed, transition to vote_active
  IF both_revealed THEN
    PERFORM state_machine_transition(p_user_id, 'reveal_complete', 
      jsonb_build_object('match_id', p_match_id));
    PERFORM state_machine_transition(partner_id, 'reveal_complete', 
      jsonb_build_object('match_id', p_match_id));
    
    RETURN jsonb_build_object('status', 'both_revealed', 'next_state', 'vote_active');
  ELSE
    RETURN jsonb_build_object('status', 'waiting_for_partner', 'current_state', 'paired');
  END IF;
END;
$$;

COMMENT ON FUNCTION complete_reveal IS 'THE ONLY FUNCTION THAT HANDLES REVEAL COMPLETION - Atomic reveal → vote transition using jsonb_set';

