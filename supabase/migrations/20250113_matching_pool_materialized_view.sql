-- ============================================================================
-- Matching Pool Materialized View
-- ============================================================================
-- Optimized view for matching queries
-- Pre-filtered, pre-sorted, refreshed automatically
-- ============================================================================

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS matching_pool;

-- Create materialized view for matching pool
-- This pre-filters and pre-sorts users ready for matching
CREATE MATERIALIZED VIEW matching_pool AS
SELECT 
  q.user_id,
  q.fairness,
  q.waiting_since,
  us.state,
  us.last_active,
  us.partner_id,
  us.match_id
FROM queue q
INNER JOIN users_state us ON q.user_id = us.user_id
WHERE us.state = 'waiting'
  AND us.last_active > NOW() - INTERVAL '30 seconds' -- Only online users
ORDER BY q.fairness DESC, q.waiting_since ASC;

-- Create index on materialized view for fast lookups
CREATE INDEX IF NOT EXISTS idx_matching_pool_user_id ON matching_pool(user_id);
CREATE INDEX IF NOT EXISTS idx_matching_pool_priority ON matching_pool(fairness DESC, waiting_since ASC);
CREATE INDEX IF NOT EXISTS idx_matching_pool_state ON matching_pool(state, last_active DESC);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_matching_pool()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY matching_pool;
END;
$$;

COMMENT ON MATERIALIZED VIEW matching_pool IS 'Pre-filtered, pre-sorted pool of users ready for matching. Refresh every 1-2 seconds.';
COMMENT ON FUNCTION refresh_matching_pool IS 'Refreshes the matching pool materialized view. Should be called every 1-2 seconds.';

-- Initial refresh
REFRESH MATERIALIZED VIEW matching_pool;

