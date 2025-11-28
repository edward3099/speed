-- ============================================================================
-- Cleanup Migration: Remove All Spin Logic
-- ============================================================================
-- This migration drops all spin-related tables, functions, and triggers
-- to allow a complete rebuild from scratch
-- ============================================================================

-- Drop all spin-related functions first (to avoid dependency issues)
DROP FUNCTION IF EXISTS create_pair_atomic(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS find_best_match(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS process_matching() CASCADE;
DROP FUNCTION IF EXISTS update_preference_stage(UUID) CASCADE;
DROP FUNCTION IF EXISTS calculate_fairness_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS apply_yes_boost(UUID) CASCADE;
DROP FUNCTION IF EXISTS record_vote(UUID, BIGINT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS record_vote(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS handle_idle_voter(UUID, BIGINT) CASCADE;
DROP FUNCTION IF EXISTS handle_idle_voter(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS set_cooldown(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS add_to_blocklist(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS join_queue(UUID) CASCADE;
DROP FUNCTION IF EXISTS remove_from_queue(UUID) CASCADE;
DROP FUNCTION IF EXISTS execute_state_transition(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS guardian_job() CASCADE;
DROP FUNCTION IF EXISTS guardian_remove_offline() CASCADE;
DROP FUNCTION IF EXISTS guardian_remove_stale_matches() CASCADE;
DROP FUNCTION IF EXISTS guardian_enforce_expansion() CASCADE;
DROP FUNCTION IF EXISTS handle_disconnect(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_voting_window_remaining(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS get_voting_window_remaining(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_active_match(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_queue_status(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_matches() CASCADE;
DROP FUNCTION IF EXISTS cleanup_stale_matches() CASCADE;
DROP FUNCTION IF EXISTS cleanup_stale_queue_entries() CASCADE;
DROP FUNCTION IF EXISTS heartbeat_update(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_age(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_distance(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS discover_profiles(UUID, INTEGER, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS validate_queue_integrity() CASCADE;

-- Drop all spin-related tables (in dependency order)
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS queue CASCADE;
DROP TABLE IF EXISTS matching_queue CASCADE;
DROP TABLE IF EXISTS never_pair_again CASCADE;
DROP TABLE IF EXISTS user_status CASCADE;
DROP TABLE IF EXISTS debug_logs CASCADE;
DROP TABLE IF EXISTS match_history CASCADE;
DROP TABLE IF EXISTS yes_yes_pairs CASCADE;
DROP TABLE IF EXISTS queue_state_log CASCADE;
DROP TABLE IF EXISTS matching_metrics CASCADE;
DROP TABLE IF EXISTS match_lifecycle_log CASCADE;
DROP TABLE IF EXISTS state_transition_log CASCADE;
DROP TABLE IF EXISTS operation_log CASCADE;
DROP TABLE IF EXISTS execution_log CASCADE;
DROP TABLE IF EXISTS queue_metrics CASCADE;

-- Drop views if they exist
DROP VIEW IF EXISTS users CASCADE;

-- Drop any remaining spin-related functions (catch-all)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT proname, oidvectortypes(proargtypes) as argtypes
              FROM pg_proc
              WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
              AND proname IN (
                  'create_pair_atomic', 'find_best_match', 'process_matching',
                  'update_preference_stage', 'calculate_fairness_score', 'apply_yes_boost',
                  'record_vote', 'handle_idle_voter', 'set_cooldown', 'add_to_blocklist',
                  'join_queue', 'remove_from_queue', 'execute_state_transition',
                  'guardian_job', 'guardian_remove_offline', 'guardian_remove_stale_matches',
                  'guardian_enforce_expansion', 'handle_disconnect', 'get_voting_window_remaining',
                  'get_active_match', 'get_queue_status', 'cleanup_expired_matches',
                  'cleanup_stale_matches', 'cleanup_stale_queue_entries', 'heartbeat_update',
                  'get_user_age', 'get_user_distance', 'discover_profiles', 'validate_queue_integrity'
              )
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
    END LOOP;
END $$;

-- Note: We keep profiles, user_preferences, and other non-spin tables
-- We keep video_dates, contact_details, blocked_users, etc. as they're not part of spin logic

COMMENT ON SCHEMA public IS 'Spin logic tables and functions have been removed. Ready for rebuild.';

