-- ============================================================================
-- Debugging Architecture - Tiers 4, 5, 6: Advanced Components (46-90)
-- ============================================================================
-- Combined migration for remaining tiers due to complexity and dependencies
-- ============================================================================

-- ============================================================================
-- TIER 4: Rare Edge Case Detection (Components 46-60)
-- ============================================================================

-- Component #46: State Mirror Engine
CREATE TABLE IF NOT EXISTS debug_state_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  main_state_hash TEXT NOT NULL,
  mirror_state_hash TEXT NOT NULL,
  hashes_match BOOLEAN GENERATED ALWAYS AS (main_state_hash = mirror_state_hash) STORED,
  divergence_detected BOOLEAN DEFAULT FALSE,
  divergence_data JSONB
);

CREATE INDEX idx_state_mirror_timestamp ON debug_state_mirror(mirror_timestamp DESC);
CREATE INDEX idx_state_mirror_divergence ON debug_state_mirror(divergence_detected) WHERE divergence_detected = TRUE;
COMMENT ON TABLE debug_state_mirror IS 'Component #46: Parallel state mirror for comparison';

-- Component #47: Rollback Hash Integrity
CREATE TABLE IF NOT EXISTS debug_rollback_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollback_journal_id UUID REFERENCES debug_rollback_journal(id) ON DELETE CASCADE,
  previous_state_hash TEXT NOT NULL,
  current_state_hash TEXT NOT NULL,
  hash_valid BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_rollback_hashes_journal ON debug_rollback_hashes(rollback_journal_id);
COMMENT ON TABLE debug_rollback_hashes IS 'Component #47: Hash integrity for rollback operations';

-- Component #48: Event Drift Correction
CREATE TABLE IF NOT EXISTS debug_event_drift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  drift_type TEXT NOT NULL CHECK (drift_type IN ('late', 'duplicate', 'out_of_order')),
  corrected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  correction_action TEXT,
  correction_data JSONB
);

CREATE INDEX idx_event_drift_event ON debug_event_drift(event_id);
COMMENT ON TABLE debug_event_drift IS 'Component #48: Event drift detection and correction';

-- Component #49: Pair Integrity Graph
CREATE TABLE IF NOT EXISTS debug_pair_integrity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  total_pairs INTEGER NOT NULL,
  valid_pairs INTEGER NOT NULL,
  loops_detected INTEGER DEFAULT 0,
  broken_links INTEGER DEFAULT 0,
  integrity_graph JSONB
);

CREATE INDEX idx_pair_integrity_checked ON debug_pair_integrity(checked_at DESC);
COMMENT ON TABLE debug_pair_integrity IS 'Component #49: Pair relationship graph integrity';

-- Component #50: State Transition Oracle
CREATE TABLE IF NOT EXISTS debug_transition_oracle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  current_state TEXT NOT NULL,
  predicted_next_states TEXT[] NOT NULL,
  actual_next_state TEXT,
  prediction_correct BOOLEAN,
  predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_transition_oracle_predicted ON debug_transition_oracle(predicted_at DESC);
COMMENT ON TABLE debug_transition_oracle IS 'Component #50: State transition predictions';

-- Component #51: Predictive Deadlock Detector
CREATE TABLE IF NOT EXISTS debug_predictive_deadlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  lock_chain JSONB NOT NULL,
  deadlock_predicted BOOLEAN DEFAULT TRUE,
  prevented BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_predictive_deadlocks_detected ON debug_predictive_deadlocks(detected_at DESC);
COMMENT ON TABLE debug_predictive_deadlocks IS 'Component #51: Predictive deadlock detection';

-- Component #52: Time Skew Compensator
CREATE TABLE IF NOT EXISTS debug_time_skew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  server_time TIMESTAMP WITH TIME ZONE NOT NULL,
  client_time_offset NUMERIC,
  skew_detected BOOLEAN DEFAULT FALSE,
  compensation_applied BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_time_skew_measured ON debug_time_skew(measured_at DESC);
COMMENT ON TABLE debug_time_skew IS 'Component #52: Time skew compensation tracking';

-- Component #53: Paired State Synchronisation Check
CREATE TABLE IF NOT EXISTS debug_pair_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  states_synchronized BOOLEAN DEFAULT TRUE,
  sync_error TEXT
);

CREATE INDEX idx_pair_sync_checked ON debug_pair_sync(checked_at DESC);
COMMENT ON TABLE debug_pair_sync IS 'Component #53: Paired user state synchronization';

