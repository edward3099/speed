-- ============================================================================
-- Migration 005: Votes Table
-- ============================================================================
-- Part 5.1: Vote storage
-- ============================================================================

-- Votes table: stores yes or pass votes
-- NOTE: References profiles(id) since we're using profiles as users

-- First, ensure columns exist if table already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'votes') THEN
    -- Add match_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'match_id') THEN
      ALTER TABLE votes ADD COLUMN match_id BIGINT REFERENCES matches(id) ON DELETE CASCADE;
    END IF;
    -- Add voter_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'voter_id') THEN
      ALTER TABLE votes ADD COLUMN voter_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
    -- Add vote_type if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'vote_type') THEN
      ALTER TABLE votes ADD COLUMN vote_type TEXT CHECK (vote_type IN ('yes', 'pass'));
    END IF;
    -- Add created_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'created_at') THEN
      ALTER TABLE votes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Now create the table (will be no-op if it exists)
CREATE TABLE IF NOT EXISTS votes (
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('yes', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, voter_id)
);

-- Ensure columns exist one more time (in case table was just created)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'match_id') THEN
    ALTER TABLE votes ADD COLUMN match_id BIGINT REFERENCES matches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'voter_id') THEN
    ALTER TABLE votes ADD COLUMN voter_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'vote_type') THEN
    ALTER TABLE votes ADD COLUMN vote_type TEXT CHECK (vote_type IN ('yes', 'pass'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'created_at') THEN
    ALTER TABLE votes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'match_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_votes_match') THEN
      EXECUTE 'CREATE INDEX idx_votes_match ON votes(match_id)';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'votes' AND column_name = 'voter_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_votes_voter') THEN
      EXECUTE 'CREATE INDEX idx_votes_voter ON votes(voter_id)';
    END IF;
  END IF;
END $$;

COMMENT ON TABLE votes IS 'Vote storage - stores yes or pass votes for each match';
