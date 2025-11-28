-- ============================================================================
-- Blueprint Migration 1301: Log Event Helper Function
-- ============================================================================
-- Part 9.6.4: Helper function for logging events (used throughout blueprint)
-- ============================================================================

-- Helper function for logging events (used throughout blueprint)
CREATE OR REPLACE FUNCTION log_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::JSONB,
  p_severity TEXT DEFAULT 'INFO',
  p_function_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO spark_event_log (
    event_type,
    event_data,
    user_id,
    timestamp,
    severity,
    function_name,
    source
  ) VALUES (
    p_event_type,
    p_event_data,
    p_user_id,
    NOW(),
    p_severity,
    p_function_name,
    'backend'
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION log_event IS 'Helper function for logging events - used throughout blueprint for consistent logging';

