-- ============================================================================
-- Blueprint Migration 1105: Setup Cron Jobs
-- ============================================================================
-- Part 9.6.1: Enable pg_cron and schedule all background jobs
-- ============================================================================

-- Enable pg_cron extension (if available)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any existing jobs with the same names (to avoid duplicates)
DO $$
BEGIN
  -- Try to unschedule jobs (ignore errors if they don't exist)
  BEGIN
    PERFORM cron.unschedule('cleanup-soft-offline');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('check-vote-timeouts');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('check-reveal-timeouts');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('queue-monitoring');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('gender-balancing');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('queue-size-monitoring');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('matching-orchestrator');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    PERFORM cron.unschedule('guardian-queue-consistency');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Schedule all background jobs
-- 1. Soft Offline Cleanup (every 5 seconds)
SELECT cron.schedule(
  'cleanup-soft-offline',
  '*/5 * * * * *',
  $$SELECT cleanup_expired_soft_offline();$$
);

-- 2. Vote Timeout Checks (every 10 seconds)
SELECT cron.schedule(
  'check-vote-timeouts',
  '*/10 * * * * *',
  $$SELECT check_vote_timeouts();$$
);

-- 3. Reveal Timeout Checks (every 10 seconds)
SELECT cron.schedule(
  'check-reveal-timeouts',
  '*/10 * * * * *',
  $$SELECT check_reveal_timeouts();$$
);

-- 4. Queue Metrics Collection (every 30 seconds)
SELECT cron.schedule(
  'queue-monitoring',
  '*/30 * * * * *',
  $$SELECT collect_queue_metrics();$$
);

-- 5. Gender Ratio Balancing (every 60 seconds)
SELECT cron.schedule(
  'gender-balancing',
  '*/60 * * * * *',
  $$SELECT apply_gender_ratio_balancing();$$
);

-- 6. Queue Size Monitoring (every 60 seconds)
SELECT cron.schedule(
  'queue-size-monitoring',
  '*/60 * * * * *',
  $$SELECT monitor_queue_size();$$
);

-- 7. Matching Orchestrator (every 5 seconds)
SELECT cron.schedule(
  'matching-orchestrator',
  '*/5 * * * * *',
  $$SELECT matching_orchestrator();$$
);

-- 8. Guardian Queue Consistency (every 30 seconds)
SELECT cron.schedule(
  'guardian-queue-consistency',
  '*/30 * * * * *',
  $$SELECT guardian_queue_consistency();$$
);

COMMENT ON EXTENSION pg_cron IS 'Background job scheduler for matching system';

