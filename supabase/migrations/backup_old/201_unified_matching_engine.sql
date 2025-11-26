-- ============================================================================
-- Blueprint Migration 201: Unified Matching Engine
-- ============================================================================
-- Part 2.1: THE ONLY FUNCTION THAT CREATES MATCHES
-- ============================================================================

-- THE ONLY FUNCTION THAT CREATES MATCHES
CREATE OR REPLACE FUNCTION unified_matching_engine(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
  match_id UUID;
  candidate_id UUID;
  max_wait_cycles INTEGER := 30;
  wait_cycle INTEGER := 0;
  online_opposite_gender_count INTEGER;
  user_profile RECORD;
BEGIN
  -- 1. Validate user is in matchable state
  IF NOT is_matchable(p_user_id) THEN
    RETURN NULL;
  END IF;
  
  -- 2. Check if user is already matched (prevent duplicates)
  IF is_user_already_matched(p_user_id) THEN
    RETURN NULL;
  END IF;
  
  -- 3. Get user profile for gender check
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  -- 4. Try Tier 1: Exact preferences
  candidate_id := find_candidate(p_user_id, 1);
  IF candidate_id IS NOT NULL THEN
    -- Re-check online status before creating match
    IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
      RETURN NULL;
    END IF;
    match_id := create_match_atomic(p_user_id, candidate_id);
    IF match_id IS NOT NULL THEN
      -- Transition both users to 'paired'
      PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
      PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
      -- Reset preference expansion after successful match
      PERFORM reset_preference_expansion(p_user_id);
      RETURN match_id;
    END IF;
  END IF;
  
  -- 5. Apply preference expansion if waiting > 30 seconds (before Tier 2)
  PERFORM apply_preference_expansion(p_user_id);
  
  -- 6. Try Tier 2: Expanded preferences
  candidate_id := find_candidate(p_user_id, 2);
  IF candidate_id IS NOT NULL THEN
    -- Re-check online status before creating match
    IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
      RETURN NULL;
    END IF;
    match_id := create_match_atomic(p_user_id, candidate_id);
    IF match_id IS NOT NULL THEN
      PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
      PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
      RETURN match_id;
    END IF;
  END IF;
  
  -- 7. Tier 3: Guaranteed match (with strict validation)
  -- Check if any online opposite-gender users exist
  SELECT COUNT(*) INTO online_opposite_gender_count
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    );
  
  -- Early return if no online candidates exist
  IF online_opposite_gender_count = 0 THEN
    -- Return special code to indicate "waiting for partner"
    PERFORM log_event('no_online_candidates', p_user_id, 
      jsonb_build_object('message', 'Waiting for partner to arrive'));
    RETURN NULL; -- Frontend should show "waiting for partner" message
  END IF;
  
  -- TRUE GUARANTEE: Keep retrying until match found (only if candidates exist)
  WHILE match_id IS NULL AND wait_cycle < max_wait_cycles LOOP
    -- Re-check online status before each retry
    IF NOT is_user_online(p_user_id) THEN
      PERFORM log_event('guaranteed_match_retry_failed', p_user_id, 
        jsonb_build_object('reason', 'user_offline', 'cycle', wait_cycle));
      RETURN NULL;
    END IF;
    
    candidate_id := find_guaranteed_match_strict(p_user_id);
    
    IF candidate_id IS NULL THEN
      -- Log why no candidate found (for debugging)
      PERFORM log_event('guaranteed_match_no_candidate', p_user_id, 
        jsonb_build_object(
          'cycle', wait_cycle,
          'reason', 'no_opposite_gender_online_or_all_blocked_or_all_matched',
          'online_candidates', online_opposite_gender_count
        ));
    ELSE
      -- Re-check online status of both users before creating match
      IF NOT is_user_online(p_user_id) OR NOT is_user_online(candidate_id) THEN
        -- One user went offline, log and continue
        PERFORM log_event('guaranteed_match_retry_failed', p_user_id, 
          jsonb_build_object(
            'reason', 'candidate_went_offline', 
            'cycle', wait_cycle,
            'candidate_id', candidate_id
          ));
        PERFORM pg_sleep(1);
        wait_cycle := wait_cycle + 1;
        CONTINUE;
      END IF;
      
      match_id := create_match_atomic(p_user_id, candidate_id);
      IF match_id IS NULL THEN
        -- Log why match creation failed (candidate already matched, deadlock, etc.)
        PERFORM log_event('guaranteed_match_create_failed', p_user_id, 
          jsonb_build_object(
            'reason', 'candidate_already_matched_or_deadlock',
            'cycle', wait_cycle,
            'candidate_id', candidate_id
          ));
      ELSE
        -- Success!
        PERFORM state_machine_transition(p_user_id, 'match_found', jsonb_build_object('match_id', match_id));
        PERFORM state_machine_transition(candidate_id, 'match_found', jsonb_build_object('match_id', match_id));
        -- Reset preference expansion after successful match
        PERFORM reset_preference_expansion(p_user_id);
        RETURN match_id;
      END IF;
    END IF;
    
    -- Wait 1 second before retry
    PERFORM pg_sleep(1);
    wait_cycle := wait_cycle + 1;
    
    -- Recalculate fairness every 5 seconds (not every retry)
    IF wait_cycle % 5 = 0 THEN
      PERFORM calculate_fairness_score(p_user_id);
    END IF;
    
    -- Reset expired preference expansions
    PERFORM reset_preference_expansion(p_user_id);
  END LOOP;
  
  -- If still no match after max cycles, this is a system error
  IF match_id IS NULL THEN
    PERFORM log_event('guaranteed_match_failed', p_user_id, 
      jsonb_build_object('wait_cycles', wait_cycle, 'online_candidates', online_opposite_gender_count),
      'ERROR',
      'unified_matching_engine'
    );
  END IF;
  
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION unified_matching_engine IS 'THE ONLY FUNCTION THAT CREATES MATCHES - Single entry point for all matching logic';

