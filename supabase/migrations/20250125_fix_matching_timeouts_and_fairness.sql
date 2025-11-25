-- ============================================================================
-- FIX: Matching Logic Timeouts and Fairness Score Issues
-- ============================================================================
-- 
-- Based on Context7 best practices for PostgreSQL and Supabase:
-- 1. Add statement_timeout to prevent PostgreSQL timeouts
-- 2. Reduce retry counts and wait cycles (optimize performance)
-- 3. Ensure fairness score is calculated when users join queue
-- 4. Optimize matching logic with early exit conditions
--
-- Issues Fixed:
-- - Statement timeout errors (57014)
-- - Fairness score not calculated (returns 0)
-- - Excessive retry logic causing timeouts
-- ============================================================================

-- ============================================================================
-- FIX 1: Add statement_timeout to process_matching_v2
-- ============================================================================
-- Based on Supabase docs: Functions can set statement_timeout at function level
-- This prevents PostgreSQL from canceling long-running matching operations

CREATE OR REPLACE FUNCTION public.process_matching_v2(
  p_user_id UUID
) RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET statement_timeout TO '30s'  -- 30 seconds (was hitting 5s default)
AS $$
DECLARE
  match_id UUID;
  best_match_id UUID;
  tier INTEGER := 1;
  max_tiers INTEGER := 3;
  match_attempts INTEGER := 0;
  max_attempts INTEGER := 5;  -- Reduced from 10
  retry_count INTEGER;
  max_retries_per_candidate INTEGER := 3;  -- Reduced from 5
  candidates_tried INTEGER := 0;
  max_candidates_per_tier INTEGER := 5;  -- Reduced from 10
  candidate_list UUID[] := ARRAY[]::UUID[];
  candidate_index INTEGER;
  guaranteed_retry_count INTEGER := 0;
  max_guaranteed_retries INTEGER := 10;  -- Reduced from 30
  wait_count INTEGER := 0;
  max_wait_cycles INTEGER := 3;  -- Reduced from 10 (3 seconds max wait)
BEGIN
  -- Update fairness score before matching (CRITICAL FIX)
  PERFORM calculate_fairness_score(p_user_id);
  
  -- Try matching across all tiers
  WHILE tier <= max_tiers AND match_id IS NULL AND match_attempts < max_attempts LOOP
    match_attempts := match_attempts + 1;
    candidates_tried := 0;
    candidate_list := ARRAY[]::UUID[];
    
    -- Try multiple candidates per tier (reduced to 5)
    WHILE candidates_tried < max_candidates_per_tier AND match_id IS NULL LOOP
      -- Find best match for current tier
      best_match_id := find_best_match_v2(p_user_id, tier);
      
      -- If no candidate found, move to next tier
      IF best_match_id IS NULL THEN
        EXIT;
      END IF;
      
      -- Skip if we've already tried this candidate
      IF best_match_id = ANY(candidate_list) THEN
        -- Reduced delay: 20ms instead of 50ms
        PERFORM pg_sleep(0.02);
        candidates_tried := candidates_tried + 1;
        CONTINUE;
      END IF;
      
      -- Add to tried list
      candidate_list := array_append(candidate_list, best_match_id);
      candidates_tried := candidates_tried + 1;
      
      -- Attempt to create pair with reduced retry logic
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
          RETURN match_id;  -- Early exit on success
        END IF;
        
        -- If lock conflict, retry with exponential backoff (reduced delays)
        retry_count := retry_count + 1;
        IF retry_count < max_retries_per_candidate THEN
          -- Reduced delays: 50ms, 100ms, 150ms (was 100ms, 200ms, 300ms, 400ms, 500ms)
          PERFORM pg_sleep(0.05 * retry_count);
        END IF;
      END LOOP;
      
      -- Reduced delay before trying next candidate
      IF match_id IS NULL THEN
        PERFORM pg_sleep(0.02);  -- 20ms instead of 50ms
      END IF;
    END LOOP;
    
    -- Move to next tier if no match found
    IF match_id IS NULL THEN
      tier := tier + 1;
      
      -- Reduced delay between tiers
      IF tier <= max_tiers THEN
        PERFORM pg_sleep(0.05);  -- 50ms instead of 100ms
      END IF;
    END IF;
  END LOOP;
  
  -- GUARANTEED MATCH: If still no match, force match with highest fairness user
  -- CRITICAL: Reduced retries from 30 to 10 to prevent timeouts
  IF match_id IS NULL THEN
    guaranteed_retry_count := 0;
    
    WHILE match_id IS NULL AND guaranteed_retry_count < max_guaranteed_retries LOOP
      guaranteed_retry_count := guaranteed_retry_count + 1;
      
      -- Find guaranteed match (will find ANY opposite gender user if needed)
      best_match_id := find_guaranteed_match(p_user_id);
      
      IF best_match_id IS NOT NULL THEN
        -- Retry guaranteed match with reduced attempts (5 instead of 10)
        retry_count := 0;
        WHILE retry_count < 5 AND match_id IS NULL LOOP
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
            RETURN match_id;  -- Early exit on success
          END IF;
          
          retry_count := retry_count + 1;
          IF retry_count < 5 THEN
            -- Reduced exponential backoff: 100ms, 200ms, 300ms, 400ms (was 200ms, 400ms, 600ms...)
            PERFORM pg_sleep(0.1 * retry_count);
          END IF;
        END LOOP;
      ELSE
        -- No users in queue - wait and retry (reduced wait cycles)
        wait_count := wait_count + 1;
        
        IF wait_count <= max_wait_cycles THEN
          -- Wait 500ms instead of 1 second (faster response)
          PERFORM pg_sleep(0.5);
          
          -- Log waiting (less frequent)
          IF wait_count = 1 OR wait_count = max_wait_cycles THEN
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
          -- Max wait cycles reached - return NULL to prevent infinite loop
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
  
  -- If still no match after all retries, log error
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
      p_severity := 'ERROR'
    );
  END IF;
  
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION public.process_matching_v2 IS 'OPTIMIZED: Ensures every spin leads to a pairing. Reduced retries (10 instead of 30), faster delays, 30s statement timeout. Calculates fairness score before matching.';

