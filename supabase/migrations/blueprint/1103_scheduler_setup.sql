-- ============================================================================
-- Blueprint Migration 1103: Complete Scheduler Setup
-- ============================================================================
-- Part 9.6.1: All Background Schedulers (pg_cron)
-- ============================================================================

-- ============================================================================
-- Complete Scheduler Setup for Production
-- ============================================================================
-- Run these commands to set up all background schedulers using pg_cron
-- Note: Requires pg_cron extension to be enabled

-- 1. Soft Offline Cleanup (every 5 seconds)
-- SELECT cron.schedule(
--   'cleanup-soft-offline',
--   '*/5 * * * * *',
--   $$SELECT cleanup_expired_soft_offline();$$
-- );

-- 2. Vote Timeout Checks (every 10 seconds)
-- SELECT cron.schedule(
--   'check-vote-timeouts',
--   '*/10 * * * * *',
--   $$SELECT check_vote_timeouts();$$
-- );

-- 3. Reveal Timeout Checks (every 10 seconds)
-- SELECT cron.schedule(
--   'check-reveal-timeouts',
--   '*/10 * * * * *',
--   $$SELECT check_reveal_timeouts();$$
-- );

-- 4. Queue Metrics Collection (every 30 seconds)
-- SELECT cron.schedule(
--   'queue-monitoring',
--   '*/30 * * * * *',
--   $$SELECT collect_queue_metrics();$$
-- );

-- 5. Gender Ratio Balancing (every 60 seconds)
-- SELECT cron.schedule(
--   'gender-balancing',
--   '*/60 * * * * *',
--   $$SELECT apply_gender_ratio_balancing();$$
-- );

-- 6. Queue Size Monitoring (every 60 seconds)
-- SELECT cron.schedule(
--   'queue-size-monitoring',
--   '*/60 * * * * *',
--   $$SELECT monitor_queue_size();$$
-- );

-- 7. Matching Orchestrator (every 5 seconds)
-- SELECT cron.schedule(
--   'matching-orchestrator',
--   '*/5 * * * * *',
--   $$SELECT matching_orchestrator();$$
-- );

-- 8. Guardian Queue Consistency (every 30 seconds)
-- SELECT cron.schedule(
--   'guardian-queue-consistency',
--   '*/30 * * * * *',
--   $$SELECT guardian_queue_consistency();$$
-- );

-- ============================================================================
-- To unschedule all jobs (for maintenance or updates):
-- ============================================================================
-- SELECT cron.unschedule('cleanup-soft-offline');
-- SELECT cron.unschedule('check-vote-timeouts');
-- SELECT cron.unschedule('check-reveal-timeouts');
-- SELECT cron.unschedule('queue-monitoring');
-- SELECT cron.unschedule('gender-balancing');
-- SELECT cron.unschedule('queue-size-monitoring');
-- SELECT cron.unschedule('matching-orchestrator');
-- SELECT cron.unschedule('guardian-queue-consistency');

COMMENT ON FUNCTION cleanup_expired_soft_offline IS 'Scheduler: Cleanup expired soft_offline users (every 5 seconds)';
COMMENT ON FUNCTION check_vote_timeouts IS 'Scheduler: Check vote timeouts (every 10 seconds)';
COMMENT ON FUNCTION check_reveal_timeouts IS 'Scheduler: Check reveal timeouts (every 10 seconds)';
COMMENT ON FUNCTION collect_queue_metrics IS 'Scheduler: Collect queue metrics (every 30 seconds)';
COMMENT ON FUNCTION apply_gender_ratio_balancing IS 'Scheduler: Apply gender ratio balancing (every 60 seconds)';
COMMENT ON FUNCTION monitor_queue_size IS 'Scheduler: Monitor queue size (every 60 seconds)';
COMMENT ON FUNCTION matching_orchestrator IS 'Scheduler: Matching orchestrator (every 5 seconds)';
COMMENT ON FUNCTION guardian_queue_consistency IS 'Scheduler: Guardian queue consistency (every 30 seconds)';

