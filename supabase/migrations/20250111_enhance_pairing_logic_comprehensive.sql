-- Comprehensive Enhancement to Pairing/Matching Logic
-- Focus: Handle extreme concurrency (500+ simultaneous users) and all edge cases

-- ============================================================================
-- 1. ENHANCED create_pair_atomic - More retries, better error handling
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
  max_retries INTEGER := 5; -- Increased from 3 to 5 for extreme concurrency
  v_user1_id UUID;
  v_user2_id UUID;
  lock_acquired BOOLEAN := FALSE;
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
      -- Try to lock both users in a single query (more efficient and atomic)
      SELECT 
        MAX(CASE WHEN user_id = v_user1_id THEN status END) AS user1_status,
        MAX(CASE WHEN user_id = v_user2_id THEN status END) AS user2_status
      INTO user1_status, user2_status
      FROM matching_queue
      WHERE user_id IN (v_user1_id, v_user2_id)
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
          -- Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms
          PERFORM pg_sleep(0.05 * POWER(2, retry_count - 1));
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

-- ============================================================================
-- 2. ENHANCED find_best_match_v2 - Use SKIP LOCKED for candidates
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
  priority_score DECIMAL(15, 2);
  tier_expansion JSONB;
  candidates_tried INTEGER := 0;
  max_candidates INTEGER := 20; -- Increased from 10 to 20 for better matching
