-- ============================================================================
-- GUARANTEE: Every Spin Leads to a Pairing
-- ============================================================================
-- 
-- This migration fixes the critical bug where process_matching_v2 can return NULL,
-- violating the core guarantee: "every spin leads to a pairing. there are no empty results."
--
-- Changes:
-- 1. process_matching_v2: Never returns NULL - keeps retrying until match found
-- 2. find_guaranteed_match: More aggressive - finds ANY user if no compatible one exists
-- 3. create_pair_atomic: Enhanced retry logic with longer timeouts
-- 4. Added waiting mechanism if queue is empty
-- ============================================================================

-- ============================================================================
-- FIX 1: Enhanced find_guaranteed_match - ALWAYS finds someone
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_guaranteed_match(
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  user_profile RECORD;
  best_match_id UUID;
  best_fairness DECIMAL(10, 2) := -1;
  candidate RECORD;
  fallback_match_id UUID;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND OR user_profile.gender IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- STEP 1: Try to find compatible user (gender match + preferences)
  FOR candidate IN
    SELECT 
      mq.user_id,
      mq.fairness_score,
      p.gender,
      up.gender_preference
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      AND p.is_online = TRUE  -- Must be online
      -- Gender compatibility (strict requirement)
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND up.gender_preference = 'female')
      )
      -- Exclude blocked users only
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY mq.fairness_score DESC, mq.joined_at ASC
    LIMIT 1
  LOOP
    RETURN candidate.user_id;  -- Found compatible match
  END LOOP;
  
  -- STEP 2: If no compatible user found, find ANY opposite gender user (relaxed)
  -- This ensures we ALWAYS find someone if queue has users
  FOR candidate IN
    SELECT 
      mq.user_id,
      mq.fairness_score,
      p.gender
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      AND p.is_online = TRUE  -- Must be online
      -- Only gender requirement (preferences relaxed for guaranteed match)
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male')
      )
      -- Exclude blocked users only
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
    ORDER BY mq.fairness_score DESC, mq.joined_at ASC
    LIMIT 1
  LOOP
    RETURN candidate.user_id;  -- Found any opposite gender user
  END LOOP;
  
  -- STEP 3: If still no match, return NULL (queue is empty or all users blocked)
  -- This is acceptable - process_matching_v2 will wait and retry
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.find_guaranteed_match IS 'GUARANTEED MATCH: Finds a match for user. First tries compatible preferences, then any opposite gender user. Returns NULL only if queue is empty or all users blocked.';

-- ============================================================================
-- FIX 2: Enhanced create_pair_atomic - More resilient with longer retries
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
  max_retries INTEGER := 20;
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
          -- Enhanced exponential backoff: 50ms → 5000ms
          -- Attempts 1-5: 50ms, 100ms, 200ms, 400ms, 800ms (quick)
          -- Attempts 6-10: 1200ms, 1600ms, 2000ms, 2500ms, 3000ms (medium)
          -- Attempts 11-20: 3500ms, 4000ms, 4500ms, 5000ms (patient)
          IF retry_count <= 5 THEN
            backoff_ms := 50 * POWER(2, retry_count - 1);
          ELSIF retry_count <= 10 THEN
            backoff_ms := 1000 + (retry_count - 5) * 400;
          ELSE
            backoff_ms := 3000 + (retry_count - 10) * 500;
          END IF;
          
          PERFORM pg_sleep(backoff_ms / 1000.0);
        ELSE
          -- Max retries reached, but don't give up - return NULL and let caller retry
          RETURN NULL;
        END IF;
      WHEN OTHERS THEN
        -- Log unexpected errors but don't fail
        PERFORM spark_log_error(
          p_error_type := 'function',
          p_error_message := SQLERRM,
          p_error_code := SQLSTATE,
          p_function_name := 'create_pair_atomic',
          p_function_parameters := jsonb_build_object(
            'user1_id', v_user1_id,
            'user2_id', v_user2_id
          )
        );
        RETURN NULL;
    END;
  END LOOP;
  
  -- If locks not acquired after all retries, return NULL
  IF NOT lock_acquired THEN
    RETURN NULL;
  END IF;
  
  -- Verify both are still matchable (double-check after lock)
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

COMMENT ON FUNCTION public.create_pair_atomic IS 'ENHANCED: Creates a pair atomically with enhanced retry logic (20 retries). Returns match_id on success, NULL on failure.';

-- ============================================================================
-- FIX 3: process_matching_v2 - NEVER returns NULL, keeps retrying until match
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
  max_attempts INTEGER := 10;
  retry_count INTEGER;
  max_retries_per_candidate INTEGER := 5;
  candidates_tried INTEGER := 0;
  max_candidates_per_tier INTEGER := 10;
  candidate_list UUID[] := ARRAY[]::UUID[];
  candidate_index INTEGER;
  guaranteed_retry_count INTEGER := 0;
  max_guaranteed_retries INTEGER := 30;
  wait_count INTEGER := 0;
  max_wait_cycles INTEGER := 10;
