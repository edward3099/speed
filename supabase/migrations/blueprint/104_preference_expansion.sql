-- ============================================================================
-- Migration 104: Preference Expansion
-- ============================================================================
-- Part 5.4: Preference expansion based on wait time
-- ============================================================================

-- Update preference stage based on wait time
CREATE OR REPLACE FUNCTION update_preference_stage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  wait_time_seconds INTEGER;
  current_stage INTEGER;
  new_stage INTEGER;
BEGIN
  -- Get wait time
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER,
    preference_stage
  INTO wait_time_seconds, current_stage
  FROM queue
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Determine new stage based on wait time
  IF wait_time_seconds >= 20 THEN
    new_stage := 3; -- Full expansion
  ELSIF wait_time_seconds >= 15 THEN
    new_stage := 2; -- Distance expanded
  ELSIF wait_time_seconds >= 10 THEN
    new_stage := 1; -- Age expanded
  ELSE
    new_stage := 0; -- Exact preferences
  END IF;
  
  -- Update if changed
  IF new_stage != current_stage THEN
    UPDATE queue
    SET preference_stage = new_stage,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN new_stage;
END;
$$;

COMMENT ON FUNCTION update_preference_stage IS 'Updates preference expansion stage based on wait time: 0-10s=stage0, 10-15s=stage1, 15-20s=stage2, 20s+=stage3';
