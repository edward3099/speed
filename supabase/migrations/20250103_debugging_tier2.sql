-- ============================================================================
-- Debugging Architecture - Tier 2: Stability and Correctness (Components 16-30)
-- ============================================================================
-- Components: Event replay, scenario tests, chaos simulation, state history,
-- checksums, ghost cycle detection, timeout audit, dead state detection, etc.
-- ============================================================================

-- ============================================================================
-- Component #16: Event Replay and Time Travel
-- ============================================================================
-- Table to store replay sessions for time travel debugging
CREATE TABLE IF NOT EXISTS debug_replay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name TEXT NOT NULL,
  start_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  end_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  replay_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_replay_sessions_timestamp ON debug_replay_sessions(start_timestamp, end_timestamp);
COMMENT ON TABLE debug_replay_sessions IS 'Component #16: Event replay sessions for time travel debugging';

-- ============================================================================
-- Component #17: Deterministic Scenario Tests
-- ============================================================================
-- Table to store scenario test definitions
CREATE TABLE IF NOT EXISTS debug_scenario_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL UNIQUE,
  test_definition JSONB NOT NULL,
  expected_outcome JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0
);

CREATE INDEX idx_scenario_tests_name ON debug_scenario_tests(test_name);
COMMENT ON TABLE debug_scenario_tests IS 'Component #17: Predefined simulation scripts for testing';

-- Table to store scenario test execution results
CREATE TABLE IF NOT EXISTS debug_scenario_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES debug_scenario_tests(id) ON DELETE CASCADE,
  run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  passed BOOLEAN NOT NULL,
  actual_outcome JSONB,
  error_message TEXT,
  execution_time_ms INTEGER
);

CREATE INDEX idx_scenario_results_test ON debug_scenario_results(test_id, run_at DESC);
COMMENT ON TABLE debug_scenario_results IS 'Component #17: Execution results for scenario tests';

-- ============================================================================
-- Component #18: Chaos and Load Simulation
-- ============================================================================
-- Table to store chaos test configurations
CREATE TABLE IF NOT EXISTS debug_chaos_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  config JSONB NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  events_generated INTEGER DEFAULT 0,
  errors_detected INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_chaos_tests_status ON debug_chaos_tests(status, started_at DESC);
COMMENT ON TABLE debug_chaos_tests IS 'Component #18: Chaos and load simulation tests';

-- ============================================================================
-- Component #19: State History Ring Buffer
-- ============================================================================
-- Table to store recent state history (acts as ring buffer)
CREATE TABLE IF NOT EXISTS debug_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_snapshot JSONB NOT NULL,
  state_hash TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_log_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  buffer_index INTEGER
);

CREATE INDEX idx_state_history_timestamp ON debug_state_history(timestamp DESC);
CREATE INDEX idx_state_history_buffer_index ON debug_state_history(buffer_index);
COMMENT ON TABLE debug_state_history IS 'Component #19: Recent state snapshots in ring buffer format';

-- ============================================================================
-- Component #20: State Checksum Verifier (enhanced)
-- ============================================================================
-- Table to track checksum verification history
CREATE TABLE IF NOT EXISTS debug_checksum_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash TEXT NOT NULL,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  verification_result TEXT CHECK (verification_result IN ('valid', 'invalid', 'mismatch')),
  previous_hash TEXT,
  diff_data JSONB
);

CREATE INDEX idx_checksum_history_hash ON debug_checksum_history(state_hash);
CREATE INDEX idx_checksum_history_calculated ON debug_checksum_history(calculated_at DESC);
COMMENT ON TABLE debug_checksum_history IS 'Component #20: Checksum verification history';

-- ============================================================================
-- Component #21: Ghost Cycle Detector
-- ============================================================================
-- Table to store detected ghost cycles
CREATE TABLE IF NOT EXISTS debug_ghost_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  cycle_type TEXT NOT NULL CHECK (cycle_type IN ('queue_too_long', 'vote_timeout', 'pair_stuck', 'state_persist')),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  duration_seconds INTEGER NOT NULL,
  state_data JSONB,
  auto_cleaned BOOLEAN DEFAULT FALSE,
  cleaned_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ghost_cycles_detected ON debug_ghost_cycles(detected_at DESC);
