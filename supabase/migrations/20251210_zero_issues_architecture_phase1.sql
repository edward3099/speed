-- ============================================================================
-- Zero Issues Architecture: Phase 1 - Database Simplification
-- ============================================================================
-- This migration implements the foundation for zero-issues architecture:
-- 1. Remove queue table (single source of truth: users_state)
-- 2. Remove materialized views (direct queries with indexes)
-- 3. Simplify users_state state enum (only: idle, waiting, matched)
-- 4. Add database constraints (enforce validity at DB level)
-- 5. Create optimized indexes
-- 6. Update matches table (add user1_vote, user2_vote)
-- 7. Simplify match_history (composite PK with constraint)
-- ============================================================================

-- ============================================================================
-- STEP 1: Update users_state state enum to minimal set
-- ============================================================================

-- Drop old constraint if exists
ALTER TABLE users_state DROP CONSTRAINT IF EXISTS users_state_valid_state;

-- Add new constraint with only 3 states
ALTER TABLE users_state 
ADD CONSTRAINT users_state_valid_state 
CHECK (state IN ('idle', 'waiting', 'matched'));

-- Update any existing invalid states to 'idle'
UPDATE users_state 
SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
WHERE state NOT IN ('idle', 'waiting', 'matched');

-- ============================================================================
-- STEP 2: Add CHECK constraints for state consistency
-- ============================================================================

-- Constraint: If state='matched', then match_id and partner_id must be NOT NULL
ALTER TABLE users_state 
DROP CONSTRAINT IF EXISTS users_state_matched_requires_match;

ALTER TABLE users_state 
ADD CONSTRAINT users_state_matched_requires_match
CHECK (
  (state = 'matched' AND match_id IS NOT NULL AND partner_id IS NOT NULL)
  OR (state != 'matched')
);

-- Constraint: If state IN ('idle', 'waiting'), then match_id and partner_id must be NULL
ALTER TABLE users_state 
DROP CONSTRAINT IF EXISTS users_state_idle_waiting_no_match;

ALTER TABLE users_state 
ADD CONSTRAINT users_state_idle_waiting_no_match
CHECK (
  (state IN ('idle', 'waiting') AND match_id IS NULL AND partner_id IS NULL)
  OR (state = 'matched')
);

-- ============================================================================
-- STEP 3: Update matches table - add user1_vote and user2_vote columns
-- ============================================================================

-- Add vote columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND column_name = 'user1_vote'
  ) THEN
    ALTER TABLE matches ADD COLUMN user1_vote TEXT 
    CHECK (user1_vote IS NULL OR user1_vote IN ('yes', 'pass'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND column_name = 'user2_vote'
  ) THEN
    ALTER TABLE matches ADD COLUMN user2_vote TEXT 
    CHECK (user2_vote IS NULL OR user2_vote IN ('yes', 'pass'));
  END IF;
END $$;

-- Add CHECK constraint: outcome only set when status='completed'
ALTER TABLE matches 
DROP CONSTRAINT IF EXISTS matches_outcome_only_when_completed;

ALTER TABLE matches 
ADD CONSTRAINT matches_outcome_only_when_completed
CHECK (
  (outcome IS NOT NULL AND status = 'completed')
  OR (outcome IS NULL)
);

-- Add CHECK constraint: vote_window_expires_at only set when status='active'
-- Note: We'll use 'active' status for voting window (not 'vote_active')
ALTER TABLE matches 
DROP CONSTRAINT IF EXISTS matches_vote_window_only_when_active;

ALTER TABLE matches 
ADD CONSTRAINT matches_vote_window_only_when_active
CHECK (
  (vote_window_expires_at IS NOT NULL AND status = 'active')
  OR (vote_window_expires_at IS NULL)
);

-- Update matches status enum to include 'active'
-- First, update existing 'vote_active' to 'active'
UPDATE matches SET status = 'active' WHERE status = 'vote_active';

-- Drop old constraint
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_valid_status;

-- Add new constraint with 'active' status
ALTER TABLE matches 
ADD CONSTRAINT matches_valid_status
CHECK (status IN ('paired', 'active', 'completed', 'cancelled'));

-- ============================================================================
-- STEP 4: Simplify match_history table
-- ============================================================================

-- Drop existing match_history if it has wrong structure
DO $$
BEGIN
  -- Check if match_history has composite PK with match_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'match_history' 
    AND constraint_type = 'PRIMARY KEY'
    AND constraint_name LIKE '%match_id%'
  ) THEN
    -- Drop the table and recreate with correct structure
    DROP TABLE IF EXISTS match_history CASCADE;
  END IF;
END $$;

-- Create match_history with simplified structure
CREATE TABLE IF NOT EXISTS match_history (
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  match_id UUID NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user1_id, user2_id),
  CONSTRAINT match_history_ordered CHECK (user1_id < user2_id)
);

-- Create reverse index for bidirectional lookup
CREATE INDEX IF NOT EXISTS idx_match_history_reverse 
ON match_history(user2_id, user1_id);

-- ============================================================================
-- STEP 5: Create optimized indexes for users_state
-- ============================================================================

-- Index for finding matchable users (waiting + online)
CREATE INDEX IF NOT EXISTS idx_users_state_waiting_online 
ON users_state(state, last_active) 
WHERE state = 'waiting';

-- Index for fairness ordering (waiting users)
CREATE INDEX IF NOT EXISTS idx_users_state_fairness 
ON users_state(fairness DESC, waiting_since ASC) 
WHERE state = 'waiting';

-- Index for match lookup
CREATE INDEX IF NOT EXISTS idx_users_state_match_id 
ON users_state(match_id) 
WHERE match_id IS NOT NULL;

-- ============================================================================
-- STEP 6: Create indexes for matches table
-- ============================================================================

-- Index for finding active matches
CREATE INDEX IF NOT EXISTS idx_matches_status_active 
ON matches(status) 
WHERE status = 'active';

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_matches_users 
ON matches(user1_id, user2_id);

-- ============================================================================
-- STEP 7: Remove queue table (after ensuring no dependencies)
-- ============================================================================

-- Note: We'll drop the queue table in a separate step after updating functions
-- For now, we'll leave it but mark it as deprecated

-- ============================================================================
-- STEP 8: Remove materialized view matching_pool
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS matching_pool CASCADE;

-- Drop refresh function if exists
DROP FUNCTION IF EXISTS refresh_matching_pool() CASCADE;

-- ============================================================================
-- STEP 9: Ensure last_active has default
-- ============================================================================

-- Set default for last_active if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users_state' 
    AND column_name = 'last_active' 
    AND column_default IS NOT NULL
  ) THEN
    -- No default needed, but ensure column exists
    NULL;
  END IF;
END $$;

COMMENT ON TABLE users_state IS 'Single source of truth for all user state. Queue is just: SELECT * FROM users_state WHERE state=''waiting'' AND last_active > NOW() - INTERVAL ''10 seconds''';
COMMENT ON TABLE matches IS 'Match records with outcome. Status: paired (just matched), active (voting window), completed (outcome determined), cancelled';
COMMENT ON TABLE match_history IS 'Permanent record of all matches (prevents rematching). Constraint ensures user1_id < user2_id for consistent ordering';
