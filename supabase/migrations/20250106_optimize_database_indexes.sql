-- ============================================================================
-- Database Optimization: Composite Indexes
-- ============================================================================
-- Based on trade-matching-engine patterns
-- Optimizes matching, voting, and queue queries
-- ============================================================================

-- 1. Optimize users_state queries for matching
-- Composite index for fast matching lookups
CREATE INDEX IF NOT EXISTS idx_users_state_matching 
ON users_state(state, match_id, created_at) 
WHERE state IN ('waiting', 'matched', 'paired', 'vote_window');

-- Index for online user checks (used in matching)
CREATE INDEX IF NOT EXISTS idx_users_state_last_active_state 
ON users_state(last_active, state) 
WHERE state = 'waiting' AND last_active > NOW() - INTERVAL '30 seconds';

-- 2. Optimize matches queries for outcome resolution
-- Composite index for fast outcome lookups
CREATE INDEX IF NOT EXISTS idx_matches_outcome_status 
ON matches(outcome, status, created_at) 
WHERE outcome IS NOT NULL;

-- Index for recent both_yes matches (used in get_user_match_status)
CREATE INDEX IF NOT EXISTS idx_matches_both_yes_recent 
ON matches(outcome, status, created_at) 
WHERE outcome = 'both_yes' AND status = 'completed' AND created_at > NOW() - INTERVAL '2 minutes';

-- 3. Optimize queue queries for matching
-- Composite index for queue processing (fairness-time priority)
CREATE INDEX IF NOT EXISTS idx_queue_matching_priority 
ON queue(fairness DESC, waiting_since ASC, user_id) 
WHERE user_id IN (
  SELECT user_id FROM users_state 
  WHERE state = 'waiting' AND last_active > NOW() - INTERVAL '30 seconds'
);

-- 4. Optimize votes queries
-- Composite index for vote lookups
CREATE INDEX IF NOT EXISTS idx_votes_match_user 
ON votes(match_id, user_id, created_at);

-- Index for vote resolution queries
CREATE INDEX IF NOT EXISTS idx_votes_match_outcome 
ON votes(match_id, vote, created_at) 
WHERE match_id IS NOT NULL;

-- 5. Optimize video_dates queries
-- Composite index for video date status lookups
CREATE INDEX IF NOT EXISTS idx_video_dates_status_match 
ON video_dates(status, match_id, created_at) 
WHERE status IN ('countdown', 'active', 'ended_early');

-- Index for video date time sync queries
CREATE INDEX IF NOT EXISTS idx_video_dates_started_at 
ON video_dates(started_at, status) 
WHERE started_at IS NOT NULL;

-- 6. Optimize match history queries (prevent duplicate matches)
-- Composite index for match history lookups
CREATE INDEX IF NOT EXISTS idx_matches_user_pair 
ON matches(user1_id, user2_id, created_at);

-- Index for reverse lookup (user2_id, user1_id)
CREATE INDEX IF NOT EXISTS idx_matches_user_pair_reverse 
ON matches(user2_id, user1_id, created_at);

-- 7. Optimize never_pair_again queries
-- Index for exclusion checks
CREATE INDEX IF NOT EXISTS idx_never_pair_user_pair 
ON never_pair_again(user1_id, user2_id);

-- 8. Optimize users_state updates
-- Index for frequent state updates
CREATE INDEX IF NOT EXISTS idx_users_state_user_updated 
ON users_state(user_id, updated_at DESC);

-- Comments
COMMENT ON INDEX idx_users_state_matching IS 'Optimizes matching queries by state and match_id';
COMMENT ON INDEX idx_matches_outcome_status IS 'Optimizes outcome resolution queries';
COMMENT ON INDEX idx_queue_matching_priority IS 'Optimizes queue processing with fairness-time priority';
COMMENT ON INDEX idx_votes_match_user IS 'Optimizes vote lookups by match and user';
COMMENT ON INDEX idx_video_dates_status_match IS 'Optimizes video date status queries';
COMMENT ON INDEX idx_matches_user_pair IS 'Optimizes match history lookups to prevent duplicates';

