-- ============================================================================
-- Blueprint Migration 003: Logging Table Schema
-- ============================================================================
-- Part 0.2: Comprehensive event logging for debugging and monitoring
-- ============================================================================

-- Comprehensive event logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS spark_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_category TEXT,
  event_message TEXT,
  event_data JSONB DEFAULT '{}'::JSONB,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT DEFAULT 'INFO' CHECK (severity IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  function_name TEXT,
  success BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'backend' CHECK (source IN ('frontend', 'backend', 'scheduler', 'guardian'))
);

-- Performance indexes for logging queries
CREATE INDEX IF NOT EXISTS idx_spark_event_log_timestamp ON spark_event_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_user_id ON spark_event_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_event_type ON spark_event_log(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_match_id ON spark_event_log(match_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spark_event_log_severity ON spark_event_log(severity, timestamp DESC) WHERE severity IN ('ERROR', 'CRITICAL');
CREATE INDEX IF NOT EXISTS idx_spark_event_log_state_transition ON spark_event_log((event_data->>'from_state'), (event_data->>'to_state'), timestamp DESC) WHERE event_type = 'state_transition';

COMMENT ON TABLE spark_event_log IS 'Comprehensive event logging for debugging, monitoring, and rule compliance';
COMMENT ON INDEX idx_spark_event_log_timestamp IS 'Fast queries for recent events';
COMMENT ON INDEX idx_spark_event_log_user_id IS 'Fast queries for user-specific events';
COMMENT ON INDEX idx_spark_event_log_event_type IS 'Fast queries by event type';
COMMENT ON INDEX idx_spark_event_log_match_id IS 'Fast queries for match-related events';
COMMENT ON INDEX idx_spark_event_log_severity IS 'Fast queries for errors and critical events';
COMMENT ON INDEX idx_spark_event_log_state_transition IS 'Fast queries for state transition debugging';

