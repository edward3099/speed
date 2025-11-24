-- ============================================================================
-- Debugging Architecture - Tier 3: Scalability and Debugging Depth (Components 31-45)
-- ============================================================================

-- ============================================================================
-- Component #31: Debug Snapshot Reporter (already exists as Dashboard)
-- ============================================================================
-- Enhanced with database storage for reports
CREATE TABLE IF NOT EXISTS debug_snapshot_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  report_data JSONB NOT NULL,
  formatted_text TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_snapshot_reports_type ON debug_snapshot_reports(report_type, generated_at DESC);
COMMENT ON TABLE debug_snapshot_reports IS 'Component #31: Stored snapshot reports';

-- ============================================================================
-- Component #32: Metrics Guardrails
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_metrics_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  threshold_exceeded BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  alert_triggered BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_metrics_guardrails_name ON debug_metrics_guardrails(metric_name, recorded_at DESC);
CREATE INDEX idx_metrics_guardrails_exceeded ON debug_metrics_guardrails(threshold_exceeded) WHERE threshold_exceeded = TRUE;
COMMENT ON TABLE debug_metrics_guardrails IS 'Component #32: Metrics and guardrails monitoring';

-- ============================================================================
-- Component #33: State Impact Tracing
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_impact_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_log_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  impact_path JSONB NOT NULL,
  affected_tables TEXT[],
  affected_users UUID[],
  propagation_depth INTEGER,
  traced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_impact_traces_event ON debug_impact_traces(event_log_id);
COMMENT ON TABLE debug_impact_traces IS 'Component #33: Event impact propagation traces';

-- ============================================================================
-- Component #34: Delayed Cleanup Queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_delayed_cleanup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_type TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  cleanup_data JSONB NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  success BOOLEAN
);

CREATE INDEX idx_delayed_cleanup_scheduled ON debug_delayed_cleanup(scheduled_at) WHERE executed_at IS NULL;
COMMENT ON TABLE debug_delayed_cleanup IS 'Component #34: Delayed cleanup jobs for disconnected users';

-- ============================================================================
-- Component #35: Synthetic User Simulator
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_synthetic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID NOT NULL,
  synthetic_user_id UUID,
  behavior_script JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_action_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_synthetic_users_simulation ON debug_synthetic_users(simulation_id);
COMMENT ON TABLE debug_synthetic_users IS 'Component #35: Synthetic user simulation data';

-- ============================================================================
-- Component #36: Memory Leak Sentinel
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_memory_leak_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  queue_size INTEGER NOT NULL,
  pair_count INTEGER NOT NULL,
  lock_count INTEGER NOT NULL,
  total_objects INTEGER GENERATED ALWAYS AS (queue_size + pair_count + lock_count) STORED,
  growth_rate NUMERIC,
  leak_detected BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_memory_leak_tracked ON debug_memory_leak_tracker(tracked_at DESC);
COMMENT ON TABLE debug_memory_leak_tracker IS 'Component #36: Memory leak detection tracking';

-- ============================================================================
-- Component #37: Interceptor Layer
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_intercepted_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intercepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  intercepted BOOLEAN DEFAULT TRUE,
  blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  forwarded BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_intercepted_events_at ON debug_intercepted_events(intercepted_at DESC);
CREATE INDEX idx_intercepted_events_blocked ON debug_intercepted_events(blocked) WHERE blocked = TRUE;
COMMENT ON TABLE debug_intercepted_events IS 'Component #37: Intercepted events before core logic';

-- ============================================================================
-- Component #38: Event Heatmap
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_event_heatmap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_window TIMESTAMP WITH TIME ZONE NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_event_heatmap_window ON debug_event_heatmap(time_window DESC, event_type);
COMMENT ON TABLE debug_event_heatmap IS 'Component #38: Event frequency heatmap';

-- ============================================================================
-- Component #39: Predictive Pairing Model
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_predictive_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  prediction_data JSONB NOT NULL,
  actual_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  prediction_correct BOOLEAN
);

CREATE INDEX idx_predictive_pairs_at ON debug_predictive_pairs(predicted_at DESC);
COMMENT ON TABLE debug_predictive_pairs IS 'Component #39: Predictive pairing model results';

