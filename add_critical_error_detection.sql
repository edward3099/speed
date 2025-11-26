-- Add critical error detection for matching failures
-- This function detects when users are in queue but not being matched

CREATE OR REPLACE FUNCTION detect_matching_failure()
RETURNS TABLE (
  error_type TEXT,
  error_message TEXT,
  error_data JSONB,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  queue_count INTEGER;
  eligible_users INTEGER;
  recent_match_count INTEGER;
  last_match_time TIMESTAMPTZ;
BEGIN
  -- Count users in queue
  SELECT COUNT(*) INTO queue_count
  FROM queue;
  
  -- Count eligible users (passing all filters)
  SELECT COUNT(*) INTO eligible_users
  FROM queue q
  INNER JOIN profiles u ON u.id = q.user_id
  INNER JOIN user_status us ON us.user_id = q.user_id
  WHERE u.online = TRUE
    AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
    AND us.state IN ('spin_active', 'queue_waiting');
  
  -- Count recent matches (last 30 seconds)
  SELECT COUNT(*), MAX(matched_at) INTO recent_match_count, last_match_time
  FROM matches
  WHERE matched_at > NOW() - INTERVAL '30 seconds'
    AND status IN ('pending', 'vote_active');
  
  -- Critical Error 1: Multiple eligible users but no recent matches
  IF eligible_users >= 2 AND recent_match_count = 0 THEN
    RETURN QUERY SELECT 
      'matching_stuck'::TEXT,
      'Multiple eligible users in queue but no matches created in last 30 seconds'::TEXT,
      jsonb_build_object(
        'queue_count', queue_count,
        'eligible_users', eligible_users,
        'recent_matches', recent_match_count,
        'last_match_time', last_match_time
      ),
      'error'::TEXT;
  END IF;
  
  -- Critical Error 2: Users waiting too long (>60 seconds)
  IF EXISTS (
    SELECT 1 FROM queue q
    WHERE EXTRACT(EPOCH FROM (NOW() - q.spin_started_at)) > 60
  ) THEN
    RETURN QUERY SELECT 
      'users_waiting_too_long'::TEXT,
      'Users have been waiting in queue for over 60 seconds'::TEXT,
      jsonb_build_object(
        'long_waiting_users', (
          SELECT jsonb_agg(jsonb_build_object(
            'user_id', q.user_id,
            'wait_seconds', EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER
          ))
          FROM queue q
          WHERE EXTRACT(EPOCH FROM (NOW() - q.spin_started_at)) > 60
        )
      ),
      'warning'::TEXT;
  END IF;
  
  -- Critical Error 3: Background job not running
  IF NOT EXISTS (
    SELECT 1 FROM cron.job 
    WHERE jobname = 'matching-processor' 
      AND active = TRUE
  ) THEN
    RETURN QUERY SELECT 
      'background_job_inactive'::TEXT,
      'Matching background job is not active'::TEXT,
      jsonb_build_object(),
      'error'::TEXT;
  END IF;
  
  RETURN;
END;
$$;

-- Create a function to log critical errors automatically
CREATE OR REPLACE FUNCTION log_critical_errors()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  error_record RECORD;
BEGIN
  FOR error_record IN SELECT * FROM detect_matching_failure() LOOP
    -- Only log if this error hasn't been logged in the last 30 seconds
    IF NOT EXISTS (
      SELECT 1 FROM debug_logs
      WHERE event_type = error_record.error_type
        AND timestamp > NOW() - INTERVAL '30 seconds'
    ) THEN
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES (
        error_record.error_type,
        jsonb_build_object(
          'message', error_record.error_message,
          'data', error_record.error_data
        ),
        error_record.severity
      );
    END IF;
  END LOOP;
END;
$$;

-- Schedule automatic critical error detection (every 10 seconds)
DO $$
DECLARE
  job_exists BOOLEAN;
  job_id BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'critical-error-detector'
  ) INTO job_exists;
  
  IF NOT job_exists THEN
    SELECT cron.schedule(
      'critical-error-detector',
      '*/10 * * * * *', -- Every 10 seconds
      'SELECT log_critical_errors();'
    ) INTO job_id;
  END IF;
END $$;
