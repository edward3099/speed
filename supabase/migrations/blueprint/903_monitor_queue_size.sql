-- ============================================================================
-- Blueprint Migration 903: Monitor Queue Size
-- ============================================================================
-- Part 9.3: Monitor queue size and trigger alerts if needed
-- ============================================================================

-- Monitor queue size and trigger alerts if needed
CREATE OR REPLACE FUNCTION monitor_queue_size()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB;
  v_total_users INTEGER;
  v_warnings TEXT[] := '{}';
BEGIN
  v_metrics := collect_queue_metrics();
  v_total_users := (v_metrics->>'total_users')::INTEGER;
  
  -- Check for queue overload
  IF v_total_users > 500 THEN
    v_warnings := array_append(v_warnings, 'Queue size exceeds 500 users - consider scaling');
  END IF;
  
  -- Check for queue underload
  IF v_total_users < 10 THEN
    v_warnings := array_append(v_warnings, 'Queue size below 10 users - matching may be slow');
  END IF;
  
  -- Check for severe gender imbalance
  IF (v_metrics->>'gender_imbalance_score')::DECIMAL > 0.5 THEN
    v_warnings := array_append(v_warnings, 'Severe gender imbalance detected - automatic balancing triggered');
    PERFORM apply_gender_ratio_balancing();
  END IF;
  
  -- Check for high wait times
  IF (v_metrics->>'avg_wait_time_seconds')::INTEGER > 300 THEN
    v_warnings := array_append(v_warnings, 'Average wait time exceeds 5 minutes - investigate matching bottlenecks');
  END IF;
  
  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'warnings', v_warnings,
    'metrics', v_metrics
  );
END;
$$;

COMMENT ON FUNCTION monitor_queue_size IS 'Monitors queue size and triggers alerts for overload, underload, imbalance, and high wait times';

