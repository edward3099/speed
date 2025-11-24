-- ============================================================================
-- Integration: Update Existing Functions to Use Queue Management System
-- ============================================================================
-- 
-- This migration integrates validate_match_rules into existing matching functions
-- to ensure 100% rule enforcement.
-- ============================================================================

-- ============================================================================
-- Update create_pair_atomic to use validate_match_rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID AS $$
DECLARE
  match_id UUID;
  user1_status TEXT;
  user2_status TEXT;
  update_count INTEGER;
  retry_count INTEGER := 0;
  max_retries INTEGER := 10;
  v_user1_id UUID;
  v_user2_id UUID;
  lock_acquired BOOLEAN := FALSE;
  backoff_ms INTEGER;
BEGIN
  -- Use local variables for consistent ordering (can't modify parameters)
  IF p_user1_id > p_user2_id THEN
    v_user1_id := p_user2_id;
    v_user2_id := p_user1_id;
  ELSE
    v_user1_id := p_user1_id;
    v_user2_id := p_user2_id;
  END IF;
  
  -- Enhanced retry loop for lock conflicts with exponential backoff
  WHILE retry_count < max_retries AND NOT lock_acquired LOOP
    BEGIN
      -- Try to lock both users individually (PostgreSQL doesn't allow aggregates with FOR UPDATE)
      SELECT status INTO user1_status
      FROM matching_queue
      WHERE user_id = v_user1_id
        AND status IN ('spin_active', 'queue_waiting')
      FOR UPDATE NOWAIT;
      
      SELECT status INTO user2_status
      FROM matching_queue
      WHERE user_id = v_user2_id
        AND status IN ('spin_active', 'queue_waiting')
      FOR UPDATE NOWAIT;
      
      -- If both locks acquired and both users found, proceed
      IF user1_status IS NOT NULL AND user2_status IS NOT NULL THEN
        lock_acquired := TRUE;
        EXIT; -- Success - both locks acquired
      ELSE
        -- One or both users not available, return NULL immediately (no retry needed)
        RETURN NULL;
      END IF;
      
    EXCEPTION 
      WHEN lock_not_available THEN
        retry_count := retry_count + 1;
        IF retry_count < max_retries THEN
          -- Enhanced exponential backoff: 50ms → 3000ms
          IF retry_count <= 3 THEN
            backoff_ms := 50 * retry_count;
          ELSIF retry_count <= 7 THEN
            backoff_ms := 200 + (retry_count - 3) * 200;
          ELSE
            backoff_ms := 1000 + (retry_count - 7) * 500;
          END IF;
          PERFORM pg_sleep(backoff_ms / 1000.0);
        ELSE
          -- Max retries reached, give up
          RETURN NULL;
        END IF;
      WHEN OTHERS THEN
        -- Log unexpected errors
        PERFORM spark_log_error(
          p_error_type := 'function',
          p_error_message := SQLERRM,
          p_error_code := SQLSTATE,
          p_error_details := jsonb_build_object(
            'function', 'create_pair_atomic',
            'user1_id', v_user1_id,
            'user2_id', v_user2_id,
            'retry_count', retry_count
          ),
          p_function_name := 'create_pair_atomic',
          p_user_id := v_user1_id,
          p_operation_duration_ms := 0,
          p_severity := 'ERROR'
        );
        RETURN NULL;
    END;
  END LOOP;
  
  -- If we couldn't acquire locks after all retries, return NULL
  IF NOT lock_acquired THEN
    RETURN NULL;
  END IF;
  
  -- Verify both are still matchable
  IF user1_status NOT IN ('spin_active', 'queue_waiting') OR
     user2_status NOT IN ('spin_active', 'queue_waiting') THEN
    RETURN NULL;
  END IF;
  
  -- CRITICAL: Validate match rules BEFORE creating match
  -- Use Tier 3 validation (most relaxed) since we're in create_pair_atomic
  -- The tier-based filtering already happened in find_best_match_v2
  IF NOT validate_match_rules(v_user1_id, v_user2_id, 3) THEN
    -- Rules validation failed - release locks and return NULL
    RETURN NULL;
  END IF;
  
  -- Check if match already exists
  SELECT id INTO match_id
  FROM matches
  WHERE user1_id = v_user1_id
    AND user2_id = v_user2_id
    AND status = 'pending';
  
  IF match_id IS NOT NULL THEN
    -- Match already exists, return it
    RETURN match_id;
  END IF;
  
  -- Create match
  INSERT INTO matches (user1_id, user2_id, status, matched_at, vote_started_at)
  VALUES (v_user1_id, v_user2_id, 'pending', NOW(), NOW())
  ON CONFLICT (user1_id, user2_id) DO NOTHING
  RETURNING id INTO match_id;
  
  IF match_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Update both users to vote_active (atomic)
  UPDATE matching_queue
  SET status = 'vote_active',
      updated_at = NOW(),
      fairness_score = 0, -- Reset fairness on match
      skip_count = 0
  WHERE user_id IN (v_user1_id, v_user2_id)
    AND status IN ('spin_active', 'queue_waiting');
  
  GET DIAGNOSTICS update_count = ROW_COUNT;
  
  -- Verify both were updated
  IF update_count != 2 THEN
    -- Rollback: delete match and reset users
    DELETE FROM matches WHERE id = match_id;
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id IN (v_user1_id, v_user2_id)
      AND status = 'vote_active';
    RETURN NULL;
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_pair_atomic IS 'Creates a match atomically with rule validation. Updated to use validate_match_rules for 100% rule enforcement.';

-- ============================================================================
-- Update find_best_match_v2 to use validate_match_rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_best_match_v2(
  p_user_id UUID,
  p_tier INTEGER DEFAULT 1
) RETURNS UUID AS $$
DECLARE
  user_queue RECORD;
  user_profile RECORD;
  user_prefs RECORD;
  best_match_id UUID;
  best_priority_score DECIMAL(15, 2) := -1;
  candidate RECORD;
  tier_expansion JSONB;
  candidates_tried INTEGER := 0;
  max_candidates INTEGER := 20;
  wait_seconds INTEGER;
BEGIN
  -- Get user's queue entry with SKIP LOCKED
  SELECT * INTO user_queue
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status IN ('spin_active', 'queue_waiting')
  FOR UPDATE SKIP LOCKED;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Calculate wait time
  wait_seconds := EXTRACT(EPOCH FROM (NOW() - user_queue.joined_at))::INTEGER;
  
  -- Get user profile and preferences
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = p_user_id;
  
  IF NOT FOUND OR user_prefs IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine expansion level based on tier
  tier_expansion := get_tier_expansion(p_tier, user_prefs);
  
  -- Find best match using priority queue with SKIP LOCKED
  FOR candidate IN
    SELECT 
      mq.*,
      p.*,
      up.*,
      -- Calculate priority score
      (
        (COALESCE(mq.fairness_score, 0) * 1000) +
        (EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER * 10) +
        (COALESCE(calculate_preference_match_score(p_user_id, mq.user_id), 0) * 100) +
        (COALESCE(calculate_distance_score(user_profile, p), 0) * 10)
      ) AS priority_score
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      -- Tier-based filtering (Tier 3 now checks wait_seconds >= 5 instead of 10)
      AND (
        (p_tier = 1 AND p.is_online = TRUE AND check_exact_preferences(p_user_id, mq.user_id))
        OR
        (p_tier = 2 AND p.is_online = TRUE AND check_expanded_preferences(p_user_id, mq.user_id, tier_expansion))
        OR
        (p_tier = 3 AND (
          -- Tier 3: Check if user OR candidate has waited 5+ seconds (reduced from 10)
          (wait_seconds >= 5 OR EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER >= 5)
          AND check_guaranteed_match(p_user_id, mq.user_id)
        ))
      )
      -- Gender compatibility (strict) - This is already enforced, but validate_match_rules will double-check
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND user_prefs.gender_preference = 'female')
      )
      -- Exclude blocked users
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY priority_score DESC
    FOR UPDATE SKIP LOCKED
    LIMIT max_candidates
  LOOP
    candidates_tried := candidates_tried + 1;
    
    IF candidate.status IN ('spin_active', 'queue_waiting') THEN
      -- CRITICAL: Validate rules before considering this candidate
      IF validate_match_rules(p_user_id, candidate.user_id, p_tier) THEN
        IF candidate.priority_score > best_priority_score THEN
          best_priority_score := candidate.priority_score;
          best_match_id := candidate.user_id;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN best_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.find_best_match_v2 IS 'Finds best match with rule validation. Updated to use validate_match_rules for each candidate.';

