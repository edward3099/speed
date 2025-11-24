-- ============================================================================
-- Comprehensive Queue Management System for 10/10 Performance
-- ============================================================================
-- 
-- This migration implements a complete queue management system:
-- 1. Rule Enforcement Layer (validate_match_rules) - CRITICAL
-- 2. Queue Validator (validate_queue_integrity) - Auto-fix issues
-- 3. Queue Optimizer (optimize_queue_order) - Optimize fairness & order
-- 4. Queue Health Monitor (monitor_queue_health) - Real-time monitoring
-- 5. Queue Balancer (balance_queue_gender) - Gender balance management
-- 6. Queue Cleanup (cleanup_stale_queue_entries) - Remove stale entries
-- 7. Master Queue Manager (manage_queue_system) - Orchestrates all functions
--
-- Expected Impact:
-- - 100% Rule Enforcement (males only with females)
-- - 99-100% Match Rate
-- - Auto-detection and fixing of queue issues
-- - Real-time monitoring and alerts
-- ============================================================================

-- ============================================================================
-- 1. RULE ENFORCEMENT LAYER - validate_match_rules
-- ============================================================================
-- CRITICAL: Ensures ALL rules are strictly enforced before any match
-- Guarantees: Males ONLY match with females, age/distance/blocked checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_match_rules(
  p_user1_id UUID,
  p_user2_id UUID,
  p_tier INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  user1_profile RECORD;
  user2_profile RECORD;
  user1_prefs RECORD;
  user2_prefs RECORD;
  distance_km DECIMAL;
BEGIN
  -- Get both profiles
  SELECT * INTO user1_profile FROM profiles WHERE id = p_user1_id;
  SELECT * INTO user2_profile FROM profiles WHERE id = p_user2_id;
  
  IF user1_profile IS NULL OR user2_profile IS NULL THEN
    RETURN FALSE; -- One or both profiles don't exist
  END IF;
  
  -- Get both preferences
  SELECT * INTO user1_prefs FROM user_preferences WHERE user_id = p_user1_id;
  SELECT * INTO user2_prefs FROM user_preferences WHERE user_id = p_user2_id;
  
  IF user1_prefs IS NULL OR user2_prefs IS NULL THEN
    RETURN FALSE; -- One or both preferences don't exist
  END IF;
  
  -- RULE 1: Gender Compatibility (STRICT - Males only with Females)
  -- This is ALWAYS enforced, regardless of tier
  IF NOT (
    (user1_profile.gender = 'male' AND user2_profile.gender = 'female' AND user2_prefs.gender_preference = 'male')
    OR
    (user1_profile.gender = 'female' AND user2_profile.gender = 'male' AND user1_prefs.gender_preference = 'female')
  ) THEN
    -- Log the rejection for monitoring
    PERFORM spark_log_event(
      'match_rejected',
      jsonb_build_object(
        'reason', 'gender_incompatibility',
        'user1_gender', user1_profile.gender,
        'user2_gender', user2_profile.gender,
        'user1_pref', user1_prefs.gender_preference,
        'user2_pref', user2_prefs.gender_preference
      ),
      p_user1_id,
      p_user2_id,
      'matches',
      'VALIDATE',
      NULL,
      NULL,
      'WARNING'
    );
    RETURN FALSE; -- Gender mismatch - REJECT
  END IF;
  
  -- RULE 2: Blocked Users (Both Directions) - ALWAYS enforced
  IF EXISTS (
    SELECT 1 FROM blocked_users 
    WHERE (blocker_id = p_user1_id AND blocked_user_id = p_user2_id)
       OR (blocker_id = p_user2_id AND blocked_user_id = p_user1_id)
  ) THEN
    RETURN FALSE; -- One user blocked the other - REJECT
  END IF;
  
  -- For Tier 3, we relax age and distance constraints
  -- But still enforce gender and blocked status
  IF p_tier = 3 THEN
    -- Tier 3: Only check gender and blocked status (already done above)
    -- Age and distance are relaxed in check_guaranteed_match
    RETURN TRUE;
  END IF;
  
  -- RULE 3: Age Preferences (Bidirectional) - Tier 1 & 2 only
  IF user1_profile.age < user2_prefs.min_age OR user1_profile.age > user2_prefs.max_age THEN
    RETURN FALSE; -- User1's age not in User2's preference range
  END IF;
  
  IF user2_profile.age < user1_prefs.min_age OR user2_profile.age > user1_prefs.max_age THEN
    RETURN FALSE; -- User2's age not in User1's preference range
  END IF;
  
  -- RULE 4: Distance Preferences (Bidirectional) - Tier 1 & 2 only
  -- Calculate distance using Haversine formula
  IF user1_profile.latitude IS NOT NULL AND user1_profile.longitude IS NOT NULL
     AND user2_profile.latitude IS NOT NULL AND user2_profile.longitude IS NOT NULL THEN
    
    -- Use existing calculate_distance function if it exists, otherwise inline calculation
    BEGIN
      SELECT calculate_distance(
        user1_profile.latitude, user1_profile.longitude,
        user2_profile.latitude, user2_profile.longitude
      ) INTO distance_km;
    EXCEPTION
      WHEN OTHERS THEN
        -- Fallback: Inline Haversine calculation
        DECLARE
          earth_radius DECIMAL := 6371;
          dlat DECIMAL;
          dlon DECIMAL;
          a DECIMAL;
          c DECIMAL;
        BEGIN
          dlat := radians(user2_profile.latitude - user1_profile.latitude);
          dlon := radians(user2_profile.longitude - user1_profile.longitude);
          
          a := sin(dlat/2) * sin(dlat/2) + 
               cos(radians(user1_profile.latitude)) * cos(radians(user2_profile.latitude)) * 
               sin(dlon/2) * sin(dlon/2);
          
          c := 2 * atan2(sqrt(a), sqrt(1-a));
          distance_km := earth_radius * c;
        END;
    END;
    
    IF distance_km > user1_prefs.max_distance THEN
      RETURN FALSE; -- Too far for User1
    END IF;
    
    IF distance_km > user2_prefs.max_distance THEN
      RETURN FALSE; -- Too far for User2
    END IF;
  END IF;
  
  -- RULE 5: Online Status (for Tier 1/2 matching)
  -- Tier 3 can match offline users, so this is conditional
  IF p_tier IN (1, 2) THEN
    IF NOT user1_profile.is_online OR NOT user2_profile.is_online THEN
      RETURN FALSE; -- Both must be online for Tier 1/2
    END IF;
  END IF;
  
  -- RULE 6: Queue Status (Both must be matchable)
  IF NOT EXISTS (
    SELECT 1 FROM matching_queue 
    WHERE user_id = p_user1_id 
      AND status IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN FALSE; -- User1 not in valid queue state
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM matching_queue 
    WHERE user_id = p_user2_id 
      AND status IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN FALSE; -- User2 not in valid queue state
  END IF;
  
  -- All rules passed
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_match_rules IS 'CRITICAL: Validates all matching rules before creating a match. Ensures males only match with females, age/distance/blocked checks. Returns TRUE if all rules pass, FALSE otherwise.';

-- ============================================================================
-- 2. QUEUE VALIDATOR - validate_queue_integrity
-- ============================================================================
-- Detects and auto-fixes invalid queue states
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_queue_integrity()
RETURNS JSONB AS $$
DECLARE
  issues JSONB := '[]'::JSONB;
  stuck_users INTEGER := 0;
  orphaned_matches INTEGER := 0;
  duplicate_entries INTEGER := 0;
  invalid_states INTEGER := 0;
  cleaned_stuck INTEGER := 0;
  cleaned_orphaned INTEGER := 0;
  cleaned_duplicates INTEGER := 0;
  cleaned_invalid INTEGER := 0;
BEGIN
  -- 1. Find and fix users stuck in queue too long (>5 minutes)
  SELECT COUNT(*) INTO stuck_users
  FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND joined_at < NOW() - INTERVAL '5 minutes';
  
  IF stuck_users > 0 THEN
    issues := issues || jsonb_build_object('stuck_users', stuck_users);
    
    -- Auto-fix: Delete stuck users (not reset to 'idle' - that's not a valid status)
    -- Only delete if they don't have pending matches (to prevent orphaned matches)
    DELETE FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
      AND joined_at < NOW() - INTERVAL '5 minutes'
      -- CRITICAL: Exclude users with pending matches to prevent orphaned matches
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.status = 'pending'
          AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
      );
    
    GET DIAGNOSTICS cleaned_stuck = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'reset_stuck_users', 'count', cleaned_stuck),
      NULL,
      NULL,
      'matching_queue',
      'UPDATE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 2. Find and fix orphaned matches (match exists but users not in vote_active)
  SELECT COUNT(*) INTO orphaned_matches
  FROM matches m
  WHERE m.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM matching_queue mq
      WHERE mq.user_id IN (m.user1_id, m.user2_id)
        AND mq.status = 'vote_active'
    );
  
  IF orphaned_matches > 0 THEN
    issues := issues || jsonb_build_object('orphaned_matches', orphaned_matches);
    
    -- Auto-fix: Delete orphaned matches and reset users
    WITH orphaned AS (
      SELECT m.id, m.user1_id, m.user2_id
      FROM matches m
      WHERE m.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM matching_queue mq
          WHERE mq.user_id IN (m.user1_id, m.user2_id)
            AND mq.status = 'vote_active'
        )
    )
    DELETE FROM matches
    WHERE id IN (SELECT id FROM orphaned);
    
    GET DIAGNOSTICS cleaned_orphaned = ROW_COUNT;
    
    -- Reset users back to spin_active
    WITH orphaned AS (
      SELECT DISTINCT user_id
      FROM (
        SELECT m.user1_id as user_id FROM matches m
        WHERE m.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM matching_queue mq
            WHERE mq.user_id IN (m.user1_id, m.user2_id)
              AND mq.status = 'vote_active'
          )
        UNION
        SELECT m.user2_id as user_id FROM matches m
        WHERE m.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM matching_queue mq
            WHERE mq.user_id IN (m.user1_id, m.user2_id)
              AND mq.status = 'vote_active'
          )
      ) users
    )
    UPDATE matching_queue
    SET status = 'spin_active', updated_at = NOW()
    WHERE user_id IN (SELECT user_id FROM orphaned)
      AND status NOT IN ('spin_active', 'queue_waiting');
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'remove_orphaned_matches', 'count', cleaned_orphaned),
      NULL,
      NULL,
      'matches',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 3. Find and fix duplicate queue entries
  WITH duplicates AS (
    SELECT user_id, COUNT(*) as cnt
    FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
    GROUP BY user_id
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(*) INTO duplicate_entries FROM duplicates;
  
  IF duplicate_entries > 0 THEN
    issues := issues || jsonb_build_object('duplicate_entries', duplicate_entries);
    
    -- Auto-fix: Keep only the most recent entry
    WITH duplicates AS (
      SELECT user_id, id, joined_at,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY joined_at DESC) as rn
      FROM matching_queue
      WHERE status IN ('spin_active', 'queue_waiting')
    )
    DELETE FROM matching_queue
    WHERE id IN (
      SELECT id FROM duplicates WHERE rn > 1
    );
    
    GET DIAGNOSTICS cleaned_duplicates = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'remove_duplicates', 'count', cleaned_duplicates),
      NULL,
      NULL,
      'matching_queue',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 4. Find and fix invalid queue states (vote_active but no match)
  SELECT COUNT(*) INTO invalid_states
  FROM matching_queue mq
  WHERE mq.status = 'vote_active'
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.status = 'pending'
        AND (m.user1_id = mq.user_id OR m.user2_id = mq.user_id)
    );
  
  IF invalid_states > 0 THEN
    issues := issues || jsonb_build_object('invalid_states', invalid_states);
    
    -- Auto-fix: Reset to spin_active
    UPDATE matching_queue
    SET status = 'spin_active', updated_at = NOW()
    WHERE status = 'vote_active'
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.status = 'pending'
          AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
      );
    
    GET DIAGNOSTICS cleaned_invalid = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'fix_invalid_states', 'count', cleaned_invalid),
      NULL,
      NULL,
      'matching_queue',
      'UPDATE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- Return summary
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'issues_found', issues,
    'stuck_users_fixed', cleaned_stuck,
    'orphaned_matches_fixed', cleaned_orphaned,
    'duplicate_entries_fixed', cleaned_duplicates,
    'invalid_states_fixed', cleaned_invalid,
    'total_issues', jsonb_array_length(issues)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_queue_integrity IS 'Validates queue integrity and auto-fixes issues: stuck users, orphaned matches, duplicates, invalid states.';

