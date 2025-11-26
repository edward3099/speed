-- ============================================================================
-- Blueprint Migration 001: Match History Tables
-- ============================================================================
-- Part 0.1: Track all matches (for 5-minute cooldown) and mutual yes-yes pairs
-- ============================================================================

-- Track all matches (for 5-minute cooldown)
CREATE TABLE IF NOT EXISTS match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id),
  user2_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user1_id, user2_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_match_history_users ON match_history(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_match_history_created ON match_history(created_at);

-- Track mutual yes-yes pairs (banned forever)
CREATE TABLE IF NOT EXISTS yes_yes_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id),
  user2_id UUID NOT NULL REFERENCES profiles(id),
  match_id UUID NOT NULL REFERENCES matches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS idx_yes_yes_pairs_users ON yes_yes_pairs(user1_id, user2_id);

COMMENT ON TABLE match_history IS 'Tracks all matches for 5-minute cooldown period';
COMMENT ON TABLE yes_yes_pairs IS 'Tracks mutual yes-yes pairs (banned forever)';

