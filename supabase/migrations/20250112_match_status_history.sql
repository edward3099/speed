-- ============================================================================
-- Match Status History Tracking
-- ============================================================================
-- Based on Trade Matching Engine pattern: Track all status transitions
-- ============================================================================

-- Create match_status_history table
CREATE TABLE IF NOT EXISTS match_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'pending', 'paired', 'vote_window', 'completed', 'cancelled'
  outcome TEXT, -- 'both_yes', 'yes_pass', 'pass_pass', 'idle_idle', NULL
  actor TEXT NOT NULL, -- 'USER' | 'SYSTEM'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_match_status_history_match_id 
ON match_status_history(match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_status_history_status 
ON match_status_history(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_status_history_actor 
ON match_status_history(actor, created_at DESC);

COMMENT ON TABLE match_status_history IS 'Tracks all status transitions for matches with actor information';
COMMENT ON COLUMN match_status_history.actor IS 'Who triggered the status change: USER or SYSTEM';
COMMENT ON COLUMN match_status_history.status IS 'Match status: pending, paired, vote_window, completed, cancelled';
COMMENT ON COLUMN match_status_history.outcome IS 'Match outcome: both_yes, yes_pass, pass_pass, idle_idle';

-- ============================================================================
-- Function to log status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION log_match_status_change(
  p_match_id UUID,
  p_status TEXT,
  p_actor TEXT DEFAULT 'SYSTEM',
  p_outcome TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO match_status_history (
    match_id,
    status,
    outcome,
    actor,
    metadata,
    created_at
  )
  VALUES (
    p_match_id,
    p_status,
    p_outcome,
    p_actor,
    p_metadata,
    NOW()
  );
EXCEPTION WHEN OTHERS THEN
  -- If table doesn't exist or other error, log but don't fail
  RAISE WARNING 'Failed to log match status change: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION log_match_status_change IS 'Logs a match status change with actor information';

-- ============================================================================
-- Trigger to automatically log status changes on matches table
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_log_match_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Log status change if status changed
  IF (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.outcome IS DISTINCT FROM NEW.outcome)) THEN
    PERFORM log_match_status_change(
      NEW.match_id,
      NEW.status,
      'SYSTEM',
      NEW.outcome,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_outcome', OLD.outcome,
        'new_outcome', NEW.outcome
      )
    );
  ELSIF (TG_OP = 'INSERT') THEN
    -- Log initial status
    PERFORM log_match_status_change(
      NEW.match_id,
      NEW.status,
      'SYSTEM',
      NEW.outcome,
      jsonb_build_object(
        'user1_id', NEW.user1_id,
        'user2_id', NEW.user2_id,
        'created_at', NEW.created_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_log_match_status ON matches;
CREATE TRIGGER trg_log_match_status
  AFTER INSERT OR UPDATE OF status, outcome ON matches
  FOR EACH ROW
  EXECUTE FUNCTION trigger_log_match_status();

COMMENT ON TRIGGER trg_log_match_status ON matches IS 'Automatically logs all status and outcome changes on matches table';

