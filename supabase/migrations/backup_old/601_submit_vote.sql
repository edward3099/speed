-- ============================================================================
-- Blueprint Migration 601: Submit Vote
-- ============================================================================
-- Part 5.5.1: THE ONLY FUNCTION THAT HANDLES VOTES
-- ============================================================================

-- THE ONLY FUNCTION THAT HANDLES VOTES
CREATE OR REPLACE FUNCTION submit_vote(
  p_user_id UUID,
  p_match_id UUID,
  p_vote_type TEXT -- 'yes' or 'pass'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5s'
AS $$
DECLARE
  active_match RECORD;
  partner_id UUID;
  partner_vote TEXT;
  result JSONB;
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
  
  -- 3. Insert/update vote
  INSERT INTO votes (match_id, user_id, vote_type, created_at)
  VALUES (p_match_id, p_user_id, p_vote_type, NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE
  SET vote_type = p_vote_type,
      updated_at = NOW();
  
  -- 4. Check partner's vote
  SELECT vote_type INTO partner_vote
  FROM votes
  WHERE match_id = p_match_id AND user_id = partner_id;
  
  -- 5. Handle vote outcomes
  IF p_vote_type = 'yes' AND partner_vote = 'yes' THEN
    -- Both voted yes → video_date
    UPDATE matches SET status = 'matched', updated_at = NOW() WHERE id = p_match_id;
    PERFORM state_machine_transition(p_user_id, 'both_voted_yes', jsonb_build_object('match_id', p_match_id));
    PERFORM state_machine_transition(partner_id, 'both_voted_yes', jsonb_build_object('match_id', p_match_id));
    
    -- Record in match_history
    INSERT INTO match_history (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    -- Record in yes_yes_pairs (mutual yes-yes = banned forever)
    INSERT INTO yes_yes_pairs (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'both_yes', 'next_state', 'video_date');
    
  ELSIF p_vote_type = 'pass' OR partner_vote = 'pass' THEN
    -- One voted pass → instant respin
    -- Clean up metadata (revealed_users) before deleting match
    UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
    DELETE FROM matches WHERE id = p_match_id;
    DELETE FROM votes WHERE match_id = p_match_id;
    
    -- User who voted yes gets fairness boost +10
    IF p_vote_type = 'yes' THEN
      PERFORM apply_fairness_boost(p_user_id, 10, 'voted_yes_but_partner_passed');
      PERFORM state_machine_transition(p_user_id, 'one_voted_pass', jsonb_build_object('voter', 'self'));
    ELSIF partner_vote = 'yes' THEN
      PERFORM apply_fairness_boost(partner_id, 10, 'voted_yes_but_partner_passed');
      PERFORM state_machine_transition(partner_id, 'one_voted_pass', jsonb_build_object('voter', 'partner'));
    END IF;
    
    -- Both go to spin_active (respin)
    PERFORM state_machine_transition(p_user_id, 'one_voted_pass', jsonb_build_object('action', 'respin'));
    PERFORM state_machine_transition(partner_id, 'one_voted_pass', jsonb_build_object('action', 'respin'));
    
    -- Record in match_history (but NOT yes_yes_pairs)
    INSERT INTO match_history (user1_id, user2_id, match_id)
    VALUES (p_user_id, partner_id, p_match_id)
    ON CONFLICT DO NOTHING;
    
    result := jsonb_build_object('outcome', 'one_pass', 'next_state', 'spin_active');
    
  ELSE
    -- Waiting for partner's vote
    result := jsonb_build_object('outcome', 'waiting', 'status', 'vote_active');
  END IF;
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION submit_vote IS 'THE ONLY FUNCTION THAT HANDLES VOTES - Handles both-yes, one-pass, and waiting states with instant respin';

