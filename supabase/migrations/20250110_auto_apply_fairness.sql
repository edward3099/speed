-- ============================================================================
-- Auto-Apply Fairness Boosts Function
-- ============================================================================
-- Phase 4.3: Applies fairness boosts based on waiting time
-- ============================================================================

-- Function to auto-apply fairness boosts
CREATE OR REPLACE FUNCTION auto_apply_fairness_boosts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_boosted INTEGER := 0;
  v_target_fairness INTEGER;
BEGIN
  -- Apply fairness boost for users waiting 20-60 seconds (target: 5)
  UPDATE users_state
  SET
    fairness = 5,
    updated_at = NOW()
  WHERE user_id IN (
    SELECT user_id FROM queue
    WHERE waiting_since < NOW() - INTERVAL '20 seconds'
      AND waiting_since >= NOW() - INTERVAL '60 seconds'
  )
  AND fairness < 5;
  
  GET DIAGNOSTICS v_boosted = ROW_COUNT;
  
  -- Apply fairness boost for users waiting 60-120 seconds (target: 10)
  UPDATE users_state
  SET
    fairness = 10,
    updated_at = NOW()
  WHERE user_id IN (
    SELECT user_id FROM queue
    WHERE waiting_since < NOW() - INTERVAL '60 seconds'
      AND waiting_since >= NOW() - INTERVAL '120 seconds'
  )
  AND fairness < 10;
  
  -- Apply fairness boost for users waiting 120-300 seconds (target: 15)
  UPDATE users_state
  SET
    fairness = 15,
    updated_at = NOW()
  WHERE user_id IN (
    SELECT user_id FROM queue
    WHERE waiting_since < NOW() - INTERVAL '120 seconds'
      AND waiting_since >= NOW() - INTERVAL '300 seconds'
  )
  AND fairness < 15;
  
  -- Apply fairness boost for users waiting 300+ seconds (target: 20, capped)
  UPDATE users_state
  SET
    fairness = 20,
    updated_at = NOW()
  WHERE user_id IN (
    SELECT user_id FROM queue
    WHERE waiting_since < NOW() - INTERVAL '300 seconds'
  )
  AND fairness < 20;
  
  -- Update queue fairness to match users_state
  UPDATE queue
  SET fairness = (
    SELECT fairness FROM users_state
    WHERE users_state.user_id = queue.user_id
  ),
  updated_at = NOW()
  WHERE user_id IN (
    SELECT user_id FROM users_state
    WHERE fairness > 0
  );
  
  RETURN v_boosted;
END;
$$;

COMMENT ON FUNCTION auto_apply_fairness_boosts IS 'Auto-applies fairness boosts based on waiting time: 20-60s=5, 60-120s=10, 120-300s=15, 300s+=20 - runs every 2 seconds';

