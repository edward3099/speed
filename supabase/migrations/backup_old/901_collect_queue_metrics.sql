-- ============================================================================
-- Blueprint Migration 901: Collect Queue Metrics
-- ============================================================================
-- Part 9.1: Collect current queue metrics for monitoring
-- ============================================================================

-- Collect current queue metrics for monitoring
CREATE OR REPLACE FUNCTION collect_queue_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics RECORD;
  v_supply_demand_ratio DECIMAL(10, 4);
  v_gender_imbalance_score DECIMAL(10, 4);
  v_total_users INTEGER;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_avg_fairness DECIMAL(10, 2);
  v_avg_wait_time INTEGER;
BEGIN
  -- Get queue statistics
  SELECT 
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS total_users,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender = 'male') AS male_count,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender = 'female') AS female_count,
    COUNT(*) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting') AND p.gender NOT IN ('male', 'female')) AS other_count,
    COUNT(*) FILTER (WHERE mq.status = 'spin_active') AS spin_active_count,
    COUNT(*) FILTER (WHERE mq.status = 'queue_waiting') AS queue_waiting_count,
    COUNT(*) FILTER (WHERE mq.status = 'paired') AS paired_count,
    COUNT(*) FILTER (WHERE mq.status = 'vote_active') AS vote_active_count,
    AVG(mq.fairness_score) FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS avg_fairness,
    AVG(EXTRACT(EPOCH FROM (NOW() - mq.joined_at)))::INTEGER FILTER (WHERE mq.status IN ('spin_active', 'queue_waiting')) AS avg_wait_time
  INTO v_metrics
  FROM matching_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = TRUE;
  
  v_total_users := COALESCE(v_metrics.total_users, 0);
  v_male_count := COALESCE(v_metrics.male_count, 0);
  v_female_count := COALESCE(v_metrics.female_count, 0);
  
  -- Calculate supply/demand ratio (male/female or female/male, whichever is > 1)
  IF v_female_count > 0 THEN
    v_supply_demand_ratio := v_male_count::DECIMAL / v_female_count;
  ELSIF v_male_count > 0 THEN
    v_supply_demand_ratio := v_female_count::DECIMAL / v_male_count;
  ELSE
    v_supply_demand_ratio := 1.0;
  END IF;
  
  -- Calculate gender imbalance score (0 = balanced, 1 = completely imbalanced)
  IF v_total_users > 0 THEN
    v_gender_imbalance_score := ABS(v_male_count - v_female_count)::DECIMAL / v_total_users;
  ELSE
    v_gender_imbalance_score := 0.0;
  END IF;
  
  -- Get tier distribution
  SELECT 
    COUNT(*) FILTER (WHERE mq.fairness_score >= 200 OR EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) >= 120) AS tier1,
    COUNT(*) FILTER (WHERE mq.fairness_score >= 50 AND mq.fairness_score < 200 AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) < 120) AS tier2,
    COUNT(*) FILTER (WHERE mq.fairness_score < 50 AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at)) < 120) AS tier3
  INTO v_metrics
  FROM matching_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = TRUE
    AND mq.status IN ('spin_active', 'queue_waiting');
  
  -- Store metrics in history table
  INSERT INTO queue_metrics (
    total_users,
    male_count,
    female_count,
    other_count,
    spin_active_count,
    queue_waiting_count,
    paired_count,
    vote_active_count,
    supply_demand_ratio,
    gender_imbalance_score,
    avg_fairness_score,
    avg_wait_time_seconds,
    tier1_count,
    tier2_count,
    tier3_count
  ) VALUES (
    v_total_users,
    v_male_count,
    v_female_count,
    COALESCE(v_metrics.other_count, 0),
    COALESCE(v_metrics.spin_active_count, 0),
    COALESCE(v_metrics.queue_waiting_count, 0),
    COALESCE(v_metrics.paired_count, 0),
    COALESCE(v_metrics.vote_active_count, 0),
    v_supply_demand_ratio,
    v_gender_imbalance_score,
    COALESCE(v_avg_fairness, 0),
    COALESCE(v_avg_wait_time, 0),
    COALESCE(v_metrics.tier1, 0),
    COALESCE(v_metrics.tier2, 0),
    COALESCE(v_metrics.tier3, 0)
  );
  
  -- Return current metrics
  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'male_count', v_male_count,
    'female_count', v_female_count,
    'supply_demand_ratio', v_supply_demand_ratio,
    'gender_imbalance_score', v_gender_imbalance_score,
    'avg_fairness_score', COALESCE(v_avg_fairness, 0),
    'avg_wait_time_seconds', COALESCE(v_avg_wait_time, 0),
    'tier1_count', COALESCE(v_metrics.tier1, 0),
    'tier2_count', COALESCE(v_metrics.tier2, 0),
    'tier3_count', COALESCE(v_metrics.tier3, 0),
    'needs_balancing', v_gender_imbalance_score > 0.3 OR v_supply_demand_ratio > 2.0 OR v_supply_demand_ratio < 0.5
  );
END;
$$;

COMMENT ON FUNCTION collect_queue_metrics IS 'Collects current queue metrics and stores in queue_metrics table for monitoring';

