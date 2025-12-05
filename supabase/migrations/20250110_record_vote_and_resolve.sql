-- ============================================================================
-- record_vote_and_resolve Function
-- ============================================================================
-- Phase 2.3: Atomically record vote, resolve outcome, create video-date, update states
-- ============================================================================

-- Function to atomically record vote and resolve outcome
CREATE OR REPLACE FUNCTION record_vote_and_resolve(
  p_user_id UUID,
  p_match_id UUID,
  p_vote TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_user1_vote TEXT;
  v_user2_vote TEXT;
  v_both_voted BOOLEAN;
  v_outcome TEXT;
  v_resolved BOOLEAN := FALSE;
  v_lock_acquired BOOLEAN;
  v_yes_user_id UUID;
  v_pass_user_id UUID;
BEGIN
  -- Validate vote value
  IF p_vote NOT IN ('yes', 'pass') THEN
    RAISE EXCEPTION 'Invalid vote value: %. Must be yes or pass', p_vote;
  END IF;
  
  -- Try to acquire advisory lock on match (non-blocking)
  SELECT pg_try_advisory_xact_lock(hashtext(p_match_id::TEXT)) INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    -- Another process is already processing this match, return waiting
    RETURN jsonb_build_object('waiting_for_partner', true, 'resolved', false);
  END IF;
  
  -- Get match info
  SELECT user1_id, user2_id, status, outcome, vote_window_expires_at
  INTO v_match
  FROM matches
  WHERE match_id = p_match_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found: %', p_match_id;
  END IF;
  
  -- Validate vote window not expired
  IF v_match.vote_window_expires_at IS NOT NULL AND v_match.vote_window_expires_at < NOW() THEN
    -- Vote window expired, resolve as idle_idle
    v_outcome := 'idle_idle';
    v_resolved := TRUE;
  ELSIF v_match.outcome IS NOT NULL THEN
    -- Outcome already resolved, return existing outcome
    RETURN jsonb_build_object(
      'outcome', v_match.outcome,
      'resolved', true,
      'already_resolved', true
    );
  ELSE
    -- Record vote (idempotent - can update if user votes again)
    INSERT INTO votes (match_id, voter_id, vote, voted_at)
    VALUES (p_match_id, p_user_id, p_vote, NOW())
    ON CONFLICT (match_id, voter_id) DO UPDATE
    SET vote = EXCLUDED.vote, voted_at = NOW();
    
    -- Log vote
    INSERT INTO voting_log (match_id, user_id, action, vote_value, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'vote_recorded',
      p_vote,
      jsonb_build_object('vote_window_expires_at', v_match.vote_window_expires_at)
    );
    
    -- Log flow step
    INSERT INTO flow_log (match_id, user_id, step, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'vote_recorded',
      jsonb_build_object('vote', p_vote)
    );
    
    -- Get both votes
    SELECT 
      MAX(CASE WHEN voter_id = v_match.user1_id THEN vote END),
      MAX(CASE WHEN voter_id = v_match.user2_id THEN vote END)
    INTO v_user1_vote, v_user2_vote
    FROM votes
    WHERE match_id = p_match_id;
    
    -- Check if both voted
    v_both_voted := (v_user1_vote IS NOT NULL AND v_user2_vote IS NOT NULL);
    
    -- If pass vote recorded, resolve immediately (pass always wins)
    IF p_vote = 'pass' THEN
      v_both_voted := TRUE;
    END IF;
    
    -- If both voted, resolve outcome immediately
    IF v_both_voted THEN
      -- Determine outcome
      IF v_user1_vote = 'yes' AND v_user2_vote = 'yes' THEN
        v_outcome := 'both_yes';
      ELSIF v_user1_vote = 'yes' OR v_user2_vote = 'yes' THEN
        v_outcome := 'yes_pass';
      ELSE
        v_outcome := 'pass_pass';
      END IF;
      
      v_resolved := TRUE;
    END IF;
  END IF;
  
  -- If resolved, update match and handle outcome
  IF v_resolved THEN
    -- Update match outcome
    UPDATE matches
    SET
      outcome = v_outcome,
      status = 'ended',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE match_id = p_match_id;
    
    -- Log outcome resolution
    INSERT INTO voting_log (match_id, user_id, action, outcome, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'outcome_resolved',
      v_outcome,
      jsonb_build_object(
        'user1_vote', v_user1_vote,
        'user2_vote', v_user2_vote
      )
    );
    
    -- Log flow step
    INSERT INTO flow_log (match_id, user_id, step, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'outcome_resolved',
      jsonb_build_object('outcome', v_outcome)
    );
    
    -- Handle outcome-specific actions
    IF v_outcome = 'both_yes' THEN
      -- Create video-date atomically
      -- Check if video_dates table exists, if not, we'll handle it gracefully
      BEGIN
        INSERT INTO video_dates (match_id, user1_id, user2_id, status)
        VALUES (p_match_id::TEXT, v_match.user1_id, v_match.user2_id, 'countdown')
        ON CONFLICT DO NOTHING;
        
        -- Log video-date creation
        INSERT INTO voting_log (match_id, user_id, action, outcome, metadata)
        VALUES (
          p_match_id,
          p_user_id,
          'video_date_created',
          v_outcome,
          jsonb_build_object('status', 'countdown')
        );
        
        INSERT INTO flow_log (match_id, user_id, step, metadata)
        VALUES (
          p_match_id,
          p_user1_id,
          'video_date_created',
          jsonb_build_object('status', 'countdown')
        );
      EXCEPTION
        WHEN undefined_table THEN
          -- video_dates table doesn't exist, skip
          NULL;
      END;
      
      -- Update both users to idle (they'll be redirected to video-date page)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      
    ELSIF v_outcome = 'yes_pass' THEN
      -- Yes user gets +10 fairness boost and auto-spins
      -- Pass user goes to idle
      IF v_user1_vote = 'yes' THEN
        v_yes_user_id := v_match.user1_id;
        v_pass_user_id := v_match.user2_id;
      ELSE
        v_yes_user_id := v_match.user2_id;
        v_pass_user_id := v_match.user1_id;
      END IF;
      
      -- Boost yes user's fairness
      UPDATE users_state
      SET
        fairness = LEAST(fairness + 10, 20),
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_yes_user_id;
      
      -- Pass user goes to idle
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_pass_user_id;
      
    ELSE
      -- pass_pass or idle_idle - both go to idle
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
    END IF;
    
    -- Add to never_pair_again history (idempotent)
    -- Ensure consistent ordering (smaller UUID first)
    BEGIN
      IF v_match.user1_id < v_match.user2_id THEN
        INSERT INTO never_pair_again (user1, user2, reason)
        VALUES (v_match.user1_id, v_match.user2_id, v_outcome)
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO never_pair_again (user1, user2, reason)
        VALUES (v_match.user2_id, v_match.user1_id, v_outcome)
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        -- never_pair_again table doesn't exist, skip
        NULL;
    END;
    
    -- Add to match_history if table exists
    BEGIN
      INSERT INTO match_history (user1_id, user2_id, match_id)
      VALUES (v_match.user1_id, v_match.user2_id, p_match_id)
      ON CONFLICT DO NOTHING;
    EXCEPTION
      WHEN undefined_table THEN
        -- match_history table doesn't exist, skip
        NULL;
    END;
    
    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'resolved', true,
      'user1_vote', v_user1_vote,
      'user2_vote', v_user2_vote
    );
  ELSE
    -- Waiting for partner
    RETURN jsonb_build_object('waiting_for_partner', true, 'resolved', false);
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO voting_log (match_id, user_id, action, error_message, metadata)
    VALUES (
      p_match_id,
      p_user_id,
      'vote_failed',
      SQLERRM,
      jsonb_build_object('error_code', SQLSTATE, 'vote', p_vote)
    );
    RAISE;
END;
$$;

COMMENT ON FUNCTION record_vote_and_resolve IS 'Atomically records vote, resolves outcome, creates video-date, updates states, and adds to history - all in single transaction';

