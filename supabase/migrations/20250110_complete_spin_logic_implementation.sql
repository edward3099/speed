-- ============================================================================
-- Complete Spin Logic Implementation (Missing Pieces from @spin/logic)
-- ============================================================================
-- Implements auto-spin after voting outcomes and disconnect handling
-- ============================================================================

-- Helper function to auto-spin a user (rejoin queue)
CREATE OR REPLACE FUNCTION auto_spin_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
BEGIN
  -- Get current fairness
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update user state to waiting
  UPDATE users_state
  SET
    state = 'waiting',
    waiting_since = NOW(),
    partner_id = NULL,
    match_id = NULL,
    last_active = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Add to queue
  INSERT INTO queue (
    user_id,
    fairness,
    waiting_since,
    preference_stage,
    updated_at
  )
  VALUES (
    p_user_id,
    COALESCE(v_fairness, 0),
    NOW(),
    0,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    fairness = COALESCE(EXCLUDED.fairness, queue.fairness),
    waiting_since = NOW(),
    preference_stage = 0,
    updated_at = NOW();
END;
$$;

-- Update record_vote_and_resolve to auto-spin users per Scenario 3
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

-- Update auto_remove_offline_users to handle disconnects per Scenario 4
CREATE OR REPLACE FUNCTION auto_remove_offline_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_removed INTEGER := 0;
  v_cancelled INTEGER := 0;
  v_match RECORD;
  v_remaining_user_id UUID;
  v_remaining_vote TEXT;
BEGIN
  -- Remove offline users from queue (Scenario 4 case a)
  DELETE FROM queue
  WHERE user_id IN (
    SELECT user_id FROM users_state
    WHERE last_active < NOW() - INTERVAL '10 seconds'
      AND state = 'waiting'
  );
  
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  
  -- Handle disconnects during countdown (Scenario 4 case b)
  -- For matches where one user is offline, check if remaining user voted
  FOR v_match IN
    SELECT m.match_id, m.user1_id, m.user2_id, m.status
    FROM matches m
    JOIN users_state u1 ON m.user1_id = u1.user_id
    JOIN users_state u2 ON m.user2_id = u2.user_id
    WHERE m.status IN ('pending', 'vote_active')
      AND (
        (u1.last_active < NOW() - INTERVAL '10 seconds' AND u2.last_active > NOW() - INTERVAL '10 seconds')
        OR
        (u2.last_active < NOW() - INTERVAL '10 seconds' AND u1.last_active > NOW() - INTERVAL '10 seconds')
      )
  LOOP
    -- Determine which user is offline and which is remaining
    IF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_match.user1_id
        AND last_active < NOW() - INTERVAL '10 seconds'
    ) THEN
      v_remaining_user_id := v_match.user2_id;
    ELSE
      v_remaining_user_id := v_match.user1_id;
    END IF;
    
    -- Get remaining user's vote
    SELECT vote INTO v_remaining_vote
    FROM votes
    WHERE match_id = v_match.match_id
      AND voter_id = v_remaining_user_id;
    
    -- Cancel the match
    UPDATE matches
    SET
      status = 'cancelled',
      outcome = 'idle_idle',
      updated_at = NOW()
    WHERE match_id = v_match.match_id;
    
    -- Handle remaining user per Scenario 4 case b
    IF v_remaining_vote = 'yes' THEN
      -- Yes user auto-spins with +10 boost
      UPDATE users_state
      SET
        fairness = LEAST(fairness + 10, 20),
        updated_at = NOW()
      WHERE user_id = v_remaining_user_id;
      PERFORM auto_spin_user(v_remaining_user_id);
    ELSIF v_remaining_vote = 'pass' THEN
      -- Pass user auto-spins
      PERFORM auto_spin_user(v_remaining_user_id);
    ELSE
      -- Nothing happens (user did nothing)
      UPDATE users_state
      SET
        state = 'idle',
        partner_id = NULL,
        match_id = NULL,
        updated_at = NOW()
      WHERE user_id = v_remaining_user_id;
    END IF;
    
    -- Offline user goes to idle (must press spin manually when they return)
    UPDATE users_state
    SET
      state = 'idle',
      partner_id = NULL,
      match_id = NULL,
      updated_at = NOW()
    WHERE user_id IN (v_match.user1_id, v_match.user2_id)
      AND last_active < NOW() - INTERVAL '10 seconds';
    
    v_cancelled := v_cancelled + 1;
  END LOOP;
  
  -- Handle disconnect the moment match forms (Scenario 4 case c)
  -- Cancel matches where one user went offline immediately after match creation
  UPDATE matches
  SET
    status = 'cancelled',
    outcome = 'idle_idle',
    updated_at = NOW()
  WHERE match_id IN (
    SELECT m.match_id FROM matches m
    JOIN users_state u1 ON m.user1_id = u1.user_id
    JOIN users_state u2 ON m.user2_id = u2.user_id
    WHERE m.status = 'pending'
      AND m.created_at > NOW() - INTERVAL '5 seconds' -- Recent match
      AND (
        (u1.last_active < NOW() - INTERVAL '10 seconds' AND u2.last_active > NOW() - INTERVAL '10 seconds')
        OR
        (u2.last_active < NOW() - INTERVAL '10 seconds' AND u1.last_active > NOW() - INTERVAL '10 seconds')
      )
  );
  
  GET DIAGNOSTICS v_cancelled = v_cancelled + ROW_COUNT;
  
  -- For cancelled matches, auto-spin the remaining user
  FOR v_match IN
    SELECT m.match_id, m.user1_id, m.user2_id
    FROM matches m
    WHERE m.status = 'cancelled'
      AND m.updated_at > NOW() - INTERVAL '1 second' -- Just cancelled
  LOOP
    -- Find which user is still online
    IF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_match.user1_id
        AND last_active > NOW() - INTERVAL '10 seconds'
    ) THEN
      PERFORM auto_spin_user(v_match.user1_id);
    ELSIF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_match.user2_id
        AND last_active > NOW() - INTERVAL '10 seconds'
    ) THEN
      PERFORM auto_spin_user(v_match.user2_id);
    END IF;
  END LOOP;
  
  -- Update user states to idle for offline users in matches
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE last_active < NOW() - INTERVAL '10 seconds'
    AND state IN ('paired', 'vote_window');
  
  RETURN v_removed + v_cancelled;
