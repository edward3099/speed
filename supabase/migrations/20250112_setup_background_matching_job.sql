-- ============================================================================
-- Setup Background Matching Job
-- ============================================================================
-- 
-- This migration sets up the background matching job using pg_cron
-- to call process_unmatched_users() every 10 seconds
--
-- ============================================================================

-- Check if pg_cron extension is available and enable it
DO $$
BEGIN
  -- Try to enable pg_cron extension
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  
  -- Schedule the background matching job to run every 10 seconds
  -- This will process users who have been waiting 5+ seconds
  PERFORM cron.schedule(
    'process-unmatched-users',
    '*/10 * * * * *', -- Every 10 seconds (cron format: second minute hour day month weekday)
    'SELECT process_unmatched_users();'
  );
  
  RAISE NOTICE 'Background matching job scheduled successfully';
EXCEPTION
  WHEN OTHERS THEN
    -- pg_cron might not be available in all Supabase plans
    RAISE WARNING 'pg_cron extension not available. Use alternative method (Next.js API route or external cron).';
    RAISE WARNING 'Error: %', SQLERRM;
END $$;

-- ============================================================================
-- Alternative: Manual Setup Instructions
-- ============================================================================
-- 
-- If pg_cron is not available, use one of these alternatives:
--
-- 1. Next.js API Route (see: src/app/api/background-matching/route.ts)
--    - Call this endpoint every 10-30 seconds via external cron service
--    - Or use Vercel Cron Jobs if deployed on Vercel
--
-- 2. External Cron Service
--    - Use a service like EasyCron, Cronitor, or GitHub Actions
--    - Call: POST https://your-app.com/api/background-matching
--
-- 3. Application-Level Scheduler
--    - Use node-cron in your Next.js app (only if app runs continuously)
--
-- ============================================================================

-- ============================================================================
-- Monitoring: Schedule Metrics Recording
-- ============================================================================

DO $$
BEGIN
  -- Schedule metrics recording every minute
  PERFORM cron.schedule(
    'record-matching-metrics',
    '*/1 * * * *', -- Every minute
    'SELECT record_matching_metrics();'
  );
  
  RAISE NOTICE 'Metrics recording scheduled successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Could not schedule metrics recording: %', SQLERRM;
END $$;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check if jobs are scheduled
-- SELECT * FROM cron.job WHERE jobname IN ('process-unmatched-users', 'record-matching-metrics');

-- Manually test the background matching function
-- SELECT process_unmatched_users() as matches_created;

-- Check current match rate
-- SELECT get_current_match_rate() as current_match_rate;