-- Component #54: Adaptive Debug Intensity
CREATE TABLE IF NOT EXISTS debug_intensity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjusted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  intensity_level TEXT NOT NULL CHECK (intensity_level IN ('light', 'normal', 'detailed', 'maximum')),
  trigger_reason TEXT,
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_debug_intensity_active ON debug_intensity_settings(active) WHERE active = TRUE;
COMMENT ON TABLE debug_intensity_settings IS 'Component #54: Adaptive debug logging intensity';

-- Component #55: Non Deterministic Behaviour Detector
CREATE TABLE IF NOT EXISTS debug_nondeterministic_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence JSONB NOT NULL,
  run_number INTEGER NOT NULL,
  final_state_hash TEXT NOT NULL,
  state_hashes TEXT[],
  deterministic BOOLEAN,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_nondeterministic_detected ON debug_nondeterministic_runs(detected_at DESC);
COMMENT ON TABLE debug_nondeterministic_runs IS 'Component #55: Non-deterministic behavior detection';

-- Component #56: State Folding and Unfolding
CREATE TABLE IF NOT EXISTS debug_state_folding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_state JSONB NOT NULL,
  folded_state JSONB NOT NULL,
  unfolded_state JSONB,
  integrity_check BOOLEAN,
  folded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_state_folding_integrity ON debug_state_folding(integrity_check) WHERE integrity_check = FALSE;
COMMENT ON TABLE debug_state_folding IS 'Component #56: State compression/decompression integrity';

-- Component #57: Latent Bug Detector
CREATE TABLE IF NOT EXISTS debug_latent_bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  bug_type TEXT NOT NULL,
  indicator_data JSONB NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_latent_bugs_detected ON debug_latent_bugs(detected_at DESC);
COMMENT ON TABLE debug_latent_bugs IS 'Component #57: Latent bug indicators';

-- Component #58: Rare Event Amplification
CREATE TABLE IF NOT EXISTS debug_amplified_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  amplification_factor INTEGER NOT NULL,
  events_generated INTEGER,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_amplified_events_original ON debug_amplified_events(original_event_id);
COMMENT ON TABLE debug_amplified_events IS 'Component #58: Rare event amplification tests';

-- Component #59: Historical Anomaly Recogniser
CREATE TABLE IF NOT EXISTS debug_historical_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  anomaly_type TEXT NOT NULL,
  pattern_data JSONB NOT NULL,
  deviation_score NUMERIC,
  alert_triggered BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_historical_anomalies_detected ON debug_historical_anomalies(detected_at DESC);
COMMENT ON TABLE debug_historical_anomalies IS 'Component #59: Historical pattern anomaly detection';

-- Component #60: State Expiration Rules
CREATE TABLE IF NOT EXISTS debug_state_expirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  state_type TEXT NOT NULL,
  expired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  max_lifespan_seconds INTEGER NOT NULL,
  auto_cleaned BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_state_expirations_user ON debug_state_expirations(user_id, expired_at DESC);
COMMENT ON TABLE debug_state_expirations IS 'Component #60: State expiration tracking';

-- ============================================================================
-- TIER 5: Next Level Resilience (Components 61-75)
-- ============================================================================

-- Component #61: Multi Layer Consistency Guard
CREATE TABLE IF NOT EXISTS debug_consistency_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  layer1_passed BOOLEAN DEFAULT TRUE,
  layer2_passed BOOLEAN DEFAULT TRUE,
  layer3_passed BOOLEAN DEFAULT TRUE,
  all_layers_passed BOOLEAN GENERATED ALWAYS AS (layer1_passed AND layer2_passed AND layer3_passed) STORED,
  layer_errors JSONB
);

CREATE INDEX idx_consistency_layers_checked ON debug_consistency_layers(checked_at DESC);
COMMENT ON TABLE debug_consistency_layers IS 'Component #61: Multi-layer consistency validation';

-- Component #62: Distributed State Shadow
CREATE TABLE IF NOT EXISTS debug_distributed_shadow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shadow_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  main_state_hash TEXT NOT NULL,
  shadow_state_hash TEXT NOT NULL,
  hashes_match BOOLEAN,
  divergence_detected BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_distributed_shadow_timestamp ON debug_distributed_shadow(shadow_timestamp DESC);
COMMENT ON TABLE debug_distributed_shadow IS 'Component #62: Distributed state shadow comparison';

