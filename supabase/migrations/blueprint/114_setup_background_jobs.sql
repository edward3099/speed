-- ============================================================================
-- Migration 114: Setup Background Jobs
-- ============================================================================
-- Sets up pg_cron jobs to run guardians and matching processor
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule guardian_job to run every 10 seconds
-- This cleans up offline users, stale matches, and enforces consistency
SELECT cron.schedule(
  'guardian-job',
  '*/10 * * * * *', -- Every 10 seconds
  $$SELECT guardian_job();$$
);

-- Schedule process_matching to run every 2 seconds
-- This processes the matching queue and creates pairs
SELECT cron.schedule(
  'matching-processor',
  '*/2 * * * * *', -- Every 2 seconds
  $$SELECT process_matching();$$
);

-- Verify jobs are scheduled
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE jobname IN ('guardian-job', 'matching-processor');

COMMENT ON EXTENSION pg_cron IS 'Background job scheduler for matching engine';