-- ============================================================================
-- Component #40: Shadow Matcher
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_shadow_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  real_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  shadow_match_id UUID,
  shadow_result JSONB NOT NULL,
  real_result JSONB,
  comparison_result TEXT CHECK (comparison_result IN ('match', 'mismatch', 'pending')),
  compared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_shadow_matches_compared ON debug_shadow_matches(compared_at DESC);
COMMENT ON TABLE debug_shadow_matches IS 'Component #40: Shadow matcher comparison results';

-- ============================================================================
-- Component #41: Conflict Resolution Tree
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_type TEXT NOT NULL,
  event1_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  event2_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  resolution_rule TEXT NOT NULL,
  resolved_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_conflict_resolutions_type ON debug_conflict_resolutions(conflict_type, resolved_at DESC);
COMMENT ON TABLE debug_conflict_resolutions IS 'Component #41: Conflict resolution decisions';

-- ============================================================================
-- Component #42: Dominant Event Monitor
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_dominant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  time_window_seconds INTEGER NOT NULL,
  threshold_exceeded BOOLEAN DEFAULT FALSE,
  alert_triggered BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_dominant_events_detected ON debug_dominant_events(detected_at DESC);
COMMENT ON TABLE debug_dominant_events IS 'Component #42: Dominant event pattern detection';

-- ============================================================================
-- Component #43: Delayed Event Compensation
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_event_compensations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delayed_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  compensation_action TEXT NOT NULL,
  compensated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  compensation_data JSONB,
  success BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_event_compensations_event ON debug_event_compensations(delayed_event_id);
COMMENT ON TABLE debug_event_compensations IS 'Component #43: Delayed event compensation actions';

-- ============================================================================
-- Component #44: Session Lineage Tracker
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_session_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  parent_session_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  reconnection_count INTEGER DEFAULT 0,
  is_ghost BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_session_lineage_user ON debug_session_lineage(user_id, created_at DESC);
CREATE INDEX idx_session_lineage_ghost ON debug_session_lineage(is_ghost) WHERE is_ghost = TRUE;
COMMENT ON TABLE debug_session_lineage IS 'Component #44: User session lineage tracking';

-- ============================================================================
-- Component #45: State Entropy Monitor
-- ============================================================================
CREATE TABLE IF NOT EXISTS debug_state_entropy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  entropy_score NUMERIC NOT NULL,
  entropy_components JSONB,
  threshold_exceeded BOOLEAN DEFAULT FALSE,
  alert_triggered BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_state_entropy_measured ON debug_state_entropy(measured_at DESC);
CREATE INDEX idx_state_entropy_threshold ON debug_state_entropy(threshold_exceeded) WHERE threshold_exceeded = TRUE;
COMMENT ON TABLE debug_state_entropy IS 'Component #45: State complexity/entropy monitoring';

-- ============================================================================
-- Helper Functions for Tier 3 Components
-- ============================================================================

