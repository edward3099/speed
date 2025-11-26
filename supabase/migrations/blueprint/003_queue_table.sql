-- ============================================================================
-- Migration 003: Queue Table
-- ============================================================================
-- Part 5.1: Waiting room for spin_active users
-- ============================================================================

-- Queue table: all spin_active users go here
CREATE TABLE IF NOT EXISTS queue (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fairness_score INTEGER NOT NULL DEFAULT 0,
  spin_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preference_stage INTEGER NOT NULL DEFAULT 0 CHECK (preference_stage IN (0, 1, 2, 3)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_fairness ON queue(fairness_score DESC);
CREATE INDEX IF NOT EXISTS idx_queue_spin_started ON queue(spin_started_at);
CREATE INDEX IF NOT EXISTS idx_queue_preference_stage ON queue(preference_stage);

-- Constraint: user_id must be unique (enforced by PRIMARY KEY)
-- Additional constraint: user must be in spin_active or queue_waiting state
-- This will be enforced by application logic and triggers

COMMENT ON TABLE queue IS 'Waiting room for spin_active users - stores fairness, wait time, preference stage';
