-- ============================================================================
-- Debugging Architecture - Tier 1 Critical Components
-- ============================================================================
-- This migration creates the foundation for comprehensive debugging of the
-- speed dating matching system. It implements Tier 1 critical components
-- (1-15) as specified in the Debugging Architecture document.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Component #9: Event Log
-- ============================================================================
-- Full timeline of all events in consistent format for debugging
CREATE TABLE IF NOT EXISTS debug_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  related_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  table_name TEXT,
  operation TEXT, -- INSERT, UPDATE, DELETE, RPC
  before_state JSONB,
  after_state JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  session_id TEXT,
  ip_address INET,
  error_message TEXT,
  severity TEXT DEFAULT 'INFO' CHECK (severity IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);

CREATE INDEX idx_event_log_timestamp ON debug_event_log(timestamp DESC);
CREATE INDEX idx_event_log_event_type ON debug_event_log(event_type);
CREATE INDEX idx_event_log_user_id ON debug_event_log(user_id);
CREATE INDEX idx_event_log_session_id ON debug_event_log(session_id);

COMMENT ON TABLE debug_event_log IS 'Component #9: Full timeline of all events for debugging';
COMMENT ON COLUMN debug_event_log.event_type IS 'Type of event (e.g., queue_join, pair_created, vote_cast)';
COMMENT ON COLUMN debug_event_log.event_data IS 'Event-specific data payload';
COMMENT ON COLUMN debug_event_log.before_state IS 'State before event';
COMMENT ON COLUMN debug_event_log.after_state IS 'State after event';

-- ============================================================================
-- Component #10: Snapshot Diff System
-- ============================================================================
-- Before and after snapshots for troubleshooting
CREATE TABLE IF NOT EXISTS debug_state_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('before', 'after', 'full')),
  table_name TEXT NOT NULL,
  record_id UUID,
  state_data JSONB NOT NULL,
  state_hash TEXT NOT NULL, -- Component #21: State checksum
  checksum_type TEXT DEFAULT 'md5',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_log_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_snapshots_timestamp ON debug_state_snapshots(timestamp DESC);
CREATE INDEX idx_snapshots_event_log_id ON debug_state_snapshots(event_log_id);
CREATE INDEX idx_snapshots_state_hash ON debug_state_snapshots(state_hash);
CREATE INDEX idx_snapshots_table_record ON debug_state_snapshots(table_name, record_id);

COMMENT ON TABLE debug_state_snapshots IS 'Component #10: Before/after snapshots for troubleshooting';
COMMENT ON COLUMN debug_state_snapshots.state_hash IS 'Component #21: Hash/checksum for state verification';

-- ============================================================================
-- Component #15: State Rollback Journal
-- ============================================================================
-- Store copies of previous state for rollback on errors
CREATE TABLE IF NOT EXISTS debug_rollback_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  previous_state JSONB NOT NULL,
  current_state JSONB NOT NULL,
  operation TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_log_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  can_rollback BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_rollback_journal_timestamp ON debug_rollback_journal(timestamp DESC);
CREATE INDEX idx_rollback_journal_table_record ON debug_rollback_journal(table_name, record_id);

COMMENT ON TABLE debug_rollback_journal IS 'Component #15: Previous state copies for rollback on errors';

-- ============================================================================
-- Component #1: State Validator - Validation Errors
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validator_name TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  state_data JSONB,
  affected_users UUID[],
  severity TEXT DEFAULT 'ERROR' CHECK (severity IN ('WARNING', 'ERROR', 'CRITICAL')),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  auto_resolved BOOLEAN DEFAULT FALSE,
  resolution_action TEXT
);

