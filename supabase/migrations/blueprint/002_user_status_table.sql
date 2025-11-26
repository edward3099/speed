-- ============================================================================
-- Migration 002: User Status Table
-- ============================================================================
-- Part 5.1: State machine tracking
-- ============================================================================

-- User status table: tracks state of each user
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS user_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('idle', 'spin_active', 'queue_waiting', 'paired', 'vote_active', 'cooldown', 'offline')),
  last_state TEXT,
  last_state_change TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  online_status BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spin_started_at TIMESTAMPTZ,
  vote_window_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_status_state ON user_status(state);
CREATE INDEX IF NOT EXISTS idx_user_status_online ON user_status(online_status) WHERE online_status = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_status_spin_active ON user_status(state) WHERE state = 'spin_active';

COMMENT ON TABLE user_status IS 'State machine tracking - source of truth for user states';
