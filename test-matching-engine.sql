-- ============================================================================
-- Test Script for Matching Engine
-- ============================================================================
-- This script tests the core functionality of the matching engine
-- ============================================================================

-- Test 1: Check if functions exist
SELECT 'Test 1: Functions exist' as test_name;
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('join_queue', 'process_matching', 'record_vote', 'guardian_job')
ORDER BY routine_name;

-- Test 2: Check if tables exist
SELECT 'Test 2: Tables exist' as test_name;
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('user_status', 'queue', 'matches', 'votes', 'never_pair_again', 'debug_logs')
ORDER BY table_name;

-- Test 3: Check background jobs are scheduled
SELECT 'Test 3: Background jobs scheduled' as test_name;
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE jobname IN ('guardian-job', 'matching-processor');

-- Test 4: Test guardian_job function (should return JSONB)
SELECT 'Test 4: Guardian job works' as test_name;
SELECT guardian_job() as result;

-- Test 5: Test process_matching function (should return integer)
SELECT 'Test 5: Process matching works' as test_name;
SELECT process_matching() as matched_count;

-- Test 6: Check current queue status
SELECT 'Test 6: Queue status' as test_name;
SELECT COUNT(*) as queue_size FROM queue;
SELECT COUNT(*) as active_matches FROM matches WHERE status IN ('pending', 'vote_active');
SELECT COUNT(*) as total_user_status FROM user_status;