CREATE INDEX idx_ghost_cycles_user ON debug_ghost_cycles(user_id, cycle_type);
COMMENT ON TABLE debug_ghost_cycles IS 'Component #21: Detected impossible cycles';

-- ============================================================================
-- Component #22: Timeout Audit Trail
-- ============================================================================
-- Enhanced timeout tracking with audit trail
CREATE TABLE IF NOT EXISTS debug_timeout_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timer_id UUID REFERENCES debug_time_events(id) ON DELETE SET NULL,
  timeout_type TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  cleared_at TIMESTAMP WITH TIME ZONE,
  cleared_reason TEXT,
  never_cleared BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_timeout_audit_created ON debug_timeout_audit(created_at DESC);
CREATE INDEX idx_timeout_audit_never_cleared ON debug_timeout_audit(never_cleared) WHERE never_cleared = TRUE;
COMMENT ON TABLE debug_timeout_audit IS 'Component #22: Audit trail for all timeouts';

-- ============================================================================
-- Component #23: Dead State Trap Detector
-- ============================================================================
-- Table to store detected dead states
CREATE TABLE IF NOT EXISTS debug_dead_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  state_description TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  state_data JSONB,
  recovery_action TEXT,
  recovered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_dead_states_detected ON debug_dead_states(detected_at DESC);
CREATE INDEX idx_dead_states_user ON debug_dead_states(user_id);
COMMENT ON TABLE debug_dead_states IS 'Component #23: Users in unreachable dead states';

-- ============================================================================
-- Component #24: Event Grouping and Freezing
-- ============================================================================
-- Table to store grouped event transactions
CREATE TABLE IF NOT EXISTS debug_event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  event_ids UUID[] NOT NULL,
  atomic_operation BOOLEAN DEFAULT TRUE,
  state_snapshot_before JSONB,
  state_snapshot_after JSONB
);

CREATE INDEX idx_event_groups_type ON debug_event_groups(group_type, started_at DESC);
COMMENT ON TABLE debug_event_groups IS 'Component #24: Grouped atomic event transactions';

-- ============================================================================
-- Component #25: Circular Dependency Checker
-- ============================================================================
-- Table to store detected circular dependencies in pairs
CREATE TABLE IF NOT EXISTS debug_circular_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  dependency_chain JSONB,
  resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_circular_deps_detected ON debug_circular_dependencies(detected_at DESC);
COMMENT ON TABLE debug_circular_dependencies IS 'Component #25: Detected circular pairing dependencies';

-- ============================================================================
-- Component #26: Priority Drift Monitor
-- ============================================================================
-- Table to monitor fairness and priority value drift
CREATE TABLE IF NOT EXISTS debug_priority_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  fairness_score NUMERIC NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  drift_detected BOOLEAN DEFAULT FALSE,
  drift_amount NUMERIC,
  reset_applied BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_priority_drift_user ON debug_priority_drift(user_id, recorded_at DESC);
CREATE INDEX idx_priority_drift_detected ON debug_priority_drift(drift_detected) WHERE drift_detected = TRUE;
COMMENT ON TABLE debug_priority_drift IS 'Component #26: Fairness and priority drift monitoring';

-- ============================================================================
-- Component #27: State Isolation Tests
-- ============================================================================
-- Table to store state isolation test results
CREATE TABLE IF NOT EXISTS debug_isolation_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  isolated_state JSONB,
  affected_users UUID[],
  detected_leakage BOOLEAN DEFAULT FALSE,
  test_result TEXT,
  run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_isolation_tests_run ON debug_isolation_tests(run_at DESC);
COMMENT ON TABLE debug_isolation_tests IS 'Component #27: State isolation test results';

-- ============================================================================
-- Component #28: State Auto Repair Rules
-- ============================================================================
-- Table to store auto-repair actions
CREATE TABLE IF NOT EXISTS debug_auto_repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_type TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  issue_detected JSONB NOT NULL,
  repair_action TEXT NOT NULL,
  state_before JSONB,
  state_after JSONB,
  repaired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  success BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_auto_repairs_type ON debug_auto_repairs(repair_type, repaired_at DESC);
CREATE INDEX idx_auto_repairs_user ON debug_auto_repairs(user_id);
COMMENT ON TABLE debug_auto_repairs IS 'Component #28: Automatic state repair actions';