-- Function: Generate event heatmap
CREATE OR REPLACE FUNCTION debug_generate_event_heatmap(
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO debug_event_heatmap (
    time_window,
    event_type,
    event_count,
    unique_users
  )
  SELECT 
    date_trunc('minute', timestamp) as time_window,
    event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users
  FROM debug_event_log
  WHERE timestamp > NOW() - (p_window_seconds || ' seconds')::INTERVAL
  GROUP BY date_trunc('minute', timestamp), event_type;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_generate_event_heatmap IS 'Component #38: Generate event frequency heatmap';

-- Function: Check for dominant events
CREATE OR REPLACE FUNCTION debug_check_dominant_events(
  p_window_seconds INTEGER DEFAULT 300,
  p_threshold_percentage NUMERIC DEFAULT 50.0
)
RETURNS INTEGER AS $$
DECLARE
  v_detected_count INTEGER := 0;
  v_total_events INTEGER;
  v_dominant_event RECORD;
BEGIN
  -- Get total events in window
  SELECT COUNT(*) INTO v_total_events
  FROM debug_event_log
  WHERE timestamp > NOW() - (p_window_seconds || ' seconds')::INTERVAL;
  
  -- Find events that exceed threshold
  FOR v_dominant_event IN
    SELECT 
      event_type,
      COUNT(*) as event_count,
      (COUNT(*)::NUMERIC / NULLIF(v_total_events, 0) * 100) as percentage
    FROM debug_event_log
    WHERE timestamp > NOW() - (p_window_seconds || ' seconds')::INTERVAL
    GROUP BY event_type
    HAVING (COUNT(*)::NUMERIC / NULLIF(v_total_events, 0) * 100) > p_threshold_percentage
  LOOP
    INSERT INTO debug_dominant_events (
      event_type,
      event_count,
      time_window_seconds,
      threshold_exceeded,
      alert_triggered
    ) VALUES (
      v_dominant_event.event_type,
      v_dominant_event.event_count,
      p_window_seconds,
      TRUE,
      TRUE
    );
    
    v_detected_count := v_detected_count + 1;
    
    -- Log alert
    PERFORM debug_log_event(
      'dominant_event_alert',
      jsonb_build_object(
        'event_type', v_dominant_event.event_type,
        'percentage', v_dominant_event.percentage,
        'count', v_dominant_event.event_count
      ),
      NULL,
      NULL,
      'debug_dominant_events',
      'ALERT',
      NULL,
      NULL,
      'WARNING'
    );
  END LOOP;
  
  RETURN v_detected_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_check_dominant_events IS 'Component #42: Check for dominant event patterns';

-- Function: Calculate state entropy
CREATE OR REPLACE FUNCTION debug_calculate_state_entropy()
RETURNS NUMERIC AS $$
DECLARE
  v_entropy NUMERIC := 0.0;
  v_state_diversity NUMERIC;
  v_transition_frequency NUMERIC;
BEGIN
  -- Calculate entropy based on state diversity and transition frequency
  -- This is a simplified entropy calculation
  SELECT 
    COUNT(DISTINCT status)::NUMERIC * 2.0 + 
    COUNT(*)::NUMERIC / 100.0
  INTO v_entropy
  FROM matching_queue;
  
  -- Record entropy measurement
  INSERT INTO debug_state_entropy (
    entropy_score,
    entropy_components,
    threshold_exceeded
  ) VALUES (
    v_entropy,
    jsonb_build_object(
      'state_diversity', (SELECT COUNT(DISTINCT status) FROM matching_queue),
      'total_entries', (SELECT COUNT(*) FROM matching_queue)
    ),
    v_entropy > 50.0 -- Threshold
  );
  
  RETURN v_entropy;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_calculate_state_entropy IS 'Component #45: Calculate state complexity/entropy';

-- Function: Track memory leak indicators
CREATE OR REPLACE FUNCTION debug_track_memory_leak()
RETURNS BOOLEAN AS $$
DECLARE
  v_queue_size INTEGER;
  v_pair_count INTEGER;
  v_lock_count INTEGER;
  v_previous_total INTEGER;
  v_growth_rate NUMERIC;
  v_leak_detected BOOLEAN := FALSE;
BEGIN
  -- Get current counts
  SELECT COUNT(*) INTO v_queue_size FROM matching_queue;
  SELECT COUNT(*) INTO v_pair_count FROM matches WHERE status != 'unmatched';
  SELECT COUNT(*) INTO v_lock_count FROM debug_lock_tracker WHERE released_at IS NULL;
  
  -- Get previous total
  SELECT total_objects INTO v_previous_total
  FROM debug_memory_leak_tracker
  ORDER BY tracked_at DESC
  LIMIT 1;
  
  -- Calculate growth rate
  IF v_previous_total IS NOT NULL AND v_previous_total > 0 THEN
    v_growth_rate := ((v_queue_size + v_pair_count + v_lock_count - v_previous_total)::NUMERIC / v_previous_total) * 100;
  ELSE
    v_growth_rate := 0;
  END IF;
  
  -- Detect leak (growth > 10% per check)
  v_leak_detected := v_growth_rate > 10.0;
  
  -- Record tracking
  INSERT INTO debug_memory_leak_tracker (
    queue_size,
    pair_count,
    lock_count,
    growth_rate,
    leak_detected
  ) VALUES (
    v_queue_size,
    v_pair_count,
    v_lock_count,
    v_growth_rate,
    v_leak_detected
  );
  
  IF v_leak_detected THEN
    PERFORM debug_log_event(
      'memory_leak_detected',
      jsonb_build_object(
        'queue_size', v_queue_size,
        'pair_count', v_pair_count,
        'lock_count', v_lock_count,
        'growth_rate', v_growth_rate
      ),
      NULL,
      NULL,
      'debug_memory_leak_tracker',
      'ALERT',
      NULL,
      NULL,
      'WARNING'
    );
  END IF;
  
  RETURN v_leak_detected;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_track_memory_leak IS 'Component #36: Track memory leak indicators';

