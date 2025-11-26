-- ============================================================================
-- Migration 005: Votes Table
-- ============================================================================
-- Part 5.1: Vote storage
-- ============================================================================

-- Votes table: stores yes or pass votes
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS votes (
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('yes', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_match ON votes(match_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);

COMMENT ON TABLE votes IS 'Vote storage - stores yes or pass votes for each match';
