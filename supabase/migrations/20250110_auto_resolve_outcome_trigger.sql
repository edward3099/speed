-- ============================================================================
-- Auto-Resolve Outcome Trigger
-- ============================================================================
-- Phase 3.1: Automatically resolve outcomes when both votes recorded
-- ============================================================================

-- Function to auto-resolve outcome when both votes recorded
CREATE OR REPLACE FUNCTION auto_resolve_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_user1_vote TEXT;
  v_user2_vote TEXT;
  v_both_voted BOOLEAN;
  v_outcome TEXT;
BEGIN
  -- Get match info
  SELECT user1_id, user2_id, status, outcome, vote_window_expires_at
  INTO v_match
  FROM matches
  WHERE match_id = NEW.match_id;
  
  -- Only proceed if match exists and outcome not already resolved
  IF NOT FOUND OR v_match.outcome IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if vote window expired
  IF v_match.vote_window_expires_at IS NOT NULL AND v_match.vote_window_expires_at < NOW() THEN
    -- Vote window expired, resolve as idle_idle
    UPDATE matches
    SET
      outcome = 'idle_idle',
      status = 'ended',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE match_id = NEW.match_id;
    
    -- Update both users to idle
    UPDATE users_state
    SET
      state = 'idle',
      partner_id = NULL,
      match_id = NULL,
      updated_at = NOW()
    WHERE user_id IN (v_match.user1_id, v_match.user2_id);
    
    RETURN NEW;
  END IF;
  
  -- Get both votes
  SELECT 
    MAX(CASE WHEN voter_id = v_match.user1_id THEN vote END),
    MAX(CASE WHEN voter_id = v_match.user2_id THEN vote END)
  INTO v_user1_vote, v_user2_vote
  FROM votes
  WHERE match_id = NEW.match_id;
  
  -- Check if both voted
  v_both_voted := (v_user1_vote IS NOT NULL AND v_user2_vote IS NOT NULL);
  
  -- If pass vote recorded, resolve immediately (pass always wins)
  IF NEW.vote = 'pass' THEN
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
    
    -- Update match outcome
    UPDATE matches
    SET
      outcome = v_outcome,
      status = 'ended',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE match_id = NEW.match_id;
    
    -- Handle outcome-specific actions
    IF v_outcome = 'both_yes' THEN
      -- Create video-date atomically
      BEGIN
        INSERT INTO video_dates (match_id, user1_id, user2_id, status)
        VALUES (NEW.match_id::TEXT, v_match.user1_id, v_match.user2_id, 'countdown')
        ON CONFLICT DO NOTHING;
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
      DECLARE
        v_yes_user_id UUID;
        v_pass_user_id UUID;
      BEGIN
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
      END;
      
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_resolve_outcome ON votes;
CREATE TRIGGER trigger_auto_resolve_outcome
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION auto_resolve_outcome();

COMMENT ON FUNCTION auto_resolve_outcome IS 'Automatically resolves match outcome when both votes recorded - ensures outcomes are resolved even if application logic fails';
COMMENT ON TRIGGER trigger_auto_resolve_outcome ON votes IS 'Triggers outcome resolution when vote is recorded';

