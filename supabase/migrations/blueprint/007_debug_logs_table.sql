-- ============================================================================
-- Migration 007: Debug Logs Table
-- ============================================================================
-- Part 5.1: System observability
-- ============================================================================

-- Debug logs table: central debug table for all events
-- NOTE: References profiles(id) since we're using profiles as users
CREATE TABLE IF NOT EXISTS debug_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  state_before JSONB,
  state_after JSONB,
  metadata JSONB,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_user ON debug_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_event_type ON debug_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_debug_logs_timestamp ON debug_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_severity ON debug_logs(severity);

COMMENT ON TABLE debug_logs IS 'Central debug table for all events - system observability';
