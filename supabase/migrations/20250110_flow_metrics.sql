-- ============================================================================
-- Flow Metrics Function
-- ============================================================================
-- Phase 7.2: Tracks complete journey timing for each match
-- ============================================================================

-- Function to track flow metrics
CREATE OR REPLACE FUNCTION track_flow_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tracked INTEGER := 0;
  v_match RECORD;
BEGIN
  -- Process matches that don't have flow_metrics yet
  FOR v_match IN
    SELECT 
      m.match_id,
      m.created_at as match_created_at,
      m.resolved_at as outcome_resolved_at,
      m.outcome,
      -- Get first acknowledgment
      (SELECT MIN(timestamp) FROM flow_log 
       WHERE match_id = m.match_id AND step = 'acknowledged') as first_ack_at,
      -- Get second acknowledgment (or vote_window_started)
      (SELECT MAX(timestamp) FROM flow_log 
       WHERE match_id = m.match_id AND step IN ('acknowledged', 'vote_window_started')) as second_ack_at,
      -- Get vote window started
      (SELECT MIN(timestamp) FROM flow_log 
       WHERE match_id = m.match_id AND step = 'vote_window_started') as vote_window_started_at,
      -- Get first vote
      (SELECT MIN(timestamp) FROM flow_log 
       WHERE match_id = m.match_id AND step = 'vote_recorded') as first_vote_at,
      -- Get second vote
      (SELECT timestamp FROM flow_log 
       WHERE match_id = m.match_id AND step = 'vote_recorded' 
       ORDER BY timestamp DESC LIMIT 1 OFFSET 1) as second_vote_at,
      -- Get video date created
      (SELECT MIN(timestamp) FROM flow_log 
       WHERE match_id = m.match_id AND step = 'video_date_created') as video_date_created_at
    FROM matches m
    WHERE m.status = 'ended'
      AND m.resolved_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM flow_metrics fm WHERE fm.match_id = m.match_id
      )
    LIMIT 100
  LOOP
    -- Insert or update flow metrics
    INSERT INTO flow_metrics (
      match_id,
      match_created_at,
      first_ack_at,
      second_ack_at,
      vote_window_started_at,
      first_vote_at,
      second_vote_at,
      outcome_resolved_at,
      video_date_created_at,
      ack_time_seconds,
      vote_window_delay_seconds,
      vote_time_seconds,
      resolution_time_seconds,
      total_time_seconds
    )
    VALUES (
      v_match.match_id,
      v_match.match_created_at,
      v_match.first_ack_at,
      v_match.second_ack_at,
      v_match.vote_window_started_at,
      v_match.first_vote_at,
      v_match.second_vote_at,
      v_match.outcome_resolved_at,
      v_match.video_date_created_at,
      -- Calculate metrics
      CASE 
        WHEN v_match.second_ack_at IS NOT NULL AND v_match.match_created_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (v_match.second_ack_at - v_match.match_created_at))::INTEGER
        ELSE NULL
      END,
      CASE 
        WHEN v_match.vote_window_started_at IS NOT NULL AND v_match.second_ack_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (v_match.vote_window_started_at - v_match.second_ack_at))::INTEGER
        ELSE NULL
      END,
      CASE 
        WHEN v_match.second_vote_at IS NOT NULL AND v_match.vote_window_started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (v_match.second_vote_at - v_match.vote_window_started_at))::INTEGER
        ELSE NULL
      END,
      CASE 
        WHEN v_match.outcome_resolved_at IS NOT NULL AND v_match.second_vote_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (v_match.outcome_resolved_at - v_match.second_vote_at))::INTEGER
        ELSE NULL
      END,
      CASE 
        WHEN v_match.outcome_resolved_at IS NOT NULL AND v_match.match_created_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (v_match.outcome_resolved_at - v_match.match_created_at))::INTEGER
        ELSE NULL
      END
    )
    ON CONFLICT (match_id) DO UPDATE
    SET
      match_created_at = EXCLUDED.match_created_at,
      first_ack_at = EXCLUDED.first_ack_at,
      second_ack_at = EXCLUDED.second_ack_at,
      vote_window_started_at = EXCLUDED.vote_window_started_at,
      first_vote_at = EXCLUDED.first_vote_at,
      second_vote_at = EXCLUDED.second_vote_at,
      outcome_resolved_at = EXCLUDED.outcome_resolved_at,
      video_date_created_at = EXCLUDED.video_date_created_at,
      ack_time_seconds = EXCLUDED.ack_time_seconds,
      vote_window_delay_seconds = EXCLUDED.vote_window_delay_seconds,
      vote_time_seconds = EXCLUDED.vote_time_seconds,
      resolution_time_seconds = EXCLUDED.resolution_time_seconds,
      total_time_seconds = EXCLUDED.total_time_seconds,
      updated_at = NOW();
    
    v_tracked := v_tracked + 1;
  END LOOP;
  
  RETURN v_tracked;
END;
$$;

COMMENT ON FUNCTION track_flow_metrics IS 'Tracks complete journey timing for each match - helps identify bottlenecks';

