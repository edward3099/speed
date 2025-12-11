-- ============================================================================
-- Zero Issues Architecture: Phase 3 - Voting System
-- ============================================================================
-- Implements voting with all outcome handling in one place:
-- 1. acknowledge_match - User acknowledges match, starts vote window
-- 2. record_vote - Record vote and determine outcome if complete
-- 3. resolve_expired_votes - Handle expired vote windows
-- ============================================================================

-- ============================================================================
-- FUNCTION 3: acknowledge_match
-- ============================================================================
-- Purpose: User acknowledges match, starts vote window if both acknowledged
-- Idempotent: safe to call multiple times
-- ============================================================================

CREATE OR REPLACE FUNCTION acknowledge_match(p_user_id UUID, p_match_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_vote_window_expires_at TIMESTAMPTZ;
BEGIN
  -- Verify user is part of match
  SELECT 
    match_id,
    user1_id,
    user2_id,
    status,
    user1_acknowledged_at,
    user2_acknowledged_at,
    vote_window_expires_at
  INTO v_match
  FROM matches
  WHERE match_id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
    AND status = 'paired';
  
  IF NOT FOUND THEN
    -- Match not found or user not part of it
    RETURN NULL;
  END IF;

  -- Update acknowledgment timestamp (idempotent)
  IF v_match.user1_id = p_user_id AND v_match.user1_acknowledged_at IS NULL THEN
    UPDATE matches
    SET 
      user1_acknowledged_at = NOW(),
      updated_at = NOW()
    WHERE match_id = p_match_id;
    
    -- Refresh match record
    SELECT user1_acknowledged_at, user2_acknowledged_at INTO v_match.user1_acknowledged_at, v_match.user2_acknowledged_at
    FROM matches WHERE match_id = p_match_id;
  ELSIF v_match.user2_id = p_user_id AND v_match.user2_acknowledged_at IS NULL THEN
    UPDATE matches
    SET 
      user2_acknowledged_at = NOW(),
      updated_at = NOW()
    WHERE match_id = p_match_id;
    
    -- Refresh match record
    SELECT user1_acknowledged_at, user2_acknowledged_at INTO v_match.user1_acknowledged_at, v_match.user2_acknowledged_at
    FROM matches WHERE match_id = p_match_id;
  END IF;

  -- Check if both users acknowledged
  IF v_match.user1_acknowledged_at IS NOT NULL 
     AND v_match.user2_acknowledged_at IS NOT NULL 
     AND v_match.vote_window_expires_at IS NULL THEN
    -- Both acknowledged, start vote window
    v_vote_window_expires_at := NOW() + INTERVAL '10 seconds';
    
    UPDATE matches
    SET 
      status = 'active',
      vote_window_expires_at = v_vote_window_expires_at,
      vote_window_started_at = NOW(),
      updated_at = NOW()
    WHERE match_id = p_match_id;
    
    RETURN v_vote_window_expires_at;
  ELSIF v_match.vote_window_expires_at IS NOT NULL THEN
    -- Vote window already started
    RETURN v_match.vote_window_expires_at;
  ELSE
    -- Waiting for partner to acknowledge
    RETURN NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION acknowledge_match IS 'User acknowledges match. Starts vote window when both users acknowledge. Returns vote window expiry time or NULL if waiting for partner.';

-- ============================================================================
-- FUNCTION 4: record_vote
-- ============================================================================
-- Purpose: Record vote and determine outcome if complete
-- Handles all 7 outcomes in one place
-- ============================================================================

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
  v_partner_state TEXT;
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

  -- Update vote (idempotent)
  IF v_user_is_user1 THEN
    UPDATE matches
    SET user1_vote = p_vote, updated_at = NOW()
    WHERE match_id = p_match_id;
    v_match.user1_vote := p_vote;
  ELSE
    UPDATE matches
    SET user2_vote = p_vote, updated_at = NOW()
    WHERE match_id = p_match_id;
    v_match.user2_vote := p_vote;
  END IF;

  -- Check if both votes received
  IF v_match.user1_vote IS NOT NULL AND v_match.user2_vote IS NOT NULL THEN
    -- Both voted, determine outcome immediately
    v_outcome := CASE
      WHEN v_match.user1_vote = 'yes' AND v_match.user2_vote = 'yes' THEN 'both_yes'
      WHEN v_match.user1_vote = 'yes' AND v_match.user2_vote = 'pass' THEN 'yes_pass'
      WHEN v_match.user1_vote = 'pass' AND v_match.user2_vote = 'yes' THEN 'yes_pass'
      WHEN v_match.user1_vote = 'pass' AND v_match.user2_vote = 'pass' THEN 'pass_pass'
      ELSE NULL
    END;

    -- Update match with outcome
    UPDATE matches
    SET 
      outcome = v_outcome,
      status = 'completed',
      updated_at = NOW()
    WHERE match_id = p_match_id;

    -- Handle outcome (all in one place)
    -- Get partner ID
    v_partner_id := CASE 
      WHEN v_user_is_user1 THEN v_match.user2_id
      ELSE v_match.user1_id
    END;

    -- Apply outcome logic
    IF v_outcome = 'both_yes' THEN
      -- Both → idle, create video_date (handled by API)
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
      'message', 'Waiting for partner to vote'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION record_vote IS 'Record vote and determine outcome if both votes received. Handles all outcomes: both_yes, yes_pass, pass_pass. Returns outcome or waiting status.';

-- ============================================================================
-- FUNCTION 5: resolve_expired_votes
-- ============================================================================
-- Purpose: Handle vote windows that expired (idle+idle case)
-- Called by cron every 10 seconds
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_expired_votes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_resolved_count INTEGER := 0;
BEGIN
  -- Find expired vote windows
  FOR v_match IN
    SELECT 
      match_id,
      user1_id,
      user2_id,
      user1_vote,
      user2_vote
    FROM matches
    WHERE vote_window_expires_at < NOW()
      AND status = 'active'
      AND outcome IS NULL
  LOOP
    -- Determine outcome based on votes received (or lack thereof)
    DECLARE
      v_outcome TEXT;
    BEGIN
      -- Determine outcome
      IF v_match.user1_vote IS NULL AND v_match.user2_vote IS NULL THEN
        v_outcome := 'idle_idle';
      ELSIF v_match.user1_vote = 'pass' AND v_match.user2_vote IS NULL THEN
        v_outcome := 'pass_idle';
      ELSIF v_match.user1_vote IS NULL AND v_match.user2_vote = 'pass' THEN
        v_outcome := 'pass_idle';
      ELSIF v_match.user1_vote = 'yes' AND v_match.user2_vote IS NULL THEN
        v_outcome := 'yes_idle';
      ELSIF v_match.user1_vote IS NULL AND v_match.user2_vote = 'yes' THEN
        v_outcome := 'yes_idle';
      ELSE
        -- Should not happen, but handle gracefully
        v_outcome := 'idle_idle';
      END IF;

      -- Update match
      UPDATE matches
      SET 
        outcome = v_outcome,
        status = 'completed',
        updated_at = NOW()
      WHERE match_id = v_match.match_id;

      -- Handle outcome
      IF v_outcome = 'idle_idle' THEN
        -- Both → idle
        UPDATE users_state
        SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
        
      ELSIF v_outcome = 'pass_idle' THEN
        -- Pass user → waiting, idle user → idle
        UPDATE users_state
        SET 
          state = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'pass')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'pass')
            THEN 'waiting'
            ELSE 'idle'
          END,
          waiting_since = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'pass')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'pass')
            THEN NOW()
            ELSE NULL
          END,
          match_id = NULL,
          partner_id = NULL,
          last_active = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'pass')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'pass')
            THEN NOW()
            ELSE last_active
          END,
          updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
        
      ELSIF v_outcome = 'yes_idle' THEN
        -- Yes user → waiting with +10 boost, idle user → idle
        UPDATE users_state
        SET 
          state = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'yes')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'yes')
            THEN 'waiting'
            ELSE 'idle'
          END,
          waiting_since = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'yes')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'yes')
            THEN NOW()
            ELSE NULL
          END,
          match_id = NULL,
          partner_id = NULL,
          fairness = fairness + CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'yes')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'yes')
            THEN 10
            ELSE 0
          END,
          last_active = CASE 
            WHEN (user_id = v_match.user1_id AND v_match.user1_vote = 'yes')
                 OR (user_id = v_match.user2_id AND v_match.user2_vote = 'yes')
            THEN NOW()
            ELSE last_active
          END,
          updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      END IF;

      v_resolved_count := v_resolved_count + 1;
    END;
  END LOOP;

  RETURN v_resolved_count;
END;
$$;

COMMENT ON FUNCTION resolve_expired_votes IS 'Handle expired vote windows (idle+idle case). Called by cron every 10 seconds. Returns count of resolved matches.';


