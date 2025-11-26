-- ============================================================================
-- Blueprint Migration 802: Matching Orchestrator
-- ============================================================================
-- Part 8.2: THE ONLY FUNCTION THAT ORCHESTRATES MATCHING
-- ============================================================================

-- THE ONLY FUNCTION THAT ORCHESTRATES MATCHING
CREATE OR REPLACE FUNCTION matching_orchestrator()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '30s'
AS $$
DECLARE
  lock_acquired BOOLEAN;
  user_id UUID;
  tier1_users UUID[];
  tier2_users UUID[];
  tier3_users UUID[];
  processed_count INTEGER := 0;
BEGIN
  -- 1. Acquire global lock
  SELECT acquire_matching_lock() INTO lock_acquired;
  IF NOT lock_acquired THEN
    RETURN jsonb_build_object('status', 'locked', 'message', 'Another matching process is running');
  END IF;
  
  BEGIN
    -- 2. Get users in batches (limit to batch_size per tier to prevent overload)
    -- Tier assignment considers BOTH fairness AND wait time
    -- Tier 1: High fairness (exact preferences only) OR long wait time (>= 2 minutes)
    SELECT ARRAY_AGG(user_id) INTO tier1_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND (
          fairness_score >= 200  -- High fairness
          OR
          EXTRACT(EPOCH FROM (NOW() - joined_at)) >= 120  -- OR waiting >= 2 minutes
        )
      ORDER BY 
        -- Prioritize: high fairness first, then long wait times
        CASE WHEN fairness_score >= 200 THEN fairness_score ELSE 0 END DESC,
        EXTRACT(EPOCH FROM (NOW() - joined_at)) DESC,
        joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t1;
    
    -- Tier 2: Medium fairness (expanded preferences) AND wait time < 2 minutes
    SELECT ARRAY_AGG(user_id) INTO tier2_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND fairness_score >= 50 AND fairness_score < 200
        AND EXTRACT(EPOCH FROM (NOW() - joined_at)) < 120  -- Wait time < 2 minutes
      ORDER BY fairness_score DESC, joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t2;
    
    -- Tier 3: Low fairness (guaranteed match) AND wait time < 2 minutes
    SELECT ARRAY_AGG(user_id) INTO tier3_users
    FROM (
      SELECT user_id
      FROM matching_queue
      WHERE status IN ('queue_waiting', 'spin_active')
        AND user_id IN (SELECT id FROM profiles WHERE is_online = TRUE)
        AND fairness_score < 50
        AND EXTRACT(EPOCH FROM (NOW() - joined_at)) < 120  -- Wait time < 2 minutes
      ORDER BY fairness_score DESC, joined_at ASC
      LIMIT 20  -- Process max 20 users per tier per run
    ) t3;
    
    -- 3. Process Tier 1 users (high fairness, exact preferences)
    IF tier1_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier1_users
      LOOP
        -- unified_matching_engine will try Tier 1 first
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 4. Process Tier 2 users (medium fairness, expanded preferences)
    IF tier2_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier2_users
      LOOP
        -- unified_matching_engine will try Tier 1, then Tier 2
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 5. Process Tier 3 users (low fairness, guaranteed match)
    IF tier3_users IS NOT NULL THEN
      FOREACH user_id IN ARRAY tier3_users
      LOOP
        -- unified_matching_engine will try all tiers, then guaranteed
        PERFORM unified_matching_engine(user_id);
        PERFORM pg_sleep(0.01);
        processed_count := processed_count + 1;
      END LOOP;
    END IF;
    
    -- 6. Release lock
    PERFORM release_matching_lock();
    
    RETURN jsonb_build_object(
      'status', 'success',
      'tier1_processed', COALESCE(array_length(tier1_users, 1), 0),
      'tier2_processed', COALESCE(array_length(tier2_users, 1), 0),
      'tier3_processed', COALESCE(array_length(tier3_users, 1), 0),
      'total_processed', processed_count
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM release_matching_lock();
      RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION matching_orchestrator IS 'THE ONLY FUNCTION THAT ORCHESTRATES MATCHING - Processes users by tier with global lock';

