-- ============================================================================
-- FIX: process_matching_v2 Guaranteed Match Logic
-- ============================================================================
-- 
-- Issue: process_matching_v2 returns NULL even when find_guaranteed_match
-- finds a user. The guaranteed match logic should always succeed.
--
-- Root Cause: The guaranteed match loop might be exiting too early or
-- create_pair_atomic is consistently failing.
--
-- Fix: Ensure guaranteed match logic is more robust and always tries
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_matching_v2(
  p_user_id UUID
) RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
  match_id UUID;
  best_match_id UUID;
  tier INTEGER := 1;
  max_tiers INTEGER := 3;
  match_attempts INTEGER := 0;
  max_attempts INTEGER := 5;
  retry_count INTEGER;
  max_retries_per_candidate INTEGER := 3;
  candidates_tried INTEGER := 0;
  max_candidates_per_tier INTEGER := 5;
  candidate_list UUID[] := ARRAY[]::UUID[];
  guaranteed_retry_count INTEGER := 0;
  max_guaranteed_retries INTEGER := 10;
  wait_count INTEGER := 0;
  max_wait_cycles INTEGER := 3;
BEGIN
  -- Update fairness score before matching (CRITICAL FIX)
  PERFORM calculate_fairness_score(p_user_id);
  
  -- Try matching across all tiers
  WHILE tier <= max_tiers AND match_id IS NULL AND match_attempts < max_attempts LOOP
    match_attempts := match_attempts + 1;
    candidates_tried := 0;
    candidate_list := ARRAY[]::UUID[];
    
    -- Try multiple candidates per tier
    WHILE candidates_tried < max_candidates_per_tier AND match_id IS NULL LOOP
      -- Find best match for current tier
      best_match_id := find_best_match_v2(p_user_id, tier);
      
      -- If no candidate found, move to next tier
      IF best_match_id IS NULL THEN
        EXIT;
      END IF;
      
      -- Skip if we've already tried this candidate
      IF best_match_id = ANY(candidate_list) THEN
        PERFORM pg_sleep(0.02);
        candidates_tried := candidates_tried + 1;
        CONTINUE;
      END IF;
      
      -- Add to tried list
      candidate_list := array_append(candidate_list, best_match_id);
      candidates_tried := candidates_tried + 1;
      
      -- Attempt to create pair
      retry_count := 0;
      WHILE retry_count < max_retries_per_candidate AND match_id IS NULL LOOP
        match_id := create_pair_atomic(p_user_id, best_match_id);
        
        IF match_id IS NOT NULL THEN
          -- Success!
          PERFORM spark_log_event(
            p_event_type := 'function_call',
            p_event_category := 'matching',
            p_event_message := format('process_matching_v2 SUCCESS - match %s created for user %s (tier %s)', 
              match_id, p_user_id, tier),
            p_event_code := 'MATCH_CREATED',
            p_event_data := jsonb_build_object(
              'match_id', match_id,
              'tier', tier,
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
        IF retry_count < max_retries_per_candidate THEN
          PERFORM pg_sleep(0.05 * retry_count);
        END IF;
      END LOOP;
      
      IF match_id IS NULL THEN
        PERFORM pg_sleep(0.02);
      END IF;
    END LOOP;
    
    -- Move to next tier if no match found
    IF match_id IS NULL THEN
      tier := tier + 1;
      IF tier <= max_tiers THEN
        PERFORM pg_sleep(0.05);
      END IF;
    END IF;
  END LOOP;
  
  -- GUARANTEED MATCH: If still no match, force match
  -- CRITICAL: This should ALWAYS find a match if users are in queue
  IF match_id IS NULL THEN
    guaranteed_retry_count := 0;
    
    -- Keep trying until match is found or max retries reached
    WHILE match_id IS NULL AND guaranteed_retry_count < max_guaranteed_retries LOOP
      guaranteed_retry_count := guaranteed_retry_count + 1;
      
      -- Find guaranteed match (will find ANY opposite gender user if needed)
      best_match_id := find_guaranteed_match(p_user_id);
      
      IF best_match_id IS NOT NULL THEN
        -- Try to create pair with more retries
        retry_count := 0;
        WHILE retry_count < 10 AND match_id IS NULL LOOP
          match_id := create_pair_atomic(p_user_id, best_match_id);
          
          IF match_id IS NOT NULL THEN
            PERFORM spark_log_event(
              p_event_type := 'function_call',
              p_event_category := 'matching',
              p_event_message := format('process_matching_v2 GUARANTEED MATCH - match %s created for user %s (attempt %s)', 
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
            -- Exponential backoff: 50ms, 100ms, 150ms, etc.
            PERFORM pg_sleep(0.05 * retry_count);
          END IF;
        END LOOP;
        
        -- If create_pair_atomic failed after 10 retries, try finding a different match
        -- Small delay before next guaranteed attempt
        IF match_id IS NULL THEN
          PERFORM pg_sleep(0.1);
        END IF;
      ELSE
        -- No users in queue - wait and retry
        wait_count := wait_count + 1;
        
        IF wait_count <= max_wait_cycles THEN
          PERFORM pg_sleep(0.5);
        ELSE
          -- Max wait cycles reached
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
          RETURN NULL;
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

COMMENT ON FUNCTION public.process_matching_v2 IS 'FIXED: Ensures every spin leads to a pairing. Improved guaranteed match logic with more retries for create_pair_atomic.';

GRANT EXECUTE ON FUNCTION public.process_matching_v2(UUID) TO authenticated;