-- ============================================================================
-- Component #29: Rollback Safeguard (enhanced)
-- ============================================================================
-- Enhanced rollback journal with safeguards
ALTER TABLE debug_rollback_journal 
  ADD COLUMN IF NOT EXISTS rollback_attempted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rollback_successful BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rollback_timestamp TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN debug_rollback_journal.rollback_attempted IS 'Component #29: Whether rollback was attempted';
COMMENT ON COLUMN debug_rollback_journal.rollback_successful IS 'Component #29: Whether rollback succeeded';

-- ============================================================================
-- Component #30: State Dimension Check
-- ============================================================================
-- Table to store state dimension verification results
CREATE TABLE IF NOT EXISTS debug_state_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  total_users INTEGER NOT NULL,
  queue_users INTEGER NOT NULL,
  paired_users INTEGER NOT NULL,
  vote_users INTEGER NOT NULL,
  video_users INTEGER NOT NULL,
  idle_users INTEGER NOT NULL,
  dimension_sum INTEGER GENERATED ALWAYS AS (
    queue_users + paired_users + vote_users + video_users + idle_users
  ) STORED,
  dimension_match BOOLEAN GENERATED ALWAYS AS (
    dimension_sum = total_users
  ) STORED,
  verification_passed BOOLEAN
);

CREATE INDEX idx_state_dimensions_timestamp ON debug_state_dimensions(verification_timestamp DESC);
CREATE INDEX idx_state_dimensions_match ON debug_state_dimensions(dimension_match) WHERE dimension_match = FALSE;
COMMENT ON TABLE debug_state_dimensions IS 'Component #30: State dimension verification (user counts must add up)';

-- ============================================================================
-- Helper Functions for Tier 2 Components
-- ============================================================================

-- Function: Record state history (ring buffer management)
CREATE OR REPLACE FUNCTION debug_record_state_history(
  p_state_snapshot JSONB,
  p_event_log_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
  v_state_hash TEXT;
  v_max_entries INTEGER := 200; -- Ring buffer size
  v_current_count INTEGER;
BEGIN
  v_state_hash := calculate_state_hash(p_state_snapshot);
  
  -- Check current count
  SELECT COUNT(*) INTO v_current_count FROM debug_state_history;
  
  -- If at max, delete oldest entry (ring buffer behavior)
  IF v_current_count >= v_max_entries THEN
    DELETE FROM debug_state_history
    WHERE id = (
      SELECT id FROM debug_state_history
      ORDER BY timestamp ASC
      LIMIT 1
    );
  END IF;
  
  -- Insert new entry
  INSERT INTO debug_state_history (
    state_snapshot,
    state_hash,
    event_log_id,
    buffer_index
  ) VALUES (
    p_state_snapshot,
    v_state_hash,
    p_event_log_id,
    v_current_count
  ) RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_record_state_history IS 'Component #19: Record state in ring buffer (max 200 entries)';

-- Function: Detect ghost cycles
CREATE OR REPLACE FUNCTION debug_detect_ghost_cycles()
RETURNS INTEGER AS $$
DECLARE
  v_detected_count INTEGER := 0;
  v_cycle_record RECORD;
BEGIN
  -- Detect: Users in queue too long (> 30 minutes)
  INSERT INTO debug_ghost_cycles (
    user_id,
    cycle_type,
    duration_seconds,
    state_data,
    auto_cleaned
  )
  SELECT 
    user_id,
    'queue_too_long',
    EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER,
    row_to_json(mq)::jsonb,
    FALSE
  FROM matching_queue mq
  WHERE status IN ('spin_active', 'queue_waiting')
  AND joined_at < NOW() - INTERVAL '30 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM debug_ghost_cycles gc
    WHERE gc.user_id = mq.user_id
    AND gc.cycle_type = 'queue_too_long'
    AND gc.cleaned_at IS NULL
  );
  
  GET DIAGNOSTICS v_detected_count = ROW_COUNT;
  
  -- Detect: Vote active too long (> 5 minutes)
  INSERT INTO debug_ghost_cycles (
    user_id,
    cycle_type,
    duration_seconds,
    state_data,
    auto_cleaned
  )
  SELECT 
    user_id,
    'vote_timeout',
    EXTRACT(EPOCH FROM (NOW() - updated_at))::INTEGER,
    row_to_json(mq)::jsonb,
    FALSE
  FROM matching_queue mq
  WHERE status = 'vote_active'
  AND updated_at < NOW() - INTERVAL '5 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM debug_ghost_cycles gc
    WHERE gc.user_id = mq.user_id
    AND gc.cycle_type = 'vote_timeout'
    AND gc.cleaned_at IS NULL
  );
  
  GET DIAGNOSTICS v_detected_count = v_detected_count + ROW_COUNT;
  
  RETURN v_detected_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_detect_ghost_cycles IS 'Component #21: Detect and log ghost cycles';