-- ============================================================================
-- 3. QUEUE OPTIMIZER - optimize_queue_order
-- ============================================================================
-- Optimizes queue order, fairness scores, and matching priority
-- ============================================================================

CREATE OR REPLACE FUNCTION public.optimize_queue_order()
RETURNS JSONB AS $$
DECLARE
  males_count INTEGER;
  females_count INTEGER;
  gender_imbalance DECIMAL;
  optimized_count INTEGER := 0;
  fairness_recalculated INTEGER := 0;
BEGIN
  -- 1. Recalculate fairness scores for all users
  -- Using existing calculate_fairness_score function if available
  UPDATE matching_queue mq
  SET fairness_score = COALESCE(
    (SELECT calculate_fairness_score(mq.user_id)),
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER * 10
  ),
  updated_at = NOW()
  WHERE status IN ('spin_active', 'queue_waiting');
  
  GET DIAGNOSTICS fairness_recalculated = ROW_COUNT;
  
  -- 2. Get gender balance
  SELECT 
    COUNT(*) FILTER (WHERE p.gender = 'male'),
    COUNT(*) FILTER (WHERE p.gender = 'female')
  INTO males_count, females_count
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status IN ('spin_active', 'queue_waiting');
  
  -- 3. Calculate imbalance and adjust fairness scores
  IF males_count > 0 AND females_count > 0 THEN
    gender_imbalance := ABS(males_count::DECIMAL / NULLIF(females_count, 0) - 1.0);
    
    -- If imbalance > 20%, boost fairness for minority gender
    IF gender_imbalance > 0.2 THEN
      IF males_count > females_count THEN
        -- Boost female fairness scores
        UPDATE matching_queue mq
        SET fairness_score = fairness_score + 100,
            updated_at = NOW()
        FROM profiles p
        WHERE mq.user_id = p.id
          AND p.gender = 'female'
          AND mq.status IN ('spin_active', 'queue_waiting');
        GET DIAGNOSTICS optimized_count = ROW_COUNT;
      ELSE
        -- Boost male fairness scores
        UPDATE matching_queue mq
        SET fairness_score = fairness_score + 100,
            updated_at = NOW()
        FROM profiles p
        WHERE mq.user_id = p.id
          AND p.gender = 'male'
          AND mq.status IN ('spin_active', 'queue_waiting');
        GET DIAGNOSTICS optimized_count = ROW_COUNT;
      END IF;
    END IF;
  END IF;
  
  -- 4. Reset skip_count for users who have been waiting long
  UPDATE matching_queue
  SET skip_count = 0,
      updated_at = NOW()
  WHERE status IN ('spin_active', 'queue_waiting')
    AND joined_at < NOW() - INTERVAL '30 seconds'
    AND skip_count > 0;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'males_in_queue', males_count,
    'females_in_queue', females_count,
    'gender_imbalance', gender_imbalance,
    'optimized_users', optimized_count,
    'fairness_scores_recalculated', fairness_recalculated
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.optimize_queue_order IS 'Optimizes queue order by recalculating fairness scores and managing gender balance.';

