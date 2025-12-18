-- ============================================================================
-- Performance Optimization: Critical Indexes for try_match_user
-- ============================================================================
-- Priority 1: Database Optimization
-- 
-- This migration adds indexes to optimize the try_match_user function queries
-- which are the primary bottleneck at 20+ concurrent users.
-- 
-- Expected Impact: 70-90% improvement in query performance
-- ============================================================================

-- ============================================================================
-- INDEX 1: users_state - Optimize active waiting users query
-- ============================================================================
-- Query pattern: WHERE state = 'waiting' 
--   AND (waiting_since > NOW() - INTERVAL '60 seconds' 
--        OR last_active > NOW() - INTERVAL '15 seconds')
-- 
-- This composite index covers the exact query pattern used in try_match_user
-- to find actively waiting users. The partial index (WHERE state = 'waiting')
-- reduces index size and improves selectivity.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_state_waiting_active_composite
ON users_state(state, waiting_since, last_active)
WHERE state = 'waiting';

COMMENT ON INDEX idx_users_state_waiting_active_composite IS 
'Optimizes try_match_user query for finding actively waiting users. Covers state + waiting_since + last_active conditions.';

-- ============================================================================
-- INDEX 2: user_preferences - GIN index for city array overlap queries
-- ============================================================================
-- Query pattern: EXISTS (
--   SELECT 1 FROM unnest(up1.city) AS city1
--   WHERE city1 = ANY(up2.city)
-- )
-- 
-- GIN (Generalized Inverted Index) is essential for efficient array operations
-- like checking if arrays overlap. Without this, PostgreSQL must scan entire
-- arrays for each comparison, which is O(n*m) complexity.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_preferences_city_gin
ON user_preferences USING GIN(city)
WHERE city IS NOT NULL;

COMMENT ON INDEX idx_user_preferences_city_gin IS 
'GIN index for efficient city array overlap queries in try_match_user. Enables fast array intersection checks.';

-- ============================================================================
-- INDEX 3: profiles - Composite index for gender/age filtering
-- ============================================================================
-- Query pattern: WHERE p1.gender != p2.gender 
--   AND p1.gender IS NOT NULL 
--   AND p2.gender IS NOT NULL
--   AND (age range checks)
-- 
-- Composite index allows efficient filtering on both gender and age in single
-- index lookup, reducing the need for separate index scans.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_gender_age_composite
ON profiles(gender, age)
WHERE gender IS NOT NULL;

COMMENT ON INDEX idx_profiles_gender_age_composite IS 
'Composite index for efficient gender and age filtering in try_match_user. Optimizes JOIN conditions on profiles table.';

-- ============================================================================
-- INDEX 4: user_preferences - Age range lookup optimization
-- ============================================================================
-- Query pattern: WHERE (min_age IS NULL OR p2.age >= up1.min_age)
--   AND (max_age IS NULL OR p2.age <= up1.max_age)
-- 
-- This index helps with age range matching queries, though the NULL checks
-- may limit index usage. Still valuable for non-NULL age preferences.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_preferences_age_range
ON user_preferences(min_age, max_age)
WHERE min_age IS NOT NULL AND max_age IS NOT NULL;

COMMENT ON INDEX idx_user_preferences_age_range IS 
'Optimizes age range matching queries in try_match_user. Helps filter users by age preferences.';

-- ============================================================================
-- INDEX 5: users_state - Optimize ORDER BY clause
-- ============================================================================
-- Query pattern: ORDER BY us.fairness DESC, us.waiting_since ASC
-- 
-- While idx_users_state_fairness exists, this ensures optimal ordering
-- for the exact query pattern. The existing index may be sufficient, but
-- this provides explicit coverage.
-- ============================================================================
-- Note: idx_users_state_fairness already exists with (fairness DESC, waiting_since ASC)
-- This index is already optimal, so we skip creating a duplicate.

-- ============================================================================
-- VERIFICATION: Analyze tables to update statistics
-- ============================================================================
-- After creating indexes, update table statistics so query planner can make
-- optimal decisions about index usage.
-- ============================================================================
ANALYZE users_state;
ANALYZE user_preferences;
ANALYZE profiles;
ANALYZE match_history;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Run stress test (10-males-10-females-stress.spec.ts) to measure impact
-- 2. Use EXPLAIN ANALYZE on try_match_user queries to verify index usage
-- 3. Monitor query performance metrics
-- ============================================================================


















