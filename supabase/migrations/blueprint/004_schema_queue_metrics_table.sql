-- ============================================================================
-- Blueprint Migration 004: Queue Metrics Table
-- ============================================================================
-- Part 0.3: Track queue metrics for monitoring and balancing
-- ============================================================================

-- Track queue metrics for monitoring and balancing
CREATE TABLE IF NOT EXISTS queue_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_users INTEGER NOT NULL DEFAULT 0,
  male_count INTEGER NOT NULL DEFAULT 0,
  female_count INTEGER NOT NULL DEFAULT 0,
  other_count INTEGER NOT NULL DEFAULT 0,
  spin_active_count INTEGER NOT NULL DEFAULT 0,
  queue_waiting_count INTEGER NOT NULL DEFAULT 0,
  paired_count INTEGER NOT NULL DEFAULT 0,
  vote_active_count INTEGER NOT NULL DEFAULT 0,
  supply_demand_ratio DECIMAL(10, 4), -- male_count / female_count or vice versa
  gender_imbalance_score DECIMAL(10, 4), -- |male_count - female_count| / total_users
  avg_fairness_score DECIMAL(10, 2),
  avg_wait_time_seconds INTEGER,
  tier1_count INTEGER NOT NULL DEFAULT 0,
  tier2_count INTEGER NOT NULL DEFAULT 0,
  tier3_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_queue_metrics_recorded_at ON queue_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_metrics_gender_imbalance ON queue_metrics(gender_imbalance_score DESC) WHERE gender_imbalance_score > 0.3;

COMMENT ON TABLE queue_metrics IS 'Historical queue metrics for monitoring and balancing decisions';

