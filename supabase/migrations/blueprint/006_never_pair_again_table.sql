-- ============================================================================
-- Migration 006: Never Pair Again Table
-- ============================================================================
-- Part 5.1: Permanent blocklist
-- ============================================================================

-- Never pair again table: permanent ban list
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS never_pair_again (
  user1 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user1, user2),
  CHECK (user1 < user2) -- Ensure symmetric storage (lowest UUID first)
);

CREATE INDEX IF NOT EXISTS idx_never_pair_again_user1 ON never_pair_again(user1);
CREATE INDEX IF NOT EXISTS idx_never_pair_again_user2 ON never_pair_again(user2);

COMMENT ON TABLE never_pair_again IS 'Permanent blocklist - pairs that can never be matched again';
