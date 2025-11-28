-- ============================================================================
-- Migration 105: Fairness Engine
-- ============================================================================
-- Part 5.6: Fairness scoring (wait_time + yes_boost_events * 10)
-- ============================================================================

-- Calculate fairness score for a user
CREATE OR REPLACE FUNCTION calculate_fairness_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  wait_time_seconds INTEGER;
  yes_boost_events INTEGER;
  fairness_score INTEGER;
BEGIN
  -- Get wait time
  SELECT EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER
  INTO wait_time_seconds
  FROM queue
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Count yes boost events (from debug_logs)
  -- Track yes_boost_events in metadata or separate tracking
  -- For now, count from debug_logs
  SELECT COALESCE(COUNT(*), 0)
  INTO yes_boost_events
  FROM debug_logs
  WHERE user_id = p_user_id
    AND event_type = 'yes_boost_applied'
    AND timestamp > NOW() - INTERVAL '1 hour'; -- Recent boosts only
  
  -- Calculate fairness: wait_time + (yes_boost_events * 10)
  fairness_score := wait_time_seconds + (yes_boost_events * 10);
  
  -- Update queue
  UPDATE queue
  SET fairness_score = fairness_score,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN fairness_score;
END;
$$;

-- Apply yes boost (+10 fairness)
CREATE OR REPLACE FUNCTION apply_yes_boost(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Increment fairness by 10
  UPDATE queue
  SET fairness_score = fairness_score + 10,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log the boost
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (p_user_id, 'yes_boost_applied', jsonb_build_object('boost_amount', 10), 'info');
END;
$$;

COMMENT ON FUNCTION calculate_fairness_score IS 'Calculates fairness score: wait_time_seconds + (yes_boost_events * 10)';
COMMENT ON FUNCTION apply_yes_boost IS 'Applies +10 fairness boost to yes voter';
