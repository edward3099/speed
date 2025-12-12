-- ============================================================================
-- Spin Logic Logging Tables
-- ============================================================================
-- Phase 1.2: Comprehensive logging for observability and debugging
-- ============================================================================

-- ============================================================================
-- SPINNING LOG
-- ============================================================================
-- Tracks spinning operations (join attempts, success/failure)
CREATE TABLE IF NOT EXISTS spinning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'join_attempted', 'join_succeeded', 'join_failed'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spinning_log_user_id ON spinning_log(user_id);
CREATE INDEX IF NOT EXISTS idx_spinning_log_timestamp ON spinning_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spinning_log_action ON spinning_log(action, timestamp DESC);

COMMENT ON TABLE spinning_log IS 'Tracks spinning operations - join attempts, success/failure, timing';
COMMENT ON COLUMN spinning_log.action IS 'Action type: join_attempted, join_succeeded, join_failed';
COMMENT ON COLUMN spinning_log.duration_ms IS 'Time taken for the operation in milliseconds';

-- ============================================================================
-- MATCHING LOG
-- ============================================================================
-- Tracks matching operations (attempts, created, failed)
CREATE TABLE IF NOT EXISTS matching_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id) ON DELETE SET NULL,
  user1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'match_attempted', 'match_created', 'match_failed'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queue_size INTEGER,
  wait_time_seconds INTEGER,
  failure_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matching_log_match_id ON matching_log(match_id);
CREATE INDEX IF NOT EXISTS idx_matching_log_user1_id ON matching_log(user1_id);
CREATE INDEX IF NOT EXISTS idx_matching_log_user2_id ON matching_log(user2_id);
CREATE INDEX IF NOT EXISTS idx_matching_log_timestamp ON matching_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_matching_log_action ON matching_log(action, timestamp DESC);

COMMENT ON TABLE matching_log IS 'Tracks matching operations - attempts, created matches, failures';
COMMENT ON COLUMN matching_log.action IS 'Action type: match_attempted, match_created, match_failed';
COMMENT ON COLUMN matching_log.queue_size IS 'Queue size at time of matching attempt';
COMMENT ON COLUMN matching_log.wait_time_seconds IS 'How long user waited before matching';

-- ============================================================================
-- VOTING LOG
-- ============================================================================
-- Tracks voting operations (acknowledgments, votes, outcomes)
CREATE TABLE IF NOT EXISTS voting_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'acknowledged', 'vote_recorded', 'outcome_resolved', 'video_date_created'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vote_value TEXT, -- 'yes', 'pass'
  outcome TEXT, -- 'both_yes', 'yes_pass', 'pass_pass', 'idle_idle'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voting_log_match_id ON voting_log(match_id);