-- Component #63: Probabilistic Correctness Testing
CREATE TABLE IF NOT EXISTS debug_probabilistic_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL,
  event_sequence JSONB NOT NULL,
  invariants_held BOOLEAN DEFAULT TRUE,
  failed_invariant TEXT,
  run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_probabilistic_tests_run ON debug_probabilistic_tests(test_run_id, run_at DESC);
COMMENT ON TABLE debug_probabilistic_tests IS 'Component #63: Probabilistic correctness test results';

-- Component #64: Critical Flow Tracer
CREATE TABLE IF NOT EXISTS debug_critical_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT NOT NULL CHECK (flow_type IN ('spin', 'pair', 'vote', 'respin', 'disconnect', 'reconnect')),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  flow_data JSONB NOT NULL,
  success BOOLEAN
);

CREATE INDEX idx_critical_flows_type ON debug_critical_flows(flow_type, started_at DESC);
COMMENT ON TABLE debug_critical_flows IS 'Component #64: Critical flow tracing';

-- Component #65: State Entropy Equaliser
CREATE TABLE IF NOT EXISTS debug_entropy_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  entropy_before NUMERIC NOT NULL,
  entropy_after NUMERIC NOT NULL,
  correction_action TEXT,
  success BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_entropy_corrections_corrected ON debug_entropy_corrections(corrected_at DESC);
COMMENT ON TABLE debug_entropy_corrections IS 'Component #65: State entropy equalization actions';

-- Component #66: Impact Propagation Analysis
CREATE TABLE IF NOT EXISTS debug_propagation_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  propagation_depth INTEGER NOT NULL,
  affected_count INTEGER NOT NULL,
  analysis_data JSONB NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_propagation_analysis_event ON debug_propagation_analysis(event_id);
COMMENT ON TABLE debug_propagation_analysis IS 'Component #66: Event impact propagation depth analysis';

-- Component #67: State Checksum Tree
CREATE TABLE IF NOT EXISTS debug_checksum_tree (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  root_hash TEXT NOT NULL,
  tree_structure JSONB NOT NULL,
  verification_passed BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_checksum_tree_timestamp ON debug_checksum_tree(tree_timestamp DESC);
COMMENT ON TABLE debug_checksum_tree IS 'Component #67: Hierarchical checksum tree structure';

-- Component #68: Event Lineage Heat Tracing
CREATE TABLE IF NOT EXISTS debug_lineage_heat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  descendant_count INTEGER NOT NULL,
  heat_score NUMERIC NOT NULL,
  traced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_lineage_heat_root ON debug_lineage_heat(root_event_id);
COMMENT ON TABLE debug_lineage_heat IS 'Component #68: Event lineage heat tracing';

-- Component #69: Multi Step Transition Templates
CREATE TABLE IF NOT EXISTS debug_transition_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  template_steps TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_transition_templates_name ON debug_transition_templates(template_name);
COMMENT ON TABLE debug_transition_templates IS 'Component #69: Valid multi-step transition templates';

CREATE TABLE IF NOT EXISTS debug_template_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES debug_transition_templates(id) ON DELETE CASCADE,
  actual_sequence TEXT[] NOT NULL,
  matched_template BOOLEAN,
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_template_validations_template ON debug_template_validations(template_id);
COMMENT ON TABLE debug_template_validations IS 'Component #69: Template validation results';

-- Component #70: Real Time Verification Grid
CREATE TABLE IF NOT EXISTS debug_verification_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  grid_data JSONB NOT NULL,
  all_valid BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_verification_grid_verified ON debug_verification_grid(verified_at DESC);
COMMENT ON TABLE debug_verification_grid IS 'Component #70: Real-time state verification grid';

-- Component #71: State Partitioning
CREATE TABLE IF NOT EXISTS debug_state_partitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partition_name TEXT NOT NULL,
  partition_state JSONB NOT NULL,
  partition_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_state_partitions_name ON debug_state_partitions(partition_name);
COMMENT ON TABLE debug_state_partitions IS 'Component #71: State partitioning for isolation';

-- Component #72: Parallel Reducer Testing
CREATE TABLE IF NOT EXISTS debug_reducer_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID NOT NULL,
  reducer1_result JSONB NOT NULL,
  reducer2_result JSONB NOT NULL,
  results_match BOOLEAN,
  tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_reducer_tests_run ON debug_reducer_tests(test_run_id);
COMMENT ON TABLE debug_reducer_tests IS 'Component #72: Parallel reducer comparison results';

-- Component #73: Resynchronisation Pipeline
CREATE TABLE IF NOT EXISTS debug_resync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resync_type TEXT NOT NULL,
  state_before JSONB,
  state_after JSONB,
  resynced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  success BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_resync_operations_user ON debug_resync_operations(user_id);
COMMENT ON TABLE debug_resync_operations IS 'Component #73: State resynchronization operations';

-- Component #74: High Fidelity State Replication
CREATE TABLE IF NOT EXISTS debug_state_replicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  replica_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  main_state_hash TEXT NOT NULL,
  replica_state_hash TEXT NOT NULL,
  hashes_match BOOLEAN,
  divergence_detected BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_state_replicas_timestamp ON debug_state_replicas(replica_timestamp DESC);
COMMENT ON TABLE debug_state_replicas IS 'Component #74: High fidelity state replication comparison';

-- Component #75: Temporal Fairness Balancer
CREATE TABLE IF NOT EXISTS debug_temporal_fairness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  time_window_hours INTEGER NOT NULL,
  fairness_distribution JSONB NOT NULL,
  unfairness_detected BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_temporal_fairness_measured ON debug_temporal_fairness(measured_at DESC);
COMMENT ON TABLE debug_temporal_fairness IS 'Component #75: Temporal fairness balancing';

-- ============================================================================
-- TIER 6: Extreme Debugging Tools (Components 76-90)
-- ============================================================================

-- Component #76: State Freeze Frame
CREATE TABLE IF NOT EXISTS debug_freeze_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frozen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  trigger_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  frozen_state JSONB NOT NULL,
  freeze_reason TEXT NOT NULL,
  unfrozen_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_freeze_frames_frozen ON debug_freeze_frames(frozen_at DESC);
COMMENT ON TABLE debug_freeze_frames IS 'Component #76: State freeze frames on errors';

-- Component #77: Dynamic Bug Hypothesis Generator
CREATE TABLE IF NOT EXISTS debug_bug_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  hypothesis_text TEXT NOT NULL,
  confidence_score NUMERIC,
  evidence_data JSONB NOT NULL,
  validated BOOLEAN
);

