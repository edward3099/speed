-- ============================================================================
-- Blueprint Migration 401: Calculate Fairness Score
-- ============================================================================
-- Part 4.1: THE ONLY FUNCTION THAT CALCULATES FAIRNESS
-- ============================================================================

-- THE ONLY FUNCTION THAT CALCULATES FAIRNESS
CREATE OR REPLACE FUNCTION calculate_fairness_score(
  p_user_id UUID
) RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queue_time_seconds INTEGER;
  skip_count INTEGER;
  preference_narrowness DECIMAL(5, 2);
  queue_size INTEGER;
  base_score DECIMAL(10, 2);
  skip_penalty DECIMAL(10, 2);
  narrow_penalty DECIMAL(10, 2);
  density_boost DECIMAL(10, 2);
  final_score DECIMAL(10, 2);
BEGIN
  -- Get queue metrics
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER,
    mq.skip_count,
    COUNT(*) OVER () - 1
  INTO queue_time_seconds, skip_count, queue_size
  FROM matching_queue mq
  WHERE mq.user_id = p_user_id;
  
  -- Calculate preference narrowness
  SELECT 
    (
      (max_age - min_age) / 50.0 +
      (max_distance / 200.0)
    ) / 2.0
  INTO preference_narrowness
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- Base score from wait time (moderate growth to prevent over-prioritization)
  -- Formula: wait_time / 10, capped at 500
  -- This means: 80s = 8, 3min = 18, 5min = 30, 20min = 120, 83min+ = 500
  base_score := LEAST(queue_time_seconds / 10.0, 500.0);
  
  -- Skip penalty (moderate to prevent gaming)
  skip_penalty := LEAST(skip_count * 50.0, 300.0);
  
  -- Narrow preference penalty (encourages broader preferences)
  narrow_penalty := (1.0 - preference_narrowness) * 100.0;
  
  -- Low queue density boost (helps when queue is small)
  density_boost := GREATEST(0, (10 - queue_size) * 10.0);
  
  -- Final score
  -- NOTE: This formula is intentionally aggressive to prioritize fairness
  -- However, preference matching quality (Tier 1/2) still takes precedence
  -- Fairness only affects ordering within each tier, not tier selection
  final_score := base_score + skip_penalty + narrow_penalty + density_boost;
  
  -- Update fairness score (ONLY PLACE IT'S UPDATED)
  UPDATE matching_queue
  SET fairness_score = final_score,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  RETURN final_score;
END;
$$;

COMMENT ON FUNCTION calculate_fairness_score IS 'THE ONLY FUNCTION THAT CALCULATES FAIRNESS - Single source of truth for fairness calculation';

