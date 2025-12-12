-- ============================================================================
-- Cleanup Old Backend Functions (Optional)
-- ============================================================================
-- These functions are no longer used in Zero Issues Architecture
-- They can be dropped, but leaving them doesn't cause issues
-- ============================================================================
-- 
-- Note: This migration is optional. The old functions don't interfere
-- with the new architecture since they're not called. However, dropping
-- them cleans up the codebase and prevents confusion.
-- ============================================================================

-- Drop old matching function (replaced by event-driven try_match_user)
DROP FUNCTION IF EXISTS process_matching() CASCADE;

-- Drop old vote function (replaced by record_vote)
DROP FUNCTION IF EXISTS record_vote_and_resolve(UUID, UUID, TEXT) CASCADE;

-- Drop old refresh function (matching_pool removed)
DROP FUNCTION IF EXISTS refresh_matching_pool() CASCADE;

-- Note: queue table still exists but is not used
-- Can be dropped in a future migration if desired:
-- DROP TABLE IF EXISTS queue CASCADE;

COMMENT ON SCHEMA public IS 'Zero Issues Architecture: Event-driven matching, minimal state machine, database constraints. Old functions removed.';







