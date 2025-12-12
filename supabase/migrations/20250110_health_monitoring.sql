-- ============================================================================
-- Health Monitoring Function
-- ============================================================================
-- Phase 7.1: Calculates and logs health metrics for each section
-- ============================================================================

-- Function to update section health metrics
CREATE OR REPLACE FUNCTION update_section_health()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spinning_success_rate NUMERIC;
  v_spinning_avg_time_ms INTEGER;
  v_spinning_error_count INTEGER;
  v_spinning_active_users INTEGER;
  v_spinning_health_score INTEGER;
  
  v_matching_queue_size INTEGER;
  v_matching_success_rate NUMERIC;
  v_matching_long_waiters INTEGER;
  v_matching_health_score INTEGER;
  
  v_voting_ack_rate NUMERIC;
  v_voting_success_rate NUMERIC;
  v_voting_resolution_rate NUMERIC;
  v_voting_health_score INTEGER;
BEGIN
  -- ============================================================================
  -- SPINNING SECTION HEALTH
  -- ============================================================================
  
  -- Calculate spinning metrics from last 60 seconds
  SELECT 
    COUNT(*) FILTER (WHERE action = 'join_succeeded')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE action IN ('join_succeeded', 'join_failed')), 0) * 100,
    AVG(duration_ms)::INTEGER,
    COUNT(*) FILTER (WHERE action = 'join_failed'),
    COUNT(DISTINCT user_id) FILTER (WHERE timestamp > NOW() - INTERVAL '60 seconds')
  INTO 
    v_spinning_success_rate,
    v_spinning_avg_time_ms,
    v_spinning_error_count,
    v_spinning_active_users
  FROM spinning_log
  WHERE timestamp > NOW() - INTERVAL '60 seconds';
  
  -- Calculate health score (0-100)
  v_spinning_health_score := 100;
  IF v_spinning_success_rate < 99 THEN
    v_spinning_health_score := v_spinning_health_score - 20;
  END IF;
  IF v_spinning_avg_time_ms > 1000 THEN
    v_spinning_health_score := v_spinning_health_score - 10;
  END IF;
  IF v_spinning_error_count > 5 THEN
    v_spinning_health_score := v_spinning_health_score - 15;
  END IF;
  v_spinning_health_score := GREATEST(0, v_spinning_health_score);
  
  -- Insert spinning health
  INSERT INTO section_health (section, success_rate, average_time_ms, error_count, active_users, health_score)
  VALUES (
    'spinning',
    COALESCE(v_spinning_success_rate, 100),
    COALESCE(v_spinning_avg_time_ms, 0),
    COALESCE(v_spinning_error_count, 0),
    COALESCE(v_spinning_active_users, 0),
    v_spinning_health_score
  );
  
  -- ============================================================================
  -- MATCHING SECTION HEALTH
  -- ============================================================================
  
  -- Get queue size
  SELECT COUNT(*) INTO v_matching_queue_size FROM queue;
  
  -- Calculate matching success rate from last 60 seconds
  SELECT 
    COUNT(*) FILTER (WHERE action = 'match_created')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE action IN ('match_created', 'match_failed')), 0) * 100
  INTO v_matching_success_rate
  FROM matching_log
  WHERE timestamp > NOW() - INTERVAL '60 seconds';
  
  -- Count long waiters (>60 seconds)
  SELECT COUNT(*) INTO v_matching_long_waiters
  FROM queue
  WHERE waiting_since < NOW() - INTERVAL '60 seconds';
  
  -- Calculate health score
  v_matching_health_score := 100;
  IF v_matching_queue_size > 100 THEN
    v_matching_health_score := v_matching_health_score - 20;
  END IF;
  IF v_matching_success_rate < 50 THEN
    v_matching_health_score := v_matching_health_score - 30;
  END IF;
  IF v_matching_long_waiters > 10 THEN
    v_matching_health_score := v_matching_health_score - 15;
  END IF;
  v_matching_health_score := GREATEST(0, v_matching_health_score);
  
  -- Insert matching health
  INSERT INTO section_health (section, success_rate, active_users, health_score, metadata)
  VALUES (
    'matching',
    COALESCE(v_matching_success_rate, 0),
    v_matching_queue_size,
    v_matching_health_score,
    jsonb_build_object(
      'queue_size', v_matching_queue_size,
      'long_waiters', v_matching_long_waiters
    )
  );
  
  -- ============================================================================
  -- VOTING SECTION HEALTH
  -- ============================================================================
  
  -- Calculate acknowledgment rate from last 60 seconds
  SELECT 
    COUNT(*) FILTER (WHERE action = 'acknowledged')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE action IN ('acknowledged', 'acknowledge_failed')), 0) * 100
  INTO v_voting_ack_rate
  FROM voting_log
  WHERE timestamp > NOW() - INTERVAL '60 seconds';
  
  -- Calculate vote success rate
  SELECT 
    COUNT(*) FILTER (WHERE action = 'vote_recorded')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE action IN ('vote_recorded', 'vote_failed')), 0) * 100
  INTO v_voting_success_rate
  FROM voting_log
  WHERE timestamp > NOW() - INTERVAL '60 seconds';
  
  -- Calculate outcome resolution rate
  SELECT 
    COUNT(*) FILTER (WHERE action = 'outcome_resolved')::NUMERIC / 
      NULLIF(COUNT(*) FILTER (WHERE action = 'vote_recorded'), 0) * 100
  INTO v_voting_resolution_rate
  FROM voting_log
  WHERE timestamp > NOW() - INTERVAL '60 seconds';
  
  -- Calculate health score
  v_voting_health_score := 100;
  IF v_voting_ack_rate < 90 THEN
    v_voting_health_score := v_voting_health_score - 15;
  END IF;
  IF v_voting_success_rate < 80 THEN
    v_voting_health_score := v_voting_health_score - 20;
  END IF;
  IF v_voting_resolution_rate < 100 THEN
    v_voting_health_score := v_voting_health_score - 25;
  END IF;
  v_voting_health_score := GREATEST(0, v_voting_health_score);
  
  -- Insert voting health
  INSERT INTO section_health (section, success_rate, health_score, metadata)
  VALUES (
    'voting',
    COALESCE(v_voting_success_rate, 0),
    v_voting_health_score,
    jsonb_build_object(
      'ack_rate', COALESCE(v_voting_ack_rate, 0),
      'vote_success_rate', COALESCE(v_voting_success_rate, 0),
      'resolution_rate', COALESCE(v_voting_resolution_rate, 0)
    )
  );
  
END;
$$;

COMMENT ON FUNCTION update_section_health IS 'Calculates and logs health metrics for each section - runs every 10 seconds';