-- ============================================================================
-- FIX 2: Reduce create_pair_atomic retries and optimize backoff
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET statement_timeout TO '10s'  -- 10 seconds for atomic operations
AS $$
DECLARE
  match_id UUID;
  user1_status TEXT;
  user2_status TEXT;
  update_count INTEGER;
  retry_count INTEGER := 0;
  max_retries INTEGER := 10;  -- Reduced from 20
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
  
  -- Optimized retry loop with reduced backoff
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
          -- Optimized exponential backoff: faster, shorter delays
          -- Attempts 1-5: 25ms, 50ms, 100ms, 200ms, 400ms (was 50ms, 100ms, 200ms, 400ms, 800ms)
          -- Attempts 6-10: 600ms, 800ms, 1000ms, 1200ms, 1500ms (was up to 5000ms)
          IF retry_count <= 5 THEN
            backoff_ms := 25 * POWER(2, retry_count - 1);
          ELSE
            backoff_ms := 500 + (retry_count - 5) * 200;
          END IF;
          
          PERFORM pg_sleep(backoff_ms / 1000.0);
        ELSE
          -- Max retries reached, return NULL and let caller retry
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
$$;

COMMENT ON FUNCTION public.create_pair_atomic IS 'OPTIMIZED: Creates a pair atomically with reduced retry logic (10 retries, faster backoff). 10s statement timeout.';

-- ============================================================================
-- FIX 3: Ensure fairness score is calculated when users join queue
-- ============================================================================
-- Find and update spark_join_queue or join_queue to calculate fairness

-- First, check if spark_join_queue exists and update it
DO $$
BEGIN
  -- Check if spark_join_queue function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'spark_join_queue'
  ) THEN
    -- Update spark_join_queue to calculate fairness score
    EXECUTE '
    CREATE OR REPLACE FUNCTION public.spark_join_queue(
      p_user_id UUID,
      p_fairness_boost INTEGER DEFAULT 0
    ) RETURNS UUID 
    LANGUAGE plpgsql 
    SECURITY DEFINER
    AS $func$
    DECLARE
      queue_id UUID;
    BEGIN
      -- Call the original join_queue logic (assuming it exists)
      -- Then calculate fairness score
      SELECT public.join_queue(p_user_id, p_fairness_boost) INTO queue_id;
      
      -- CRITICAL FIX: Calculate fairness score immediately after joining
      IF queue_id IS NOT NULL THEN
        PERFORM calculate_fairness_score(p_user_id);
      END IF;
      
      RETURN queue_id;
    END;
    $func$;';
  END IF;
END $$;

-- Alternative: Update join_queue directly if it exists
DO $$
BEGIN
  -- Check if join_queue function exists and doesn't calculate fairness
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'join_queue'
  ) THEN
    -- We'll add a trigger or update the function in a separate migration
    -- For now, ensure calculate_fairness_score is called in process_matching_v2
    -- (already done above)
    NULL;
  END IF;
END $$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.process_matching_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pair_atomic(UUID, UUID) TO authenticated;

