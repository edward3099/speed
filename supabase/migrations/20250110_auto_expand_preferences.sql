-- ============================================================================
-- Auto-Expand Preferences Function
-- ============================================================================
-- Phase 4.2: Updates preference_stage based on waiting time
-- ============================================================================

-- Function to auto-expand preferences
CREATE OR REPLACE FUNCTION auto_expand_preferences()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- Expand to stage 1 after 10 seconds
  UPDATE queue
  SET preference_stage = 1, updated_at = NOW()
  WHERE waiting_since < NOW() - INTERVAL '10 seconds'
    AND preference_stage = 0;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Expand to stage 2 after 15 seconds
  UPDATE queue
  SET preference_stage = 2, updated_at = NOW()
  WHERE waiting_since < NOW() - INTERVAL '15 seconds'
    AND preference_stage = 1;
  
  -- Expand to stage 3 (full expansion) after 20 seconds
  UPDATE queue
  SET preference_stage = 3, updated_at = NOW()
  WHERE waiting_since < NOW() - INTERVAL '20 seconds'
    AND preference_stage = 2;
  
  -- Also update user_preferences table if it exists
  BEGIN
    -- Update preference_stage in user_preferences if column exists
    UPDATE user_preferences
    SET preference_stage = (
      SELECT preference_stage FROM queue
      WHERE queue.user_id = user_preferences.user_id
    )
    WHERE user_id IN (
      SELECT user_id FROM queue
      WHERE preference_stage > 0
    );
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      -- user_preferences table or column doesn't exist, skip
      NULL;
  END;
  
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION auto_expand_preferences IS 'Auto-expands preferences based on waiting time: 10s=stage1, 15s=stage2, 20s=stage3 - runs every 2 seconds';