BEGIN
  -- Get user's queue entry with SKIP LOCKED to avoid blocking
  SELECT * INTO user_queue
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status IN ('spin_active', 'queue_waiting')
  FOR UPDATE SKIP LOCKED; -- Skip if locked by another process
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user profile and preferences
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = p_user_id;
  
  IF NOT FOUND OR user_prefs IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine expansion level based on tier
  tier_expansion := get_tier_expansion(p_tier, user_prefs);
  
  -- Find best match using priority queue with SKIP LOCKED for candidates
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
      -- Tier-based filtering
      AND (
        (p_tier = 1 AND p.is_online = TRUE AND check_exact_preferences(p_user_id, mq.user_id))
        OR
        (p_tier = 2 AND p.is_online = TRUE AND check_expanded_preferences(p_user_id, mq.user_id, tier_expansion))
        OR
        (p_tier = 3 AND check_guaranteed_match(p_user_id, mq.user_id))
      )
      -- Gender compatibility (strict)
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND up.gender_preference = 'female')
      )
      -- Exclude blocked users
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY priority_score DESC
    FOR UPDATE SKIP LOCKED -- Skip candidates that are locked by other processes
    LIMIT max_candidates -- Consider top 20 candidates
  LOOP
    candidates_tried := candidates_tried + 1;
    
    -- Verify candidate is still available
    IF candidate.status IN ('spin_active', 'queue_waiting') THEN
      IF candidate.priority_score > best_priority_score THEN
        best_priority_score := candidate.priority_score;
        best_match_id := candidate.user_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN best_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. ENHANCED process_matching_v2 - More retries, candidate fallback, better guaranteed match
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_matching_v2(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  match_id UUID;
  best_match_id UUID;
  tier INTEGER := 1;
  max_tiers INTEGER := 3;
  match_attempts INTEGER := 0;
  max_attempts INTEGER := 5;
  retry_count INTEGER;
  max_retries_per_candidate INTEGER := 3; -- Retry same candidate 3 times
  candidates_tried INTEGER := 0;
  max_candidates_per_tier INTEGER := 5; -- Try up to 5 candidates per tier
  candidate_list UUID[] := ARRAY[]::UUID[];
  candidate_index INTEGER;
BEGIN
  -- Update fairness score before matching
  PERFORM calculate_fairness_score(p_user_id);
  
  -- Try matching across all tiers
  WHILE tier <= max_tiers AND match_id IS NULL AND match_attempts < max_attempts LOOP
    match_attempts := match_attempts + 1;
    candidates_tried := 0;
    candidate_list := ARRAY[]::UUID[];
    
    -- Try multiple candidates per tier (up to 5)
    WHILE candidates_tried < max_candidates_per_tier AND match_id IS NULL LOOP
      -- Find best match for current tier
      best_match_id := find_best_match_v2(p_user_id, tier);
      
      -- If no candidate found, move to next tier
      IF best_match_id IS NULL THEN
        EXIT;
      END IF;
      
      -- Skip if we've already tried this candidate
      IF best_match_id = ANY(candidate_list) THEN
        -- Small delay before trying next candidate
        PERFORM pg_sleep(0.05);
        candidates_tried := candidates_tried + 1;
        CONTINUE;
      END IF;
      
      -- Add to tried list
      candidate_list := array_append(candidate_list, best_match_id);
      candidates_tried := candidates_tried + 1;
      
      -- Attempt to create pair with enhanced retry logic
      retry_count := 0;
      WHILE retry_count < max_retries_per_candidate AND match_id IS NULL LOOP
        match_id := create_pair_atomic(p_user_id, best_match_id);
        
        IF match_id IS NOT NULL THEN
          -- Success! Log tier used via SPARK
          PERFORM spark_log_event(
            p_event_type := 'function_call',
            p_event_category := 'matching',
            p_event_message := format('process_matching_v2 SUCCESS - match %s created for user %s (tier %s, candidate %s/%s)', 
              match_id, p_user_id, tier, candidates_tried, max_candidates_per_tier),
            p_event_code := 'MATCH_CREATED',
            p_event_data := jsonb_build_object(
              'match_id', match_id,
              'tier', tier,
              'best_match_id', best_match_id,
              'candidates_tried', candidates_tried
            ),
            p_function_name := 'process_matching_v2',
            p_user_id := p_user_id,
            p_related_user_id := best_match_id,
            p_severity := 'INFO'
          );
          RETURN match_id;
        END IF;
        
        -- If lock conflict, retry with exponential backoff
        retry_count := retry_count + 1;
        IF retry_count < max_retries_per_candidate THEN
          PERFORM pg_sleep(0.1 * retry_count); -- 100ms, 200ms, 300ms delays
        END IF;
      END LOOP;
      
      -- Small delay before trying next candidate
      IF match_id IS NULL THEN
        PERFORM pg_sleep(0.05);
      END IF;
    END LOOP;
    
    -- Move to next tier if no match found
    IF match_id IS NULL THEN
      tier := tier + 1;
      
      -- Small delay between tiers to allow queue to update
      IF tier <= max_tiers THEN
        PERFORM pg_sleep(0.1); -- 100ms delay
      END IF;
    END IF;
  END LOOP;
  
  -- GUARANTEED MATCH: If still no match, force match with highest fairness user
  IF match_id IS NULL THEN
    best_match_id := find_guaranteed_match(p_user_id);
    
    IF best_match_id IS NOT NULL THEN
      -- Retry guaranteed match with more attempts (5 retries)
      retry_count := 0;
      WHILE retry_count < 5 AND match_id IS NULL LOOP
        match_id := create_pair_atomic(p_user_id, best_match_id);
        
        IF match_id IS NOT NULL THEN
          PERFORM spark_log_event(
            p_event_type := 'function_call',
            p_event_category := 'matching',
            p_event_message := format('process_matching_v2 GUARANTEED MATCH - match %s created for user %s (forced)', 
              match_id, p_user_id),
            p_event_code := 'GUARANTEED_MATCH',
            p_event_data := jsonb_build_object(
              'match_id', match_id,
              'tier', 99,
              'best_match_id', best_match_id
            ),
            p_function_name := 'process_matching_v2',
            p_user_id := p_user_id,
            p_related_user_id := best_match_id,
            p_severity := 'INFO'
          );
          RETURN match_id;
        END IF;
        
        retry_count := retry_count + 1;
        IF retry_count < 5 THEN
          PERFORM pg_sleep(0.1 * retry_count); -- Exponential backoff
        END IF;
      END LOOP;
    END IF;
  END IF;
  
  -- If still no match, log warning
  IF match_id IS NULL THEN
    PERFORM spark_log_event(
      p_event_type := 'validation',
      p_event_category := 'matching',
      p_event_message := format('process_matching_v2 FAILED - no match found for user %s after %s attempts, %s tiers', 
        p_user_id, match_attempts, tier - 1),
      p_event_code := 'NO_MATCH_FOUND',
      p_event_data := jsonb_build_object(
        'attempts', match_attempts,
        'tiers_tried', tier - 1,
        'candidates_tried', candidates_tried
      ),
      p_function_name := 'process_matching_v2',
      p_user_id := p_user_id,
      p_severity := 'WARNING'
    );
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_pair_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_best_match_v2(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_matching_v2(UUID) TO authenticated;