END;
$$;

-- Update auto_resolve_expired_vote_windows to handle idle+idle per Scenario 3 case g
CREATE OR REPLACE FUNCTION auto_resolve_expired_vote_windows()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resolved INTEGER := 0;
BEGIN
  -- Resolve matches with expired vote windows as 'idle_idle' (Scenario 3 case g)
  UPDATE matches
  SET
    outcome = 'idle_idle',
    status = 'ended',
    updated_at = NOW()
  WHERE vote_window_expires_at < NOW()
    AND outcome IS NULL
    AND status = 'vote_active';
  
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  
  -- Update user states to idle for expired vote windows
  -- NO auto-spin for idle+idle (both must press spin manually - Scenario 3 case g)
  UPDATE users_state
  SET
    state = 'idle',
    partner_id = NULL,
    match_id = NULL,
    updated_at = NOW()
  WHERE state = 'vote_window'
    AND match_id IN (
      SELECT match_id FROM matches
      WHERE vote_window_expires_at < NOW()
        AND outcome = 'idle_idle'
    );
  
  -- Add to never_pair_again history for expired votes (Scenario 7)
  BEGIN
    INSERT INTO never_pair_again (user1, user2, reason)
    SELECT 
      LEAST(m.user1_id, m.user2_id),
      GREATEST(m.user1_id, m.user2_id),
      'idle_idle'
    FROM matches m
    WHERE m.vote_window_expires_at < NOW()
      AND m.outcome = 'idle_idle'
      AND NOT EXISTS (
        SELECT 1 FROM never_pair_again npa
        WHERE (npa.user1 = LEAST(m.user1_id, m.user2_id)
          AND npa.user2 = GREATEST(m.user1_id, m.user2_id))
      )
    ON CONFLICT DO NOTHING;
  EXCEPTION
    WHEN undefined_table THEN
      -- never_pair_again table doesn't exist, skip
      NULL;
  END;
  
  RETURN v_resolved;
END;
$$;

COMMENT ON FUNCTION auto_spin_user IS 'Automatically rejoins user to queue (auto-spin) - used after voting outcomes per Scenario 3';
COMMENT ON FUNCTION record_vote_and_resolve IS 'Updated to auto-spin users per Scenario 3: yes+pass and pass+pass auto-spin both, yes+idle and pass+idle handled by disconnect logic';
COMMENT ON FUNCTION auto_remove_offline_users IS 'Updated to handle disconnects per Scenario 4: during countdown checks vote and auto-spins remaining user, cancels matches when user disconnects at match formation';
COMMENT ON FUNCTION auto_resolve_expired_vote_windows IS 'Updated to handle idle+idle per Scenario 3 case g: both go to idle, no auto-spin';












































