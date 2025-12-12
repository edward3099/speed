-- ============================================================================
-- Optimized Composite Indexes for Matching
-- ============================================================================
-- Based on Trade Matching Engine: Purposeful indexing for efficient queries
-- ============================================================================

-- Index for efficient matching queries (process_matching function)
-- This index optimizes the main matching query that orders by fairness and waiting_since
CREATE INDEX IF NOT EXISTS idx_queue_matching_priority 
ON queue (fairness DESC, waiting_since ASC)
WHERE user_id IN (
  SELECT user_id FROM users_state 
  WHERE state = 'waiting' 
  AND last_active > NOW() - INTERVAL '30 seconds'
);

-- Index for users_state matching queries
-- Optimizes the join between queue and users_state
CREATE INDEX IF NOT EXISTS idx_users_state_matching
ON users_state (state, last_active DESC)
WHERE state = 'waiting';

-- Composite index for match history checks
-- Optimizes the "never match again" check
CREATE INDEX IF NOT EXISTS idx_matches_user_pair
ON matches (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));

-- Index for active matches lookup
CREATE INDEX IF NOT EXISTS idx_matches_status_created
ON matches (status, created_at DESC)
WHERE status IN ('paired', 'vote_window', 'pending');

-- Index for queue cleanup (offline users)
CREATE INDEX IF NOT EXISTS idx_queue_waiting_since
ON queue (waiting_since ASC)
WHERE user_id IN (
  SELECT user_id FROM users_state 
  WHERE last_active < NOW() - INTERVAL '30 seconds'
);

-- Index for fairness-based queries
CREATE INDEX IF NOT EXISTS idx_queue_fairness_waiting
ON queue (fairness DESC, waiting_since ASC);

COMMENT ON INDEX idx_queue_matching_priority IS 'Optimizes matching queries that order by fairness and waiting_since';
COMMENT ON INDEX idx_users_state_matching IS 'Optimizes users_state joins for matching queries';
COMMENT ON INDEX idx_matches_user_pair IS 'Optimizes match history checks (never match again)';
COMMENT ON INDEX idx_matches_status_created IS 'Optimizes active matches lookup';
COMMENT ON INDEX idx_queue_fairness_waiting IS 'Optimizes fairness-based queue queries';

