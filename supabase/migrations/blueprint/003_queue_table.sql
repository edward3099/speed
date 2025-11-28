-- ============================================================================
-- Migration 003: Queue Table
-- ============================================================================
-- Part 5.1: Waiting room for spin_active users
-- ============================================================================

-- Queue table: all spin_active users go here
-- NOTE: References profiles(id) since we're using profiles as users
-- Check if matching_queue exists - if so, migrate data or create queue alongside
DO $$
BEGIN
  -- If matching_queue exists, we can migrate data or use both
  -- For now, create new queue table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'queue') THEN
    CREATE TABLE queue (
      user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      fairness_score INTEGER NOT NULL DEFAULT 0,
      spin_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      preference_stage INTEGER NOT NULL DEFAULT 0 CHECK (preference_stage IN (0, 1, 2, 3)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_queue_fairness ON queue(fairness_score DESC);
    CREATE INDEX IF NOT EXISTS idx_queue_spin_started ON queue(spin_started_at);
    CREATE INDEX IF NOT EXISTS idx_queue_preference_stage ON queue(preference_stage);
    
    COMMENT ON TABLE queue IS 'Waiting room for spin_active users - stores fairness, wait time, preference stage';
  END IF;
END $$;