CREATE INDEX idx_bug_hypotheses_generated ON debug_bug_hypotheses(generated_at DESC);
COMMENT ON TABLE debug_bug_hypotheses IS 'Component #77: Generated bug hypotheses';

-- Component #78: Confined Experiment Sandbox
CREATE TABLE IF NOT EXISTS debug_sandbox_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_name TEXT NOT NULL,
  sandbox_state JSONB NOT NULL,
  experiment_config JSONB NOT NULL,
  results JSONB,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sandbox_experiments_name ON debug_sandbox_experiments(experiment_name);
COMMENT ON TABLE debug_sandbox_experiments IS 'Component #78: Sandboxed experiment results';

-- Component #79: Resilience Rehearsal Mode
CREATE TABLE IF NOT EXISTS debug_resilience_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  fault_injected TEXT NOT NULL,
  system_behavior JSONB,
  recovery_successful BOOLEAN,
  tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_resilience_tests_tested ON debug_resilience_tests(tested_at DESC);
COMMENT ON TABLE debug_resilience_tests IS 'Component #79: Resilience rehearsal test results';

-- Component #80: Pairing Conflict Ledger
CREATE TABLE IF NOT EXISTS debug_pairing_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_type TEXT NOT NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user2_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  conflict_data JSONB NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_pairing_conflicts_detected ON debug_pairing_conflicts(detected_at DESC);
COMMENT ON TABLE debug_pairing_conflicts IS 'Component #80: Pairing conflict log';

-- Component #81: Priority Inheritance for Fairness
CREATE TABLE IF NOT EXISTS debug_priority_inheritance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  blocked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  inherited_priority NUMERIC NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  released_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_priority_inheritance_blocked ON debug_priority_inheritance(blocked_user_id);
COMMENT ON TABLE debug_priority_inheritance IS 'Component #81: Priority inheritance tracking';

-- Component #82: Parallel Scenario Runner
CREATE TABLE IF NOT EXISTS debug_parallel_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT NOT NULL,
  seed_value INTEGER NOT NULL,
  scenario_result JSONB,
  passed BOOLEAN,
  run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_parallel_scenarios_run ON debug_parallel_scenarios(run_at DESC);
COMMENT ON TABLE debug_parallel_scenarios IS 'Component #82: Parallel scenario test results';

-- Component #83: Consistency Lattice
CREATE TABLE IF NOT EXISTS debug_consistency_lattice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lattice_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  lattice_structure JSONB NOT NULL,
  consistency_verified BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_consistency_lattice_timestamp ON debug_consistency_lattice(lattice_timestamp DESC);
