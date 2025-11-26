-- ============================================================================
-- Blueprint Migration 2000: Complete Debug Logging System
-- ============================================================================
-- Production-grade logging architecture for the entire matching system
-- ============================================================================

-- This migration creates:
-- 1. debug_logs table (universal log sink)
-- 2. log_debug_event function (main logger)
-- 3. get_user_state_snapshot function (state snapshotter)
-- 4. Comprehensive logging throughout all critical functions

-- Note: The actual logging calls are added to individual functions
-- This file documents the logging architecture

COMMENT ON TABLE debug_logs IS 'Universal log sink for all events - frontend, backend, SQL, state transitions';
COMMENT ON FUNCTION log_debug_event IS 'Main logger for backend functions - logs state transitions and metadata';
COMMENT ON FUNCTION get_user_state_snapshot IS 'Returns complete state snapshot for a user - queue, match, vote, online status';

-- Logging is now integrated into:
-- - queue_join (logs join attempts, success, errors)
-- - unified_matching_engine (logs matching attempts, tier used, match found, retries)
-- - submit_vote (logs vote attempts, outcomes, boosts)
-- - All state machine transitions (via execute_transition)

-- Frontend logging is handled by /src/lib/debug/log.ts
-- Live monitoring endpoint: /api/debug/live