CREATE INDEX IF NOT EXISTS idx_voting_log_user_id ON voting_log(user_id);
CREATE INDEX IF NOT EXISTS idx_voting_log_timestamp ON voting_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_voting_log_action ON voting_log(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_voting_log_outcome ON voting_log(outcome, timestamp DESC);

COMMENT ON TABLE voting_log IS 'Tracks voting operations - acknowledgments, votes, outcomes, video-date creation';
COMMENT ON COLUMN voting_log.action IS 'Action type: acknowledged, vote_recorded, outcome_resolved, video_date_created';
COMMENT ON COLUMN voting_log.outcome IS 'Match outcome: both_yes, yes_pass, pass_pass, idle_idle';

-- ============================================================================
-- FLOW LOG
-- ============================================================================
-- Tracks complete flow journey (match → acknowledge → vote → outcome)
CREATE TABLE IF NOT EXISTS flow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  step TEXT NOT NULL, -- 'match_created', 'acknowledged', 'vote_window_started', 'vote_recorded', 'outcome_resolved', 'video_date_created'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_log_match_id ON flow_log(match_id);
CREATE INDEX IF NOT EXISTS idx_flow_log_user_id ON flow_log(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_log_timestamp ON flow_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flow_log_step ON flow_log(step, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flow_log_match_step ON flow_log(match_id, step, timestamp DESC);

COMMENT ON TABLE flow_log IS 'Tracks complete flow journey from match creation to final outcome';
COMMENT ON COLUMN flow_log.step IS 'Flow step: match_created, acknowledged, vote_window_started, vote_recorded, outcome_resolved, video_date_created';

-- ============================================================================
-- SECTION HEALTH
-- ============================================================================
-- Tracks health metrics for each section
CREATE TABLE IF NOT EXISTS section_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL, -- 'spinning', 'matching', 'voting'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success_rate NUMERIC(5, 2), -- 0-100
  average_time_ms INTEGER,
  error_count INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  health_score INTEGER, -- 0-100
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_section_health_section ON section_health(section, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_section_health_timestamp ON section_health(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_section_health_health_score ON section_health(health_score, timestamp DESC);

COMMENT ON TABLE section_health IS 'Tracks health metrics for each section - spinning, matching, voting';
COMMENT ON COLUMN section_health.section IS 'Section name: spinning, matching, voting';
COMMENT ON COLUMN section_health.success_rate IS 'Success rate percentage (0-100)';
COMMENT ON COLUMN section_health.health_score IS 'Overall health score (0-100) - alert if < 70';

-- ============================================================================
-- MATCH ATTEMPTS
-- ============================================================================
-- Logs every match attempt with reason (compatible/incompatible/already_matched)
CREATE TABLE IF NOT EXISTS match_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result TEXT NOT NULL, -- 'matched', 'incompatible', 'already_matched', 'offline', 'not_waiting', 'preference_mismatch', 'history_blocked'
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_attempts_user1_id ON match_attempts(user1_id);
CREATE INDEX IF NOT EXISTS idx_match_attempts_user2_id ON match_attempts(user2_id);
CREATE INDEX IF NOT EXISTS idx_match_attempts_attempted_at ON match_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_attempts_result ON match_attempts(result, attempted_at DESC);

COMMENT ON TABLE match_attempts IS 'Logs every match attempt with result and reason';
COMMENT ON COLUMN match_attempts.result IS 'Result: matched, incompatible, already_matched, offline, not_waiting, preference_mismatch, history_blocked';
COMMENT ON COLUMN match_attempts.reason IS 'Detailed reason for the result';

-- ============================================================================
-- MATCHING HEARTBEAT
-- ============================================================================
-- Tracks matching process activity
CREATE TABLE IF NOT EXISTS matching_heartbeat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queue_size INTEGER DEFAULT 0,
  matches_attempted INTEGER DEFAULT 0,
  matches_created INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matching_heartbeat_processed_at ON matching_heartbeat(processed_at DESC);

COMMENT ON TABLE matching_heartbeat IS 'Tracks matching process activity - heartbeat for continuous matching';
COMMENT ON COLUMN matching_heartbeat.processed_at IS 'When the matching process ran';
COMMENT ON COLUMN matching_heartbeat.queue_size IS 'Queue size at time of processing';
COMMENT ON COLUMN matching_heartbeat.matches_created IS 'Number of matches created in this run';

-- ============================================================================
-- FLOW METRICS
-- ============================================================================
-- Tracks complete journey timing for each match
CREATE TABLE IF NOT EXISTS flow_metrics (
  match_id UUID PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  match_created_at TIMESTAMPTZ,
  first_ack_at TIMESTAMPTZ,
  second_ack_at TIMESTAMPTZ,
  vote_window_started_at TIMESTAMPTZ,
  first_vote_at TIMESTAMPTZ,
  second_vote_at TIMESTAMPTZ,
  outcome_resolved_at TIMESTAMPTZ,
  video_date_created_at TIMESTAMPTZ,
  
  -- Calculated metrics
  ack_time_seconds INTEGER,
  vote_window_delay_seconds INTEGER,
  vote_time_seconds INTEGER,
  resolution_time_seconds INTEGER,
  total_time_seconds INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_match_created_at ON flow_metrics(match_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_total_time ON flow_metrics(total_time_seconds);

COMMENT ON TABLE flow_metrics IS 'Tracks complete journey timing for each match - helps identify bottlenecks';
COMMENT ON COLUMN flow_metrics.ack_time_seconds IS 'Time from match creation to both acknowledgments';
COMMENT ON COLUMN flow_metrics.total_time_seconds IS 'Total time from match creation to outcome resolution';

