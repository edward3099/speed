-- ============================================================================
-- Comprehensive Error Diagnostics for Spinning Architecture
-- ============================================================================
-- This migration creates diagnostic functions to find ALL errors in the system

-- Function to get all current errors
CREATE OR REPLACE FUNCTION debug_get_all_errors()
RETURNS TABLE (
  error_type TEXT,
  error_count BIGINT,
  latest_error TIMESTAMP WITH TIME ZONE,
  sample_error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'validation_errors'::TEXT,
    COUNT(*)::BIGINT,
    MAX(detected_at),
    MAX(error_message)
  FROM debug_validation_errors
  WHERE resolved_at IS NULL
  
  UNION ALL
  
  SELECT 
    'event_ordering_errors'::TEXT,
    COUNT(*)::BIGINT,
    MAX(detected_at),
    MAX(error_message)
  FROM debug_event_ordering_errors
  
  UNION ALL
  
  SELECT 
    'orphan_states'::TEXT,
    COUNT(*)::BIGINT,
    MAX(detected_at),
    MAX(orphan_type)
  FROM debug_orphan_states
  WHERE resolved_at IS NULL
  
  UNION ALL
  
  SELECT 
    'race_conditions'::TEXT,
    COUNT(*)::BIGINT,
    MAX(detected_at),
    MAX(resolution_action)
  FROM debug_race_conditions
  WHERE resolved = FALSE
  
  UNION ALL
  
  SELECT 
    'error_critical_events'::TEXT,
    COUNT(*)::BIGINT,
    MAX(timestamp),
    MAX(error_message)
  FROM debug_event_log
  WHERE severity IN ('ERROR', 'CRITICAL');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get users stuck in spin_active
CREATE OR REPLACE FUNCTION debug_get_stuck_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  status TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  seconds_waiting BIGINT,
  fairness_score NUMERIC,
  expansion_level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mq.user_id,
    u.email,
    mq.status,
    mq.joined_at,
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::BIGINT as seconds_waiting,
    mq.fairness_score,
    mq.expansion_level
  FROM matching_queue mq
  LEFT JOIN auth.users u ON mq.user_id = u.id
  WHERE mq.status = 'spin_active'
  AND mq.joined_at < NOW() - INTERVAL '2 minutes'
  ORDER BY mq.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find users who should match but haven't
CREATE OR REPLACE FUNCTION debug_find_missing_matches()
RETURNS TABLE (
  user1_id UUID,
  user1_email TEXT,
  user1_seeks TEXT,
  user1_gender TEXT,
  user2_id UUID,
  user2_email TEXT,
  user2_seeks TEXT,
  user2_gender TEXT,
  should_match BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    mq1.user_id as user1_id,
    u1.email as user1_email,
    COALESCE(mq1.expanded_preferences->>'gender_preference', 'unknown') as user1_seeks,
    p1.gender as user1_gender,
    mq2.user_id as user2_id,
    u2.email as user2_email,
    COALESCE(mq2.expanded_preferences->>'gender_preference', 'unknown') as user2_seeks,
    p2.gender as user2_gender,
    CASE 
      WHEN (p1.gender = 'male' AND p2.gender = 'female' AND 
            COALESCE(mq1.expanded_preferences->>'gender_preference', '') = 'female' AND 
            COALESCE(mq2.expanded_preferences->>'gender_preference', '') = 'male')
      THEN TRUE
      WHEN (p1.gender = 'female' AND p2.gender = 'male' AND 
            COALESCE(mq1.expanded_preferences->>'gender_preference', '') = 'male' AND 
            COALESCE(mq2.expanded_preferences->>'gender_preference', '') = 'female')
      THEN TRUE
      ELSE FALSE
    END as should_match
  FROM matching_queue mq1
  JOIN matching_queue mq2 ON mq1.user_id < mq2.user_id
  JOIN auth.users u1 ON mq1.user_id = u1.id
  JOIN auth.users u2 ON mq2.user_id = u2.id
  LEFT JOIN profiles p1 ON p1.id = mq1.user_id
  LEFT JOIN profiles p2 ON p2.id = mq2.user_id
  WHERE mq1.status = 'spin_active'
  AND mq2.status = 'spin_active'
  AND NOT EXISTS (
    SELECT 1 FROM matches m
    WHERE ((m.user1_id = mq1.user_id AND m.user2_id = mq2.user_id)
    OR (m.user1_id = mq2.user_id AND m.user2_id = mq1.user_id))
    AND m.status = 'pending'
  )
  ORDER BY mq1.joined_at ASC, mq2.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get detailed error report
CREATE OR REPLACE FUNCTION debug_get_error_report()
RETURNS JSONB AS $$
DECLARE
  v_report JSONB;
BEGIN
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT * FROM debug_get_all_errors()
      ) t
    ),
    'stuck_users', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT * FROM debug_get_stuck_users()
      ) t
    ),
    'missing_matches', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT * FROM debug_find_missing_matches()
        WHERE should_match = TRUE
      ) t
    ),
    'recent_errors', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT 
          id,
          timestamp,
          event_type,
          user_id,
          severity,
          error_message
        FROM debug_event_log
        WHERE severity IN ('ERROR', 'CRITICAL')
        ORDER BY timestamp DESC
        LIMIT 20
      ) t
    ),
    'validation_errors', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT 
          id,
          validator_name,
          error_type,
          error_message,
          affected_users,
          severity,
          detected_at
        FROM debug_validation_errors
        WHERE resolved_at IS NULL
        ORDER BY detected_at DESC
        LIMIT 20
      ) t
    )
  ) INTO v_report;
  
  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION debug_get_all_errors() TO authenticated;
GRANT EXECUTE ON FUNCTION debug_get_stuck_users() TO authenticated;
GRANT EXECUTE ON FUNCTION debug_find_missing_matches() TO authenticated;
GRANT EXECUTE ON FUNCTION debug_get_error_report() TO authenticated;