-- ============================================================================
-- 4. QUEUE HEALTH MONITOR - monitor_queue_health
-- ============================================================================
-- Real-time monitoring of queue health with automatic issue detection
-- ============================================================================

CREATE OR REPLACE FUNCTION public.monitor_queue_health()
RETURNS JSONB AS $$
DECLARE
  health_metrics JSONB;
  total_users INTEGER;
  males INTEGER;
  females INTEGER;
  avg_wait_time INTEGER;
  max_wait_time INTEGER;
  match_rate DECIMAL;
  issues JSONB := '[]'::JSONB;
  health_score INTEGER := 100;
BEGIN
  -- Get queue statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE p.gender = 'male'),
    COUNT(*) FILTER (WHERE p.gender = 'female'),
    COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - mq.joined_at)))::INTEGER, 0),
    COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - mq.joined_at)))::INTEGER, 0)
  INTO total_users, males, females, avg_wait_time, max_wait_time
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status IN ('spin_active', 'queue_waiting');
  
  -- Get match rate (using existing function if available)
  BEGIN
    SELECT get_current_match_rate() INTO match_rate;
  EXCEPTION
    WHEN OTHERS THEN
      match_rate := 0; -- Default if function doesn't exist
  END;
  
  -- Check for issues
  -- Issue 1: Gender imbalance > 50%
  IF males > 0 AND females > 0 THEN
    IF ABS(males::DECIMAL / NULLIF(females, 0) - 1.0) > 0.5 THEN
      issues := issues || jsonb_build_object(
        'type', 'gender_imbalance',
        'severity', 'high',
        'message', format('Gender imbalance: %s males, %s females', males, females)
      );
      health_score := health_score - 20;
    END IF;
  END IF;
  
  -- Issue 2: Average wait time > 30 seconds
  IF avg_wait_time > 30 THEN
    issues := issues || jsonb_build_object(
      'type', 'high_wait_time',
      'severity', 'medium',
      'message', format('Average wait time: %s seconds', avg_wait_time)
    );
    health_score := health_score - 10;
  END IF;
  
  -- Issue 3: Match rate < 90%
  IF match_rate < 90 THEN
    issues := issues || jsonb_build_object(
      'type', 'low_match_rate',
      'severity', 'high',
      'message', format('Match rate: %s%%', match_rate)
    );
    health_score := health_score - 30;
  END IF;
  
  -- Issue 4: Queue size > 200
  IF total_users > 200 THEN
    issues := issues || jsonb_build_object(
      'type', 'queue_bloat',
      'severity', 'medium',
      'message', format('Queue size: %s users', total_users)
    );
    health_score := health_score - 10;
  END IF;
  
  -- Build metrics
  health_metrics := jsonb_build_object(
    'timestamp', NOW(),
    'total_users', total_users,
    'males', males,
    'females', females,
    'avg_wait_time_seconds', avg_wait_time,
    'max_wait_time_seconds', max_wait_time,
    'match_rate', match_rate,
    'health_score', health_score,
    'issues', issues,
    'status', CASE
      WHEN health_score >= 90 THEN 'excellent'
      WHEN health_score >= 70 THEN 'good'
      WHEN health_score >= 50 THEN 'fair'
      ELSE 'poor'
    END
  );
  
  -- Store in metrics table (if it exists)
  BEGIN
    INSERT INTO matching_metrics (
      total_users,
      matched_users,
      unmatched_users,
      match_rate
    ) VALUES (
      total_users,
      (total_users * match_rate / 100)::INTEGER,
      (total_users * (100 - match_rate) / 100)::INTEGER,
      match_rate
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Metrics table might not exist, ignore
      NULL;
  END;
  
  RETURN health_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.monitor_queue_health IS 'Monitors queue health in real-time, detects issues, and provides health score (0-100).';

-- ============================================================================
-- 5. QUEUE BALANCER - balance_queue_gender
-- ============================================================================
-- Actively balances gender distribution by prioritizing minority gender
-- ============================================================================

CREATE OR REPLACE FUNCTION public.balance_queue_gender()
RETURNS JSONB AS $$
DECLARE
  males_count INTEGER;
  females_count INTEGER;
  imbalance_ratio DECIMAL;
  boost_applied INTEGER := 0;
BEGIN
  -- Get current gender counts
  SELECT 
    COUNT(*) FILTER (WHERE p.gender = 'male'),
    COUNT(*) FILTER (WHERE p.gender = 'female')
  INTO males_count, females_count
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status IN ('spin_active', 'queue_waiting');
  
  -- Calculate imbalance
  IF males_count > 0 AND females_count > 0 THEN
    imbalance_ratio := GREATEST(males_count, females_count)::DECIMAL / 
                       NULLIF(LEAST(males_count, females_count), 0);
    
    -- If imbalance > 1.5 (e.g., 150 males, 100 females), boost minority
    IF imbalance_ratio > 1.5 THEN
      IF males_count > females_count THEN
        -- Boost females (minority)
        UPDATE matching_queue mq
        SET fairness_score = fairness_score + (imbalance_ratio * 50)::INTEGER,
            updated_at = NOW()
        FROM profiles p
        WHERE mq.user_id = p.id
          AND p.gender = 'female'
          AND mq.status IN ('spin_active', 'queue_waiting');
        GET DIAGNOSTICS boost_applied = ROW_COUNT;
      ELSE
        -- Boost males (minority)
        UPDATE matching_queue mq
        SET fairness_score = fairness_score + (imbalance_ratio * 50)::INTEGER,
            updated_at = NOW()
        FROM profiles p
        WHERE mq.user_id = p.id
          AND p.gender = 'male'
          AND mq.status IN ('spin_active', 'queue_waiting');
        GET DIAGNOSTICS boost_applied = ROW_COUNT;
      END IF;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'males', males_count,
    'females', females_count,
    'imbalance_ratio', imbalance_ratio,
    'boost_applied_to', boost_applied,
    'action_taken', CASE WHEN imbalance_ratio > 1.5 THEN 'boosted_minority' ELSE 'no_action' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.balance_queue_gender IS 'Balances gender distribution by boosting fairness scores for minority gender when imbalance > 1.5x.';

-- ============================================================================
-- 6. QUEUE CLEANUP SERVICE - cleanup_stale_queue_entries
-- ============================================================================
-- Removes stale entries, offline users, and invalid states
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_queue_entries()
RETURNS JSONB AS $$
DECLARE
  cleaned_count INTEGER := 0;
  offline_removed INTEGER := 0;
  timeout_removed INTEGER := 0;
  duplicate_removed INTEGER := 0;
BEGIN
  -- 1. Remove offline users (if they've been offline > 2 minutes)
  DELETE FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND user_id IN (
      SELECT id FROM profiles
      WHERE is_online = FALSE
        AND last_active_at < NOW() - INTERVAL '2 minutes'
    );
  GET DIAGNOSTICS offline_removed = ROW_COUNT;
  cleaned_count := cleaned_count + offline_removed;
  
  -- 2. Remove users who have been waiting > 10 minutes (timeout)
  DELETE FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND joined_at < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS timeout_removed = ROW_COUNT;
  cleaned_count := cleaned_count + timeout_removed;
  
  -- 3. Remove duplicate entries (keep most recent)
  WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY joined_at DESC
    ) as rn
    FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
  )
  DELETE FROM matching_queue
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  GET DIAGNOSTICS duplicate_removed = ROW_COUNT;
  cleaned_count := cleaned_count + duplicate_removed;
  
  -- Log cleanup if significant
  IF cleaned_count > 0 THEN
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object(
        'action', 'cleanup_stale_entries',
        'offline_removed', offline_removed,
        'timeout_removed', timeout_removed,
        'duplicate_removed', duplicate_removed,
        'total_cleaned', cleaned_count
      ),
      NULL,
      NULL,
      'matching_queue',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'total_cleaned', cleaned_count,
    'offline_removed', offline_removed,
    'timeout_removed', timeout_removed,
    'duplicate_removed', duplicate_removed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_stale_queue_entries IS 'Removes stale queue entries: offline users, timeouts, duplicates.';

