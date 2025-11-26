-- ============================================================================
-- Migration 106: Vote Engine
-- ============================================================================
-- Part 5.9: Voting engine with correct outcomes
-- ============================================================================

-- Record vote and resolve outcomes
CREATE OR REPLACE FUNCTION record_vote(
  p_user_id UUID,
  p_match_id BIGINT,
  p_vote_type TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  match_record RECORD;
  partner_id UUID;
  partner_vote TEXT;
  result JSONB;
BEGIN
  -- Get match
  SELECT * INTO match_record
  FROM matches
  WHERE id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'vote_active'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not in vote_active state';
  END IF;
  
  -- Get partner ID
  partner_id := CASE 
    WHEN match_record.user1_id = p_user_id THEN match_record.user2_id
    ELSE match_record.user1_id
  END;
  
  -- Insert/update vote
  INSERT INTO votes (match_id, voter_id, vote_type, created_at)
  VALUES (p_match_id, p_user_id, p_vote_type, NOW())
  ON CONFLICT (match_id, voter_id) DO UPDATE
  SET vote_type = p_vote_type,
      created_at = NOW();
  
  -- Get partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND voter_id = partner_id;
  
  -- Handle outcomes
  IF p_vote_type = 'yes' AND partner_vote = 'yes' THEN
    -- Case 1: Both yes → video_date + never_pair_again
    UPDATE matches SET status = 'ended' WHERE id = p_match_id;
    
    UPDATE user_status
    SET state = 'idle',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id IN (p_user_id, partner_id);
    
    -- Add to never_pair_again
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_yes'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_yes', 'next_state', 'video_date');
    
  ELSIF (p_vote_type = 'yes' AND partner_vote = 'pass') OR (p_vote_type = 'pass' AND partner_vote = 'yes') THEN
    -- Case 2: Yes + Pass → yes voter +10 boost + auto respin, pass voter → idle
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    IF p_vote_type = 'yes' THEN
      -- Current user voted yes, partner passed
      PERFORM apply_yes_boost(p_user_id);
      UPDATE user_status
      SET state = 'spin_active',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
      
      UPDATE user_status
      SET state = 'idle',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = partner_id;
    ELSE
      -- Current user passed, partner voted yes
      PERFORM apply_yes_boost(partner_id);
      UPDATE user_status
      SET state = 'spin_active',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = partner_id;
      
      UPDATE user_status
      SET state = 'idle',
          last_state = 'vote_active',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
    
    -- Add to never_pair_again (mutual pass)
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_pass'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'yes_pass', 'next_state', 'respin');
    
  ELSIF p_vote_type = 'pass' AND partner_vote = 'pass' THEN
    -- Case 5: Both pass → both idle + never_pair_again
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    UPDATE user_status
    SET state = 'idle',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id IN (p_user_id, partner_id);
    
    -- Add to never_pair_again
    INSERT INTO never_pair_again (user1, user2, reason)
    VALUES (
      LEAST(p_user_id, partner_id),
      GREATEST(p_user_id, partner_id),
      'mutual_pass'
    )
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_pass', 'next_state', 'idle');
    
  ELSE
    -- Waiting for partner's vote
    result := jsonb_build_object('outcome', 'waiting', 'status', 'vote_active');
  END IF;
  
  RETURN result;
END;
$$;

-- Handle idle voter (countdown expired, no vote)
CREATE OR REPLACE FUNCTION handle_idle_voter(p_user_id UUID, p_match_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  partner_id UUID;
  partner_vote TEXT;
BEGIN
  -- Get partner ID
  SELECT 
    CASE WHEN user1_id = p_user_id THEN user2_id ELSE user1_id END
  INTO partner_id
  FROM matches
  WHERE id = p_match_id;
  
  -- Get partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND voter_id = partner_id;
  
  -- Case 4: Yes + Idle → idle user removed, yes voter +10 + auto respin
  IF partner_vote = 'yes' THEN
    -- Partner voted yes, current user is idle
    PERFORM apply_yes_boost(partner_id);
    
    UPDATE user_status
    SET state = 'spin_active',
        last_state = 'vote_active',
        last_state_change = NOW(),
        updated_at = NOW()
    WHERE user_id = partner_id;
  END IF;
  
  -- Idle user goes to idle (must spin manually)
  UPDATE user_status
  SET state = 'idle',
      last_state = 'vote_active',
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Clean up match
  DELETE FROM matches WHERE id = p_match_id;
  DELETE FROM votes WHERE match_id = p_match_id;
END;
$$;

COMMENT ON FUNCTION record_vote IS 'Records vote and resolves outcomes: both_yes, yes_pass, both_pass, waiting';
COMMENT ON FUNCTION handle_idle_voter IS 'Handles idle voter: removes idle user, gives yes voter boost if applicable';