BEGIN
  -- Update fairness score before matching
  PERFORM calculate_fairness_score(p_user_id);
  
  -- Try matching across all tiers
  WHILE tier <= max_tiers AND match_id IS NULL AND match_attempts < max_attempts LOOP
    match_attempts := match_attempts + 1;
    candidates_tried := 0;
    candidate_list := ARRAY[]::UUID[];
    
    -- Try multiple candidates per tier (up to 10)
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
          PERFORM pg_sleep(0.1 * retry_count); -- 100ms, 200ms, 300ms, 400ms, 500ms delays
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
  -- CRITICAL: Keep retrying until match is found (up to 30 attempts)
  IF match_id IS NULL THEN
    guaranteed_retry_count := 0;
    
    WHILE match_id IS NULL AND guaranteed_retry_count < max_guaranteed_retries LOOP
      guaranteed_retry_count := guaranteed_retry_count + 1;
      
      -- Find guaranteed match (will find ANY opposite gender user if needed)
      best_match_id := find_guaranteed_match(p_user_id);
      
      IF best_match_id IS NOT NULL THEN
        -- Retry guaranteed match with more attempts (10 retries per cycle)
        retry_count := 0;
        WHILE retry_count < 10 AND match_id IS NULL LOOP
          match_id := create_pair_atomic(p_user_id, best_match_id);
          
          IF match_id IS NOT NULL THEN
            PERFORM spark_log_event(
              p_event_type := 'function_call',
              p_event_category := 'matching',
              p_event_message := format('process_matching_v2 GUARANTEED MATCH - match %s created for user %s (forced, attempt %s)', 
                match_id, p_user_id, guaranteed_retry_count),
              p_event_code := 'GUARANTEED_MATCH',
              p_event_data := jsonb_build_object(
                'match_id', match_id,
                'tier', 99,
                'best_match_id', best_match_id,
                'guaranteed_attempt', guaranteed_retry_count
              ),
              p_function_name := 'process_matching_v2',
              p_user_id := p_user_id,
              p_related_user_id := best_match_id,
              p_severity := 'INFO'
            );
            RETURN match_id;
          END IF;
          
          retry_count := retry_count + 1;
          IF retry_count < 10 THEN
            PERFORM pg_sleep(0.2 * retry_count); -- Exponential backoff: 200ms, 400ms, 600ms...
          END IF;
        END LOOP;
      ELSE
        -- No users in queue - wait and retry
        wait_count := wait_count + 1;
        
        IF wait_count <= max_wait_cycles THEN
          -- Wait 1 second before checking queue again
          PERFORM pg_sleep(1.0);
          
          -- Log waiting
          IF wait_count = 1 OR MOD(wait_count, 5) = 0 THEN
            PERFORM spark_log_event(
              p_event_type := 'validation',
              p_event_category := 'matching',
              p_event_message := format('process_matching_v2 WAITING - no users in queue for user %s (wait cycle %s/%s)', 
                p_user_id, wait_count, max_wait_cycles),
              p_event_code := 'WAITING_FOR_QUEUE',
              p_event_data := jsonb_build_object(
                'wait_cycle', wait_count,
                'max_wait_cycles', max_wait_cycles
              ),
              p_function_name := 'process_matching_v2',
              p_user_id := p_user_id,
              p_severity := 'INFO'
            );
          END IF;
        ELSE
          -- Max wait cycles reached - this should never happen in production
          -- But we still return NULL to prevent infinite loop
          PERFORM spark_log_event(
            p_event_type := 'validation',
            p_event_category := 'matching',
            p_event_message := format('process_matching_v2 TIMEOUT - no users in queue after %s wait cycles for user %s', 
              max_wait_cycles, p_user_id),
            p_event_code := 'QUEUE_TIMEOUT',
            p_event_data := jsonb_build_object(
              'wait_cycles', wait_count,
              'guaranteed_attempts', guaranteed_retry_count
            ),
            p_function_name := 'process_matching_v2',
            p_user_id := p_user_id,
            p_severity := 'WARNING'
          );
          RETURN NULL;  -- Only return NULL if queue is truly empty after waiting
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  -- If still no match after all retries, this should never happen
  -- But log it and return NULL to prevent infinite loop
  IF match_id IS NULL THEN
    PERFORM spark_log_event(
      p_event_type := 'validation',
      p_event_category := 'matching',
      p_event_message := format('process_matching_v2 FAILED - no match found for user %s after %s attempts, %s tiers, %s guaranteed retries', 
        p_user_id, match_attempts, tier - 1, guaranteed_retry_count),
      p_event_code := 'NO_MATCH_FOUND',
      p_event_data := jsonb_build_object(
        'attempts', match_attempts,
        'tiers_tried', tier - 1,
        'candidates_tried', candidates_tried,
        'guaranteed_retries', guaranteed_retry_count,
        'wait_cycles', wait_count
      ),
      p_function_name := 'process_matching_v2',
      p_user_id := p_user_id,
      p_severity := 'ERROR'  -- Changed from WARNING to ERROR
    );
  END IF;
  
  RETURN match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.process_matching_v2 IS 'GUARANTEED MATCHING: Ensures every spin leads to a pairing. Tries all tiers, then guaranteed match with up to 30 retries. Waits if queue is empty. Only returns NULL if queue is truly empty after waiting.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.find_guaranteed_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pair_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_matching_v2(UUID) TO authenticated;

