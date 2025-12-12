-- Fix record_vote to create video_date when outcome is both_yes
-- The comment said "handled by API" but API doesn't create it - database function must create it

CREATE OR REPLACE FUNCTION record_vote(
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
  v_outcome TEXT;
  v_user_is_user1 BOOLEAN;
  v_partner_id UUID;
  v_update_count INTEGER;
  v_retry_count INTEGER := 0;
  v_max_retries INTEGER := 3;
  v_both_votes_present BOOLEAN := FALSE;
BEGIN
  -- Validate vote
  IF p_vote NOT IN ('yes', 'pass') THEN
    RETURN jsonb_build_object('error', 'Invalid vote. Must be yes or pass');
  END IF;

  -- Get match info
  SELECT 
    match_id,
    user1_id,
    user2_id,
    status,
    vote_window_expires_at,
    user1_vote,
    user2_vote,
    outcome
  INTO v_match
  FROM matches
  WHERE match_id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found or user not part of match');
  END IF;

  -- Validate vote window
  IF v_match.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Vote window not active');
  END IF;

  IF v_match.vote_window_expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'Vote window expired');
  END IF;

  -- Determine which user this is
  v_user_is_user1 := (v_match.user1_id = p_user_id);

  -- Update vote (idempotent) with explicit row count check
  IF v_user_is_user1 THEN
    UPDATE matches
    SET user1_vote = p_vote, updated_at = NOW()
    WHERE match_id = p_match_id;
    GET DIAGNOSTICS v_update_count = ROW_COUNT;
    
    IF v_update_count = 0 THEN
      RETURN jsonb_build_object('error', 'Failed to update vote - no rows affected');
    END IF;
  ELSE
    UPDATE matches
    SET user2_vote = p_vote, updated_at = NOW()
    WHERE match_id = p_match_id;
    GET DIAGNOSTICS v_update_count = ROW_COUNT;
    
    IF v_update_count = 0 THEN
      RETURN jsonb_build_object('error', 'Failed to update vote - no rows affected');
    END IF;
  END IF;

  -- CRITICAL: Re-read from database to get current vote state (handles race conditions)
  -- Use retry mechanism to handle simultaneous votes
  LOOP
    -- Select with FOR UPDATE SKIP LOCKED to avoid deadlocks, but we'll check without locking first
    -- (FOR UPDATE would lock the row, which could cause issues with simultaneous votes)
    SELECT user1_vote, user2_vote
    INTO v_match.user1_vote, v_match.user2_vote
    FROM matches
    WHERE match_id = p_match_id;

    -- Check if both votes are present
    IF v_match.user1_vote IS NOT NULL AND v_match.user2_vote IS NOT NULL THEN
      v_both_votes_present := TRUE;
      EXIT; -- Exit loop, both votes present
    END IF;

    -- If not both present and we've retried enough, exit loop
    v_retry_count := v_retry_count + 1;
    IF v_retry_count >= v_max_retries THEN
      EXIT; -- Exit loop, return waiting status
    END IF;

    -- Small delay to allow other transaction to commit (100ms)
    PERFORM pg_sleep(0.1);
    
    -- Re-read after delay
    SELECT user1_vote, user2_vote
    INTO v_match.user1_vote, v_match.user2_vote
    FROM matches
    WHERE match_id = p_match_id;

    IF v_match.user1_vote IS NOT NULL AND v_match.user2_vote IS NOT NULL THEN
      v_both_votes_present := TRUE;
      EXIT; -- Exit loop, both votes present after retry
    END IF;
  END LOOP;

  -- Check if both votes received (using fresh database values)
  IF v_both_votes_present THEN
    -- Both voted, determine outcome immediately
    v_outcome := CASE
      WHEN v_match.user1_vote = 'yes' AND v_match.user2_vote = 'yes' THEN 'both_yes'
      WHEN v_match.user1_vote = 'yes' AND v_match.user2_vote = 'pass' THEN 'yes_pass'
      WHEN v_match.user1_vote = 'pass' AND v_match.user2_vote = 'yes' THEN 'yes_pass'
      WHEN v_match.user1_vote = 'pass' AND v_match.user2_vote = 'pass' THEN 'pass_pass'
      ELSE NULL
    END;

    -- Update match with outcome - CLEAR vote_window_expires_at to satisfy constraint
    UPDATE matches
    SET 
      outcome = v_outcome,
      status = 'completed',
      vote_window_expires_at = NULL,
      vote_window_started_at = NULL,
      updated_at = NOW()
    WHERE match_id = p_match_id;

    -- Handle outcome (all in one place)
    v_partner_id := CASE 
      WHEN v_user_is_user1 THEN v_match.user2_id
      ELSE v_match.user1_id
    END;

    -- Apply outcome logic
    IF v_outcome = 'both_yes' THEN
      -- Both → idle, create video_date atomically
      -- FIXED: Actually create video_date here (API doesn't handle it)
      BEGIN
        INSERT INTO video_dates (match_id, user1_id, user2_id, status)
        VALUES (p_match_id::TEXT, v_match.user1_id, v_match.user2_id, 'countdown')
        ON CONFLICT (match_id) DO NOTHING;
      EXCEPTION
        WHEN undefined_table THEN
          -- video_dates table doesn't exist, skip
          NULL;
      END;
      
      UPDATE users_state
      SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      
    ELSIF v_outcome = 'yes_pass' THEN
      -- Both → waiting (auto-requeue), yes user gets +10 boost
      UPDATE users_state
      SET 
        state = 'waiting',
        waiting_since = NOW(),
        match_id = NULL,
        partner_id = NULL,
        fairness = fairness + CASE WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'yes') 
                                      OR (user_id = v_match.user2_id AND v_match.user2_vote = 'yes')
                                    THEN 10 ELSE 0 END,
        last_active = NOW(),
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      
    ELSIF v_outcome = 'pass_pass' THEN
      -- Both → waiting (auto-requeue), no boosts
      UPDATE users_state
      SET 
        state = 'waiting',
        waiting_since = NOW(),
        match_id = NULL,
        partner_id = NULL,
        last_active = NOW(),
        updated_at = NOW()
      WHERE user_id IN (v_match.user1_id, v_match.user2_id);
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'completed', true
    );
  ELSE
    -- Waiting for partner
    RETURN jsonb_build_object(
      'outcome', NULL,
      'completed', false,
      'message', 'Waiting for partner to vote',
      'debug_info', jsonb_build_object(
        'user1_vote', v_match.user1_vote,
        'user2_vote', v_match.user2_vote,
        'rows_updated', v_update_count,
        'retries', v_retry_count
      )
    );
  END IF;
END;
$$;
