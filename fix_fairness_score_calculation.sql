-- ============================================================================
-- Fix: Add calculate_fairness_score call to join_queue
-- ============================================================================
-- Issue: join_queue sets fairness_score = 0 but doesn't call calculate_fairness_score
-- Fix: Call calculate_fairness_score after inserting into queue
-- ============================================================================

CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_online BOOLEAN;
  user_cooldown TIMESTAMPTZ;
BEGIN
  -- Check user is online (from profiles table)
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Remove from queue if already exists (allows re-joining)
  DELETE FROM queue WHERE user_id = p_user_id;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO UPDATE
  SET fairness_score = 0,
      spin_started_at = NOW(),
      preference_stage = 0,
      updated_at = NOW();
  
  -- Calculate initial fairness score (will be 0 initially, but ensures consistency)
  PERFORM calculate_fairness_score(p_user_id);
  
  -- Ensure user_status exists and update to spin_active
  INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  VALUES (p_user_id, 'spin_active', NOW(), 'idle', NOW(), NOW(), TRUE, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(user_status.state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW(),
      online_status = TRUE,
      last_heartbeat = NOW();
  
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- Fix: Recalculate fairness scores in process_matching before matching
-- ============================================================================
-- Issue: process_matching uses fairness_score from queue but doesn't recalculate it
-- Fix: Recalculate fairness scores before matching to ensure accuracy
-- ============================================================================

CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
  user_record RECORD;
  candidate_id UUID;
  match_id BIGINT;
  v_preference_stage INTEGER;
  wait_time_seconds INTEGER;
BEGIN
  -- Recalculate fairness scores for all users in queue before matching
  -- This ensures fairness scores are up-to-date with current wait times
  PERFORM calculate_fairness_score(q.user_id)
  FROM queue q
  INNER JOIN profiles u ON u.id = q.user_id
  INNER JOIN user_status us ON us.user_id = q.user_id
  WHERE u.online = TRUE
    AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
    AND us.state IN ('spin_active', 'queue_waiting');
  
  -- Process all users in queue, ordered by priority
  FOR user_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      q.preference_stage,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    INNER JOIN user_status us ON us.user_id = q.user_id
    WHERE u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND us.state IN ('spin_active', 'queue_waiting')
    ORDER BY 
      q.fairness_score DESC,
      wait_time_seconds DESC,
      RANDOM() -- Random tiebreaker
  LOOP
    -- Skip if already matched in this cycle
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = user_record.user_id OR user2_id = user_record.user_id)
        AND status IN ('pending', 'vote_active')
    ) THEN
      CONTINUE;
    END IF;
    
    -- Determine preference stage based on wait time
    v_preference_stage := user_record.preference_stage;
    
    -- Update preference stage if needed
    IF user_record.wait_time_seconds >= 20 THEN
      v_preference_stage := 3; -- Full expansion
    ELSIF user_record.wait_time_seconds >= 15 THEN
      v_preference_stage := 2; -- Distance expanded
    ELSIF user_record.wait_time_seconds >= 10 THEN
      v_preference_stage := 1; -- Age expanded
    ELSE
      v_preference_stage := 0; -- Exact preferences
    END IF;
    
    -- Update preference stage if changed
    IF v_preference_stage != user_record.preference_stage THEN
      UPDATE queue
      SET preference_stage = v_preference_stage,
          updated_at = NOW()
      WHERE user_id = user_record.user_id;
    END IF;
    
    -- Find best match for this user
    candidate_id := find_best_match(user_record.user_id, v_preference_stage);
    
    -- If candidate found, create pair atomically
    IF candidate_id IS NOT NULL THEN
      match_id := create_pair_atomic(user_record.user_id, candidate_id);
      
      IF match_id IS NOT NULL THEN
        matched_count := matched_count + 1;
        
        -- Transition both to vote_active
        UPDATE user_status
        SET state = 'vote_active',
            vote_window_started_at = NOW(),
            last_state = 'paired',
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (user_record.user_id, candidate_id);
        
        -- Update match status
        UPDATE matches
        SET status = 'vote_active',
            vote_window_expires_at = NOW() + INTERVAL '30 seconds'
        WHERE id = match_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN matched_count;
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Joins user to queue - validates online, cooldown, duplicates, and calculates fairness score';
COMMENT ON FUNCTION process_matching IS 'Main matching engine - recalculates fairness scores before matching, processes all eligible users in queue, ordered by priority';