-- ============================================================================
-- 7. MASTER QUEUE MANAGER - manage_queue_system
-- ============================================================================
-- Orchestrates all queue management functions in optimal order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_queue_system()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  cleanup_result JSONB;
  validation_result JSONB;
  optimization_result JSONB;
  balance_result JSONB;
  health_result JSONB;
BEGIN
  -- Step 1: Cleanup stale entries first (removes invalid data)
  SELECT cleanup_stale_queue_entries() INTO cleanup_result;
  
  -- Step 2: Validate and fix queue integrity
  SELECT validate_queue_integrity() INTO validation_result;
  
  -- Step 3: Optimize queue order and fairness
  SELECT optimize_queue_order() INTO optimization_result;
  
  -- Step 4: Balance gender distribution
  SELECT balance_queue_gender() INTO balance_result;
  
  -- Step 5: Monitor health (last - provides final status)
  SELECT monitor_queue_health() INTO health_result;
  
  -- Combine all results
  result := jsonb_build_object(
    'timestamp', NOW(),
    'cleanup', cleanup_result,
    'validation', validation_result,
    'optimization', optimization_result,
    'balance', balance_result,
    'health', health_result,
    'status', 'completed'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.manage_queue_system IS 'Master function that orchestrates all queue management functions in optimal order. Run this periodically (every 30-60 seconds).';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.validate_match_rules TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_queue_integrity TO authenticated;
GRANT EXECUTE ON FUNCTION public.optimize_queue_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_queue_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.balance_queue_gender TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_queue_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_queue_system TO authenticated;

-- ============================================================================
-- SCHEDULE BACKGROUND JOBS (if pg_cron is available)
-- ============================================================================

DO $$
BEGIN
  -- Schedule master queue manager to run every 4 seconds (faster issue detection and resolution)
  PERFORM cron.schedule(
    'manage-queue-system',
    '*/4 * * * * *',
    'SELECT manage_queue_system();'
  );
  
  RAISE NOTICE 'Queue management system scheduled successfully (every 4 seconds)';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'pg_cron extension not available. Use alternative method (Next.js API route or external cron).';
    RAISE WARNING 'Error: %', SQLERRM;
END $$;