COMMENT ON TABLE debug_consistency_lattice IS 'Component #83: Consistency lattice structure';

-- Component #84: End to End Consistency Proof Harness
CREATE TABLE IF NOT EXISTS debug_e2e_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_run_id UUID NOT NULL,
  proof_passed BOOLEAN DEFAULT TRUE,
  invariants_checked TEXT[],
  failed_invariants TEXT[],
  run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_e2e_proofs_run ON debug_e2e_proofs(proof_run_id);
COMMENT ON TABLE debug_e2e_proofs IS 'Component #84: End-to-end consistency proof results';

-- Component #85: Parallel Scenario Runner (duplicate of #82 - consolidated)
-- Already created above

-- Component #86: State Hygiene Score
CREATE TABLE IF NOT EXISTS debug_hygiene_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  hygiene_score NUMERIC NOT NULL,
  score_components JSONB NOT NULL,
  below_threshold BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_hygiene_scores_scored ON debug_hygiene_scores(scored_at DESC);
COMMENT ON TABLE debug_hygiene_scores IS 'Component #86: State hygiene score tracking';

-- Component #87: Event Poisoning Detector
CREATE TABLE IF NOT EXISTS debug_event_poisoning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poisoned_event_id UUID REFERENCES debug_event_log(id) ON DELETE SET NULL,
  corruption_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  affected_areas JSONB NOT NULL,
  containment_applied BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_event_poisoning_event ON debug_event_poisoning(poisoned_event_id);
COMMENT ON TABLE debug_event_poisoning IS 'Component #87: Event poisoning detection';

-- Component #88: State Mirror Shadow Time Engine
CREATE TABLE IF NOT EXISTS debug_shadow_time_engine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timer_id UUID REFERENCES debug_time_events(id) ON DELETE SET NULL,
  real_timer_hash TEXT,
  shadow_timer_hash TEXT,
  hashes_match BOOLEAN,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_shadow_time_engine_timer ON debug_shadow_time_engine(timer_id);
COMMENT ON TABLE debug_shadow_time_engine IS 'Component #88: Shadow time engine validation';

-- Component #89: State Entropy Equaliser Deep Mode
CREATE TABLE IF NOT EXISTS debug_entropy_deep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  entropy_analysis JSONB NOT NULL,
  corrections_applied JSONB,
  deep_mode_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_entropy_deep_analyzed ON debug_entropy_deep(analyzed_at DESC);
COMMENT ON TABLE debug_entropy_deep IS 'Component #89: Deep mode entropy equalization';

-- Component #90: Confined Experiment Sandbox Extended
-- Enhanced version of Component #78
ALTER TABLE debug_sandbox_experiments
  ADD COLUMN IF NOT EXISTS extended_config JSONB,
  ADD COLUMN IF NOT EXISTS comparison_results JSONB;

COMMENT ON COLUMN debug_sandbox_experiments.extended_config IS 'Component #90: Extended sandbox configuration';
COMMENT ON COLUMN debug_sandbox_experiments.comparison_results IS 'Component #90: Comparison with production results';

-- ============================================================================
-- Helper Functions for Advanced Components
-- ============================================================================

-- Function: Calculate hygiene score
CREATE OR REPLACE FUNCTION debug_calculate_hygiene_score()
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 100.0;
  v_errors INTEGER;
  v_stale_locks INTEGER;
  v_orphans INTEGER;
BEGIN
  -- Subtract points for each issue
  SELECT COUNT(*) INTO v_errors FROM debug_validation_errors WHERE resolved_at IS NULL;
  SELECT COUNT(*) INTO v_stale_locks FROM debug_lock_tracker WHERE released_at IS NULL AND timeout_at < NOW();
  SELECT COUNT(*) INTO v_orphans FROM debug_orphan_states WHERE resolved_at IS NULL;
  
  v_score := v_score - (v_errors * 5) - (v_stale_locks * 3) - (v_orphans * 2);
  
  IF v_score < 0 THEN v_score := 0; END IF;
  
  -- Record score
  INSERT INTO debug_hygiene_scores (
    hygiene_score,
    score_components,
    below_threshold
  ) VALUES (
    v_score,
    jsonb_build_object(
      'errors', v_errors,
      'stale_locks', v_stale_locks,
      'orphans', v_orphans
    ),
    v_score < 70.0
  );
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_calculate_hygiene_score IS 'Component #86: Calculate state hygiene score';

-- ============================================================================
-- End of Tiers 4, 5, 6 Migration
-- ============================================================================

