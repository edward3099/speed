-- ============================================================================
-- Migration 004: Matches Table
-- ============================================================================
-- Part 5.1: Pairing table
-- ============================================================================

-- Matches table: stores pairings
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'vote_active', 'cancelled', 'ended')),
  vote_window_expires_at TIMESTAMPTZ,
  UNIQUE(user1_id),
  UNIQUE(user2_id),
  CHECK (user1_id < user2_id) -- Ensure consistent ordering
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_vote_window ON matches(vote_window_expires_at) WHERE vote_window_expires_at IS NOT NULL;

COMMENT ON TABLE matches IS 'Pairing table - enforces one active match per user';
