-- ============================================================================
-- Migration 115: Compatibility Functions
-- ============================================================================
-- Creates compatibility functions for existing frontend code
-- ============================================================================

-- Compatibility: queue_join wraps join_queue
CREATE OR REPLACE FUNCTION queue_join(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  success BOOLEAN;
BEGIN
  -- Call the new join_queue function
  SELECT join_queue(p_user_id) INTO success;
  
  IF success THEN
    -- Return queue entry id (or 1 for success)
    RETURN (SELECT id FROM queue WHERE user_id = p_user_id LIMIT 1);
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION queue_join IS 'Compatibility wrapper for join_queue - returns queue entry id';