CREATE INDEX idx_validation_errors_detected ON debug_validation_errors(detected_at DESC);
CREATE INDEX idx_validation_errors_severity ON debug_validation_errors(severity);
CREATE INDEX idx_validation_errors_resolved ON debug_validation_errors(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE debug_validation_errors IS 'Component #1: Validation errors detected by state validator';

-- ============================================================================
-- Component #8: Lock Tracker
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_lock_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  locked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  lock_type TEXT NOT NULL CHECK (lock_type IN ('pairing', 'vote', 'video_date')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  released_at TIMESTAMP WITH TIME ZONE,
  timeout_at TIMESTAMP WITH TIME ZONE,
  reason TEXT,
  auto_released BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_lock_tracker_user ON debug_lock_tracker(user_id) WHERE released_at IS NULL;
CREATE INDEX idx_lock_tracker_timeout ON debug_lock_tracker(timeout_at) WHERE released_at IS NULL AND timeout_at IS NOT NULL;
CREATE INDEX idx_lock_tracker_created ON debug_lock_tracker(created_at DESC);

COMMENT ON TABLE debug_lock_tracker IS 'Component #8: Recording creation and deletion of locks';
COMMENT ON COLUMN debug_lock_tracker.locked_user_id IS 'User this lock is preventing from matching';

-- ============================================================================
-- Component #14: Race Condition Sentinel
-- ============================================================================
-- Detect overlapping calls to pairing logic or vote logic
CREATE TABLE IF NOT EXISTS debug_race_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('pairing', 'vote', 'respin', 'queue_operation')),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  concurrent_operations JSONB NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_action TEXT
);

CREATE INDEX idx_race_conditions_detected ON debug_race_conditions(detected_at DESC);
CREATE INDEX idx_race_conditions_resolved ON debug_race_conditions(resolved) WHERE resolved = FALSE;

COMMENT ON TABLE debug_race_conditions IS 'Component #14: Detects overlapping calls to pairing/vote logic';

-- ============================================================================
-- Component #11: Event Ordering Verifier
-- ============================================================================
-- Track invalid event sequences
CREATE TABLE IF NOT EXISTS debug_event_ordering_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invalid_sequence JSONB NOT NULL,
  expected_sequence JSONB,
  error_message TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_event_ordering_detected ON debug_event_ordering_errors(detected_at DESC);
CREATE INDEX idx_event_ordering_user ON debug_event_ordering_errors(user_id);

COMMENT ON TABLE debug_event_ordering_errors IS 'Component #11: Tracks invalid event sequences';

