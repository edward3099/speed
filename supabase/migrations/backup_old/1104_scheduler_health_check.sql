-- ============================================================================
-- Blueprint Migration 1104: Scheduler Health Check
-- ============================================================================
-- Part 9.6.2: Check if all schedulers are running
-- ============================================================================

-- Check if all schedulers are running
CREATE OR REPLACE FUNCTION check_scheduler_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedulers RECORD;
  v_health JSONB := '{}'::JSONB;
BEGIN
  -- Check pg_cron jobs
  SELECT 
    COUNT(*) FILTER (WHERE jobname IN (
      'cleanup-soft-offline',
      'check-vote-timeouts',
      'check-reveal-timeouts',
      'queue-monitoring',
      'gender-balancing',
      'queue-size-monitoring',
      'matching-orchestrator',
      'guardian-queue-consistency'
    )) AS active_count,
    COUNT(*) FILTER (WHERE jobname IN (
      'cleanup-soft-offline',
      'check-vote-timeouts',
      'check-reveal-timeouts',
      'queue-monitoring',
      'gender-balancing',
      'queue-size-monitoring',
      'matching-orchestrator',
      'guardian-queue-consistency'
    ) AND active = FALSE) AS inactive_count
  INTO v_schedulers
  FROM cron.job;
  
  v_health := jsonb_build_object(
    'active_schedulers', COALESCE(v_schedulers.active_count, 0),
    'inactive_schedulers', COALESCE(v_schedulers.inactive_count, 0),
    'total_expected', 8,
    'healthy', COALESCE(v_schedulers.inactive_count, 0) = 0,
    'checked_at', NOW()
  );
  
  RETURN v_health;
END;
$$;

COMMENT ON FUNCTION check_scheduler_health IS 'Checks if all background schedulers are running and healthy';