-- Function: Check state dimensions
CREATE OR REPLACE FUNCTION debug_check_state_dimensions()
RETURNS BOOLEAN AS $$
DECLARE
  v_total_users INTEGER;
  v_queue_users INTEGER;
  v_paired_users INTEGER;
  v_vote_users INTEGER;
  v_video_users INTEGER;
  v_idle_users INTEGER;
  v_dimension_sum INTEGER;
  v_match BOOLEAN;
BEGIN
  -- Get total active users
  SELECT COUNT(*) INTO v_total_users FROM profiles WHERE is_online = TRUE;
  
  -- Get users in each state
  SELECT COUNT(*) INTO v_queue_users FROM matching_queue WHERE status IN ('spin_active', 'queue_waiting');
  SELECT COUNT(*) INTO v_paired_users FROM matching_queue WHERE status = 'paired';
  SELECT COUNT(*) INTO v_vote_users FROM matching_queue WHERE status = 'vote_active';
  SELECT COUNT(*) INTO v_video_users FROM matching_queue WHERE status = 'video_date';
  SELECT COUNT(*) INTO v_idle_users FROM profiles WHERE is_online = TRUE AND NOT EXISTS (
    SELECT 1 FROM matching_queue WHERE user_id = profiles.id
  );
  
  v_dimension_sum := v_queue_users + v_paired_users + v_vote_users + v_video_users + v_idle_users;
  v_match := (v_dimension_sum = v_total_users);
  
  -- Record dimension check
  INSERT INTO debug_state_dimensions (
    total_users,
    queue_users,
    paired_users,
    vote_users,
    video_users,
    idle_users,
    verification_passed
  ) VALUES (
    v_total_users,
    v_queue_users,
    v_paired_users,
    v_vote_users,
    v_video_users,
    v_idle_users,
    v_match
  );
  
  IF NOT v_match THEN
    PERFORM debug_log_event(
      'dimension_mismatch',
      jsonb_build_object(
        'total', v_total_users,
        'sum', v_dimension_sum,
        'queue', v_queue_users,
        'paired', v_paired_users,
        'vote', v_vote_users,
        'video', v_video_users,
        'idle', v_idle_users
      ),
      NULL,
      NULL,
      'debug_state_dimensions',
      'VERIFICATION',
      NULL,
      NULL,
      'ERROR'
    );
  END IF;
  
  RETURN v_match;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_check_state_dimensions IS 'Component #30: Verify state dimensions add up correctly';

-- Function: Monitor priority drift
CREATE OR REPLACE FUNCTION debug_monitor_priority_drift()
RETURNS INTEGER AS $$
DECLARE
  v_drift_count INTEGER := 0;
  v_drift_threshold NUMERIC := 100.0; -- Fairness score threshold
BEGIN
  INSERT INTO debug_priority_drift (
    user_id,
    fairness_score,
    drift_detected,
    drift_amount
  )
  SELECT 
    user_id,
    fairness_score,
    TRUE,
    fairness_score
  FROM matching_queue
  WHERE ABS(fairness_score) > v_drift_threshold
  AND NOT EXISTS (
    SELECT 1 FROM debug_priority_drift pd
    WHERE pd.user_id = matching_queue.user_id
    AND pd.drift_detected = TRUE
    AND pd.reset_applied = FALSE
  );
  
  GET DIAGNOSTICS v_drift_count = ROW_COUNT;
  
  RETURN v_drift_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_monitor_priority_drift IS 'Component #26: Monitor fairness score drift';

-- ============================================================================
-- End of Tier 2 Migration
-- ============================================================================