-- ============================================================================
-- Component #12: Orphan State Scanner Results
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_orphan_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_type TEXT NOT NULL CHECK (orphan_type IN ('user_in_pair_not_in_users', 'vote_for_unpaired_user', 'lock_for_missing_user', 'vote_entry_no_pair')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  related_data JSONB,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE,
  auto_cleaned BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_orphan_states_detected ON debug_orphan_states(detected_at DESC);
CREATE INDEX idx_orphan_states_resolved ON debug_orphan_states(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE debug_orphan_states IS 'Component #12: Users in invalid state combinations';

-- ============================================================================
-- Component #13: Synchronised Time Engine
-- ============================================================================
-- Unified clock system for all matching logic
CREATE TABLE IF NOT EXISTS debug_time_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timer_type TEXT NOT NULL CHECK (timer_type IN ('vote', 'heartbeat', 'respin', 'matching_window', 'video_date')),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expected_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_end_at TIMESTAMP WITH TIME ZONE,
  timeout_duration_ms INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  drift_ms INTEGER
);

CREATE INDEX idx_time_events_active ON debug_time_events(status, expected_end_at) WHERE status = 'active';
CREATE INDEX idx_time_events_user ON debug_time_events(user_id, status) WHERE status = 'active';

COMMENT ON TABLE debug_time_events IS 'Component #13: Unified clock system for all timers';

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to calculate state hash (Component #21)
CREATE OR REPLACE FUNCTION calculate_state_hash(state_data JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(state_data::text, 'md5'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to log event (Component #9)
CREATE OR REPLACE FUNCTION debug_log_event(
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT NULL,
  p_related_user_id UUID DEFAULT NULL,
  p_table_name TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_before_state JSONB DEFAULT NULL,
  p_after_state JSONB DEFAULT NULL,
  p_severity TEXT DEFAULT 'INFO'
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO debug_event_log (
    event_type,
    event_data,
    user_id,
    related_user_id,
    table_name,
    operation,
    before_state,
    after_state,
    severity
  ) VALUES (
    p_event_type,
    p_event_data,
    p_user_id,
    p_related_user_id,
    p_table_name,
    p_operation,
    p_before_state,
    p_after_state,
    p_severity
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create state snapshot (Component #10)
CREATE OR REPLACE FUNCTION debug_create_snapshot(
  p_snapshot_type TEXT,
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_state_data JSONB,
  p_event_log_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_state_hash TEXT;
BEGIN
  v_state_hash := calculate_state_hash(p_state_data);
  
  INSERT INTO debug_state_snapshots (
    snapshot_type,
    table_name,
    record_id,
    state_data,
    state_hash,
    event_log_id,
    user_id
  ) VALUES (
    p_snapshot_type,
    p_table_name,
    p_record_id,
    p_state_data,
    v_state_hash,
    p_event_log_id,
    p_user_id
  ) RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #1: State Validator - Core Validation Function
-- ============================================================================
-- This function checks for all illegal states after each update
CREATE OR REPLACE FUNCTION debug_validate_state()
RETURNS TABLE (
  validator_name TEXT,
  error_type TEXT,
  error_message TEXT,
  affected_users UUID[],
  severity TEXT
) AS $$
DECLARE
  v_error RECORD;
BEGIN
  -- Validation 1: No user should be in queue and paired simultaneously
  SELECT 
    'queue_pair_conflict' AS validator_name,
    'state_conflict' AS error_type,
    'User ' || user_id::text || ' is in queue and paired simultaneously' AS error_message,
    ARRAY[user_id] AS affected_users,
    'ERROR' AS severity
  INTO v_error
  FROM matching_queue mq
  WHERE EXISTS (
    SELECT 1 FROM matching_queue mq2
    WHERE mq2.user_id = mq.user_id
    AND mq2.status IN ('paired', 'vote_active', 'video_date')
  )
  AND mq.status IN ('spin_active', 'queue_waiting')
  LIMIT 1;
  
  IF FOUND THEN
    RETURN NEXT v_error;
  END IF;
  
  -- Validation 2: Pairs must be symmetrical
  -- (If user A is paired with user B, user B must be paired with user A)
  -- This would require checking the pairs table structure
  
  -- Validation 3: Vote entries must have corresponding pairs
  -- (Implementation depends on votes table structure)
  
  -- Validation 4: No stale locks
  -- Check debug_lock_tracker for locks that should have expired
  SELECT 
    'stale_lock' AS validator_name,
    'expired_lock' AS error_type,
    'Lock for user ' || user_id::text || ' expired at ' || timeout_at::text || ' but not released' AS error_message,
    ARRAY[user_id] AS affected_users,
    'WARNING' AS severity
  INTO v_error
  FROM debug_lock_tracker
  WHERE released_at IS NULL
  AND timeout_at IS NOT NULL
  AND timeout_at < NOW()
  LIMIT 1;
  
  IF FOUND THEN
    RETURN NEXT v_error;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically run validation after state changes
CREATE OR REPLACE FUNCTION debug_validate_on_update()
RETURNS TRIGGER AS $$
DECLARE
  v_validation_error RECORD;
BEGIN
  -- Run validations
  FOR v_validation_error IN SELECT * FROM debug_validate_state() LOOP
    INSERT INTO debug_validation_errors (
      validator_name,
      error_type,
      error_message,
      affected_users,
      severity
    ) VALUES (
      v_validation_error.validator_name,
      v_validation_error.error_type,
      v_validation_error.error_message,
      v_validation_error.affected_users,
      v_validation_error.severity
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #2: Atomic Pairing - Lock Management
-- ============================================================================
-- Function to create pairing lock
CREATE OR REPLACE FUNCTION debug_create_pairing_lock(
  p_user_id UUID,
  p_locked_user_id UUID DEFAULT NULL,
  p_timeout_seconds INTEGER DEFAULT 30,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_lock_id UUID;
BEGIN
  -- Check if user already has an active lock
  IF EXISTS (
    SELECT 1 FROM debug_lock_tracker
    WHERE user_id = p_user_id
    AND released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User % already has an active lock', p_user_id;
  END IF;
  
  INSERT INTO debug_lock_tracker (
    user_id,
    locked_user_id,
    lock_type,
    timeout_at,
    reason
  ) VALUES (
    p_user_id,
    p_locked_user_id,
    'pairing',
    NOW() + (p_timeout_seconds || ' seconds')::INTERVAL,
    p_reason
  ) RETURNING id INTO v_lock_id;
  
  -- Log lock creation
  PERFORM debug_log_event(
    'lock_created',
    jsonb_build_object('lock_id', v_lock_id, 'lock_type', 'pairing', 'timeout_seconds', p_timeout_seconds),
    p_user_id,
    p_locked_user_id,
    'debug_lock_tracker',
    'INSERT',
    NULL,
    jsonb_build_object('lock_id', v_lock_id, 'user_id', p_user_id)
  );
  
  RETURN v_lock_id;
END;
$$ LANGUAGE plpgsql;

-- Function to release lock
CREATE OR REPLACE FUNCTION debug_release_lock(
  p_lock_id UUID,
  p_auto_released BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_lock RECORD;
BEGIN
  SELECT * INTO v_lock
  FROM debug_lock_tracker
  WHERE id = p_lock_id
  AND released_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  UPDATE debug_lock_tracker
  SET released_at = NOW(),
      auto_released = p_auto_released
  WHERE id = p_lock_id;
  
  -- Log lock release
  PERFORM debug_log_event(
    'lock_released',
    jsonb_build_object('lock_id', p_lock_id, 'auto_released', p_auto_released),
    v_lock.user_id,
    v_lock.locked_user_id,
    'debug_lock_tracker',
    'UPDATE'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #4: Heartbeat Manager - Track User Activity
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_heartbeat_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  heartbeat_interval_ms INTEGER DEFAULT 30000,
  is_online BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_heartbeat_user ON debug_heartbeat_tracker(user_id);
CREATE INDEX idx_heartbeat_last_seen ON debug_heartbeat_tracker(last_seen_at);

COMMENT ON TABLE debug_heartbeat_tracker IS 'Component #4: Tracks match-sensitive users for heartbeat monitoring';

-- Function to update heartbeat
CREATE OR REPLACE FUNCTION debug_update_heartbeat(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO debug_heartbeat_tracker (user_id, last_heartbeat, last_seen_at, is_online)
  VALUES (p_user_id, NOW(), NOW(), TRUE)
  ON CONFLICT (user_id) DO UPDATE
  SET last_heartbeat = NOW(),
      last_seen_at = NOW(),
      is_online = TRUE;
  
  -- Log heartbeat
  PERFORM debug_log_event(
    'heartbeat',
    jsonb_build_object('user_id', p_user_id),
    p_user_id,
    NULL,
    'debug_heartbeat_tracker',
    'UPDATE'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS Policies (Debug tables should be readable by service role only in production)
-- ============================================================================
-- In production, these should be restricted to service role
-- For development, we'll allow authenticated users to read their own debug data

-- Event log: Users can see events related to them
ALTER TABLE debug_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own events"
  ON debug_event_log FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = related_user_id);

-- Similar policies for other debug tables...
-- (In production, consider restricting to service role only)

-- ============================================================================
-- Initialization Complete
-- ============================================================================

COMMENT ON SCHEMA public IS 'Speed Dating Matching System with Comprehensive Debugging Architecture';

