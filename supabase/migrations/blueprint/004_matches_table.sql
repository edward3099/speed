-- ============================================================================
-- Migration 004: Matches Table
-- ============================================================================
-- Part 5.1: Pairing table
-- ============================================================================

-- Matches table: stores pairings
-- NOTE: References profiles(id) since we're using profiles as users

-- First, ensure the column exists before creating table or indexes
DO $$
BEGIN
  -- If table exists but column doesn't, add it
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'matches') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'vote_window_expires_at') THEN
      ALTER TABLE matches ADD COLUMN vote_window_expires_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;

-- Now create the table (will be no-op if it exists, but ensures column is there for new tables)
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

-- Ensure column exists one more time (in case table was just created)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'vote_window_expires_at') THEN
    ALTER TABLE matches ADD COLUMN vote_window_expires_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- Only create vote_window index if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'vote_window_expires_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_matches_vote_window') THEN
      EXECUTE 'CREATE INDEX idx_matches_vote_window ON matches(vote_window_expires_at) WHERE vote_window_expires_at IS NOT NULL';
    END IF;
  END IF;
END $$;

COMMENT ON TABLE matches IS 'Pairing table - enforces one active match per user';
