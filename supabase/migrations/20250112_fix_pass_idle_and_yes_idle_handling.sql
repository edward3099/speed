-- ============================================================================
-- Fix Pass+Idle and Yes+Idle Handling (Scenario 3 Cases D & E)
-- ============================================================================
-- Critical fix: Properly distinguish between pass+pass vs pass+idle and yes+idle
-- Per spin/logic specification:
--   Case D (pass+idle): pass user auto-spins, idle user must press spin manually
--   Case E (yes+idle): yes user auto-spins with +10 boost, idle user must press spin manually
-- ============================================================================

-- Update record_vote_and_resolve to properly handle pass+idle and yes+idle
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
  v_idle_user_id UUID;
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
    -- Vote window expired - check what votes exist to determine outcome
    -- Get both votes
    SELECT 
      MAX(CASE WHEN voter_id = v_match.user1_id THEN vote END),
      MAX(CASE WHEN voter_id = v_match.user2_id THEN vote END)
    INTO v_user1_vote, v_user2_vote
    FROM votes
    WHERE match_id = p_match_id;
    
    -- Determine outcome based on votes (or lack thereof)
    IF v_user1_vote = 'pass' AND v_user2_vote IS NULL THEN
      -- Case D: Pass + Idle (one voted pass, other idle)
      v_outcome := 'pass_idle';
      v_resolved := TRUE;
    ELSIF v_user2_vote = 'pass' AND v_user1_vote IS NULL THEN
      -- Case D: Pass + Idle (one voted pass, other idle)
      v_outcome := 'pass_idle';
      v_resolved := TRUE;
    ELSIF v_user1_vote = 'yes' AND v_user2_vote IS NULL THEN
      -- Case E: Yes + Idle (one voted yes, other idle)
      v_outcome := 'yes_idle';
      v_resolved := TRUE;
    ELSIF v_user2_vote = 'yes' AND v_user1_vote IS NULL THEN
      -- Case E: Yes + Idle (one voted yes, other idle)
      v_outcome := 'yes_idle';
      v_resolved := TRUE;
    ELSE
      -- Case G: Idle + Idle (neither voted)
      v_outcome := 'idle_idle';
      v_resolved := TRUE;
    END IF;
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
    -- BUT: Only if both voted. If only one voted pass, wait for vote window expiry
    -- to distinguish between pass+pass (both voted) vs pass+idle (one voted, other idle)
    IF p_vote = 'pass' AND v_both_voted THEN
      -- Both voted, resolve immediately
      v_resolved := TRUE;
    ELSIF v_both_voted THEN
      -- Both voted (not pass), resolve immediately
      v_resolved := TRUE;
    END IF;
    
    -- If both voted, resolve outcome immediately
    IF v_resolved THEN
      -- Determine outcome
      IF v_user1_vote = 'yes' AND v_user2_vote = 'yes' THEN
        v_outcome := 'both_yes';
      ELSIF (v_user1_vote = 'yes' AND v_user2_vote = 'pass') OR (v_user1_vote = 'pass' AND v_user2_vote = 'yes') THEN
        v_outcome := 'yes_pass';
      ELSIF v_user1_vote = 'pass' AND v_user2_vote = 'pass' THEN
        v_outcome := 'pass_pass';
      ELSE
        -- Fallback (shouldn't happen)
        v_outcome := 'pass_pass';
      END IF;
    END IF;
  END IF;
  
  -- If resolved, update match and handle outcome
  IF v_resolved THEN
    -- Update match outcome
    UPDATE matches
    SET
      outcome = v_outcome,
      status = 'completed',
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
    
    -- Handle outcome-specific actions per Scenario 3
    IF v_outcome = 'both_yes' THEN
      -- Create video-date atomically
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
          v_match.user1_id,
          'video_date_created',
          jsonb_build_object('status', 'countdown')
        );
      EXCEPTION
        WHEN undefined_table THEN
          -- video_dates table doesn't exist, skip
          NULL;
      END;
      
      -- Update both users to idle (they'll be redirected to video-date page)
      -- NO auto-spin for both_yes (Scenario 3 case a)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      
    ELSIF v_outcome = 'yes_pass' THEN
      -- Yes user gets +10 fairness boost and auto-spins (Scenario 3 case b)
      -- Pass user auto-spins (Scenario 3 case b)
      IF v_user1_vote = 'yes' THEN
        v_yes_user_id := v_match.user1_id;
        v_pass_user_id := v_match.user2_id;
      ELSE
        v_yes_user_id := v_match.user2_id;
        v_pass_user_id := v_match.user1_id;
      END IF;
      
      -- Boost yes user's fairness and auto-spin
      UPDATE users_state
      SET
        fairness = LEAST(fairness + 10, 20),
        updated_at = NOW()
      WHERE user_id = v_yes_user_id;
      
      -- Auto-spin both users
      PERFORM auto_spin_user(v_yes_user_id);
      PERFORM auto_spin_user(v_pass_user_id);
      
    ELSIF v_outcome = 'pass_pass' THEN
      -- Both users auto-spin (Scenario 3 case c)
      PERFORM auto_spin_user(v_match.user1_id);
      PERFORM auto_spin_user(v_match.user2_id);
      
    ELSIF v_outcome = 'pass_idle' THEN
      -- Case D: Pass + Idle (Scenario 3 case d)
      -- Pass user auto-spins, idle user must press spin manually
      IF v_user1_vote = 'pass' THEN
        v_pass_user_id := v_match.user1_id;
        v_idle_user_id := v_match.user2_id;
      ELSE
        v_pass_user_id := v_match.user2_id;
        v_idle_user_id := v_match.user1_id;
      END IF;
      
      -- Pass user auto-spins
      PERFORM auto_spin_user(v_pass_user_id);
      
      -- Idle user goes to idle (must press spin manually)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_idle_user_id;
      
    ELSIF v_outcome = 'yes_idle' THEN
      -- Case E: Yes + Idle (Scenario 3 case e)
      -- Yes user auto-spins with +10 boost, idle user must press spin manually
      IF v_user1_vote = 'yes' THEN
        v_yes_user_id := v_match.user1_id;
        v_idle_user_id := v_match.user2_id;
      ELSE
        v_yes_user_id := v_match.user2_id;
        v_idle_user_id := v_match.user1_id;
      END IF;
      
      -- Boost yes user's fairness and auto-spin
      UPDATE users_state
      SET
        fairness = LEAST(fairness + 10, 20),
        updated_at = NOW()
      WHERE user_id = v_yes_user_id;
      
      -- Yes user auto-spins
      PERFORM auto_spin_user(v_yes_user_id);
      
      -- Idle user goes to idle (must press spin manually)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_idle_user_id;
      
    ELSE
      -- idle_idle - both go to idle, NO auto-spin (Scenario 3 case g)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
    END IF;
    
    -- Add to never_pair_again history (idempotent) - Scenario 7
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
      'match_ended', true,
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

-- Update auto_resolve_expired_vote_windows to handle pass+idle and yes+idle
CREATE OR REPLACE FUNCTION auto_resolve_expired_vote_windows()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resolved INTEGER := 0;
  v_match RECORD;
  v_user1_vote TEXT;
  v_user2_vote TEXT;
  v_outcome TEXT;
  v_yes_user_id UUID;
  v_pass_user_id UUID;
  v_idle_user_id UUID;
BEGIN
  -- Resolve matches with expired vote windows
  -- Check what votes exist to determine correct outcome
  FOR v_match IN
    SELECT m.match_id, m.user1_id, m.user2_id
    FROM matches m
    WHERE m.vote_window_expires_at < NOW()
      AND m.outcome IS NULL
      AND m.status = 'vote_active'
  LOOP
    -- Get both votes
    SELECT 
      MAX(CASE WHEN voter_id = v_match.user1_id THEN vote END),
      MAX(CASE WHEN voter_id = v_match.user2_id THEN vote END)
    INTO v_user1_vote, v_user2_vote
    FROM votes
    WHERE match_id = v_match.match_id;
    
    -- Determine outcome based on votes (or lack thereof)
    IF v_user1_vote = 'pass' AND v_user2_vote IS NULL THEN
      -- Case D: Pass + Idle
      v_outcome := 'pass_idle';
    ELSIF v_user2_vote = 'pass' AND v_user1_vote IS NULL THEN
      -- Case D: Pass + Idle
      v_outcome := 'pass_idle';
    ELSIF v_user1_vote = 'yes' AND v_user2_vote IS NULL THEN
      -- Case E: Yes + Idle
      v_outcome := 'yes_idle';
    ELSIF v_user2_vote = 'yes' AND v_user1_vote IS NULL THEN
      -- Case E: Yes + Idle
      v_outcome := 'yes_idle';
    ELSE
      -- Case G: Idle + Idle (neither voted)
      v_outcome := 'idle_idle';
    END IF;
    
    -- Update match outcome
    UPDATE matches
    SET
      outcome = v_outcome,
      status = 'ended',
      updated_at = NOW()
    WHERE match_id = v_match.match_id;
    
    -- Handle outcome-specific actions
    IF v_outcome = 'pass_idle' THEN
      -- Case D: Pass + Idle
      IF v_user1_vote = 'pass' THEN
        v_pass_user_id := v_match.user1_id;
        v_idle_user_id := v_match.user2_id;
      ELSE
        v_pass_user_id := v_match.user2_id;
        v_idle_user_id := v_match.user1_id;
      END IF;
      
      -- Pass user auto-spins
      PERFORM auto_spin_user(v_pass_user_id);
      
      -- Idle user goes to idle (must press spin manually)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_idle_user_id;
      
    ELSIF v_outcome = 'yes_idle' THEN
      -- Case E: Yes + Idle
      IF v_user1_vote = 'yes' THEN
        v_yes_user_id := v_match.user1_id;
        v_idle_user_id := v_match.user2_id;
      ELSE
        v_yes_user_id := v_match.user2_id;
        v_idle_user_id := v_match.user1_id;
      END IF;
      
      -- Boost yes user's fairness and auto-spin
      UPDATE users_state
      SET
        fairness = LEAST(fairness + 10, 20),
        updated_at = NOW()
      WHERE user_id = v_yes_user_id;
      
      -- Yes user auto-spins
      PERFORM auto_spin_user(v_yes_user_id);
      
      -- Idle user goes to idle (must press spin manually)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_idle_user_id;
      
    ELSE
      -- idle_idle - both go to idle, NO auto-spin (Scenario 3 case g)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
    END IF;
    
    -- Add to never_pair_again history for expired votes (Scenario 7)
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
    
    v_resolved := v_resolved + 1;
  END LOOP;
  
  RETURN v_resolved;
END;
$$;

COMMENT ON FUNCTION record_vote_and_resolve IS 'Fixed to properly handle all 7 voting cases per spin/logic: both_yes, yes_pass, pass_pass, pass_idle (Case D), yes_idle (Case E), idle_idle (Case G). Pass+idle and yes+idle now correctly handled with only voting user auto-spinning.';
COMMENT ON FUNCTION auto_resolve_expired_vote_windows IS 'Fixed to properly handle pass+idle and yes+idle cases when vote windows expire. Distinguishes between pass+idle (only pass auto-spins) and yes+idle (yes auto-spins with +10 boost) vs idle+idle (no auto-spin).';
