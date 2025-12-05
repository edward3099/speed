-- ============================================================================
-- Spin Logic Preventive Constraints & Indexes
-- ============================================================================
-- Phase 1.1: Database-level enforcement to prevent issues at the source
-- ============================================================================

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================

-- Prevent duplicate queue entries
-- If constraint already exists, this will fail gracefully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'queue_user_id_key' 
    AND conrelid = 'queue'::regclass
  ) THEN
    ALTER TABLE queue ADD CONSTRAINT queue_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Prevent duplicate votes (same user voting twice for same match)
-- If constraint already exists, this will fail gracefully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'votes_match_id_voter_id_key' 
    AND conrelid = 'votes'::regclass
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_match_id_voter_id_key UNIQUE (match_id, voter_id);
  END IF;
END $$;

-- Prevent duplicate matches (same pair matched twice)
-- Use unique partial index to prevent active duplicate pairs
CREATE UNIQUE INDEX IF NOT EXISTS unique_match_pair_active 
ON matches (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))
WHERE status != 'cancelled';

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Ensure match_id exists when user is paired
-- Only add if column exists and constraint doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users_state' AND column_name = 'match_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_state_match_id_fkey' 
    AND conrelid = 'users_state'::regclass
  ) THEN
    ALTER TABLE users_state 
    ADD CONSTRAINT users_state_match_id_fkey 
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure partner_id exists
-- Only add if column exists and constraint doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users_state' AND column_name = 'partner_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_state_partner_id_fkey' 
    AND conrelid = 'users_state'::regclass
  ) THEN
    ALTER TABLE users_state 
    ADD CONSTRAINT users_state_partner_id_fkey 
    FOREIGN KEY (partner_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

-- Ensure state is valid
-- Only add if column exists and constraint doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users_state' AND column_name = 'state'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_state_valid_state' 
    AND conrelid = 'users_state'::regclass
  ) THEN
    ALTER TABLE users_state 
    ADD CONSTRAINT users_state_valid_state 
    CHECK (state IN ('idle', 'waiting', 'paired', 'vote_window', 'video_date', 'ended'));
  END IF;
END $$;

-- Ensure vote is valid
-- Only add if column exists and constraint doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'votes' AND column_name = 'vote'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'votes_valid_vote' 
    AND conrelid = 'votes'::regclass
  ) THEN
    ALTER TABLE votes 
    ADD CONSTRAINT votes_valid_vote 
    CHECK (vote IN ('yes', 'pass'));
  END IF;
END $$;

-- Ensure fairness is within range
-- Only add if column exists and constraint doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users_state' AND column_name = 'fairness'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_state_valid_fairness' 
    AND conrelid = 'users_state'::regclass
  ) THEN
    ALTER TABLE users_state 
    ADD CONSTRAINT users_state_valid_fairness 
    CHECK (fairness >= 0 AND fairness <= 20);
  END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Fast queue lookups by user_id
CREATE INDEX IF NOT EXISTS idx_queue_user_id ON queue(user_id);

-- Fast matching queries (sorted by fairness DESC, waiting_since ASC)
CREATE INDEX IF NOT EXISTS idx_queue_matching 
ON queue(fairness DESC, waiting_since ASC) 
WHERE user_id IS NOT NULL;

-- Fast online status checks
CREATE INDEX IF NOT EXISTS idx_users_state_state_last_active 
ON users_state(state, last_active) 
WHERE state IN ('waiting', 'paired', 'vote_window');

-- Fast match queries by status and creation time
CREATE INDEX IF NOT EXISTS idx_matches_status_created_at 
ON matches(status, created_at) 
WHERE status IN ('pending', 'vote_active');

-- Fast vote lookups
CREATE INDEX IF NOT EXISTS idx_votes_match_id_voter_id 
ON votes(match_id, voter_id);

-- Index for vote_window expiration checks
CREATE INDEX IF NOT EXISTS idx_matches_vote_window_expires 
ON matches(vote_window_expires_at) 
WHERE vote_window_expires_at IS NOT NULL AND status = 'vote_active';

-- Index for finding offline users
CREATE INDEX IF NOT EXISTS idx_users_state_last_active 
ON users_state(last_active) 
WHERE state IN ('waiting', 'paired', 'vote_window');

COMMENT ON INDEX idx_queue_matching IS 'Optimized index for matching queries - sorts by fairness and waiting time';
COMMENT ON INDEX idx_users_state_state_last_active IS 'Optimized index for online status checks and queue processing';
COMMENT ON INDEX idx_matches_vote_window_expires IS 'Optimized index for finding expired vote windows';

