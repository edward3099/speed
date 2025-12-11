-- ============================================================================
-- Zero Issues Architecture: Phase 4 - Disconnect Handling
-- ============================================================================
-- Implements disconnect handling for all scenarios:
-- 1. handle_disconnect - Handles user going offline
-- 2. Disconnect detector cron (handled in API endpoint)
-- ============================================================================

-- ============================================================================
-- FUNCTION 6: handle_disconnect
-- ============================================================================
-- Purpose: Handle user going offline
-- Handles all 3 disconnect scenarios:
-- - Case A: Disconnect during spinning (waiting → idle)
-- - Case B: Disconnect during voting (determine outcome based on partner)
-- - Case C: Disconnect at match formation (cancel match, return partner to waiting)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_disconnect(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_state RECORD;
  v_match RECORD;
  v_partner_id UUID;
  v_partner_state TEXT;
  v_outcome TEXT;
BEGIN
  -- Get user's current state
  SELECT 
    user_id,
    state,
    match_id,
    partner_id
  INTO v_user_state
  FROM users_state
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Case A: Disconnect during spinning (waiting state)
  IF v_user_state.state = 'waiting' THEN
    UPDATE users_state
    SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
      'scenario', 'disconnect_during_spinning',
      'user_state', 'idle',
      'partner_state', NULL
    );
  END IF;

  -- Case B & C: Disconnect during voting or at match formation (matched state)
  IF v_user_state.state = 'matched' AND v_user_state.match_id IS NOT NULL THEN
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
    WHERE match_id = v_user_state.match_id;
    
    IF NOT FOUND THEN
      -- Match not found, just set user to idle
      UPDATE users_state
      SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
      WHERE user_id = p_user_id;
      
      RETURN jsonb_build_object(
        'scenario', 'disconnect_match_not_found',
        'user_state', 'idle',
        'partner_state', NULL
      );
    END IF;

    -- Get partner ID
    v_partner_id := CASE 
      WHEN v_match.user1_id = p_user_id THEN v_match.user2_id
      ELSE v_match.user1_id
    END;

    -- Case C: Disconnect at match formation (status = 'paired', no votes yet)
    IF v_match.status = 'paired' THEN
      -- Cancel match, return partner to waiting
      UPDATE matches
      SET status = 'cancelled', updated_at = NOW()
      WHERE match_id = v_match.match_id;
      
      UPDATE users_state
      SET 
        state = 'waiting',
        waiting_since = NOW(),
        match_id = NULL,
        partner_id = NULL,
        last_active = NOW(),
        updated_at = NOW()
      WHERE user_id = v_partner_id;
      
      UPDATE users_state
      SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
      WHERE user_id = p_user_id;
      
      RETURN jsonb_build_object(
        'scenario', 'disconnect_at_match_formation',
        'user_state', 'idle',
        'partner_state', 'waiting'
      );
    END IF;

    -- Case B: Disconnect during voting (status = 'active')
    IF v_match.status = 'active' THEN
      -- Determine outcome based on partner's vote (or lack thereof)
      IF v_match.user1_id = p_user_id THEN
        -- Disconnected user is user1, check user2's vote
        IF v_match.user2_vote = 'yes' THEN
          v_outcome := 'yes_idle';
        ELSIF v_match.user2_vote = 'pass' THEN
          v_outcome := 'pass_idle';
        ELSE
          v_outcome := 'idle_idle';
        END IF;
      ELSE
        -- Disconnected user is user2, check user1's vote
        IF v_match.user1_vote = 'yes' THEN
          v_outcome := 'yes_idle';
        ELSIF v_match.user1_vote = 'pass' THEN
          v_outcome := 'pass_idle';
        ELSE
          v_outcome := 'idle_idle';
        END IF;
      END IF;

      -- Update match with outcome
      UPDATE matches
      SET outcome = v_outcome, status = 'completed', updated_at = NOW()
      WHERE match_id = v_match.match_id;

      -- Handle outcome (same logic as resolve_expired_votes)
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
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'pass'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'pass'
            THEN 'waiting' ELSE 'idle' END,
          waiting_since = CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'pass'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'pass'
            THEN NOW() ELSE NULL END,
          match_id = NULL,
          partner_id = NULL,
          last_active = CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'pass'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'pass'
            THEN NOW() ELSE last_active END,
          updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
        
      ELSIF v_outcome = 'yes_idle' THEN
        -- Yes user → waiting with +10 boost, idle user → idle
        UPDATE users_state
        SET 
          state = CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'yes'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'yes'
            THEN 'waiting' ELSE 'idle' END,
          waiting_since = CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'yes'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'yes'
            THEN NOW() ELSE NULL END,
          match_id = NULL,
          partner_id = NULL,
          fairness = fairness + CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'yes'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'yes'
            THEN 10 ELSE 0 END,
          last_active = CASE 
            WHEN user_id = v_partner_id AND v_match.user1_id = p_user_id AND v_match.user2_vote = 'yes'
                 OR user_id = v_partner_id AND v_match.user2_id = p_user_id AND v_match.user1_vote = 'yes'
            THEN NOW() ELSE last_active END,
          updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
      END IF;
      
      RETURN jsonb_build_object(
        'scenario', 'disconnect_during_voting',
        'outcome', v_outcome,
        'user_state', 'idle',
        'partner_state', CASE 
          WHEN v_outcome IN ('yes_idle', 'pass_idle') THEN 'waiting'
          ELSE 'idle'
        END
      );
    END IF;
  END IF;

  -- Default: set to idle
  UPDATE users_state
  SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'scenario', 'default',
    'user_state', 'idle',
    'partner_state', NULL
  );
END;
$$;

COMMENT ON FUNCTION handle_disconnect IS 'Handle user going offline. Handles all 3 disconnect scenarios: during spinning, during voting, at match formation. Returns scenario and resulting states.';







