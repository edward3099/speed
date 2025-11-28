-- Fix process_matching to add vote_started_at column if missing and ensure proper match creation
-- Also add better error handling

-- First, ensure vote_started_at column exists in matches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND column_name = 'vote_started_at'
  ) THEN
    ALTER TABLE matches ADD COLUMN vote_started_at TIMESTAMPTZ;
    RAISE NOTICE 'Added vote_started_at column to matches table';
  END IF;
END $$;

-- Update process_matching to set vote_started_at
CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
  user_record RECORD;
  candidate_id UUID;
  match_id BIGINT;
  preference_stage INTEGER;
  wait_time_seconds INTEGER;
BEGIN
  -- Process all users in queue, ordered by priority
  FOR user_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      q.preference_stage,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    INNER JOIN user_status us ON us.user_id = q.user_id
    WHERE u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND us.state IN ('spin_active', 'queue_waiting')
    ORDER BY 
      q.fairness_score DESC,
      wait_time_seconds DESC,
      RANDOM() -- Random tiebreaker
  LOOP
    -- Skip if already matched in this cycle
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = user_record.user_id OR user2_id = user_record.user_id)
        AND status IN ('pending', 'vote_active')
    ) THEN
      CONTINUE;
    END IF;
    
    -- Determine preference stage based on wait time
    preference_stage := user_record.preference_stage;
    
    -- Update preference stage if needed
    IF user_record.wait_time_seconds >= 20 THEN
      preference_stage := 3; -- Full expansion
    ELSIF user_record.wait_time_seconds >= 15 THEN
      preference_stage := 2; -- Distance expanded
    ELSIF user_record.wait_time_seconds >= 10 THEN
      preference_stage := 1; -- Age expanded
    ELSE
      preference_stage := 0; -- Exact preferences
    END IF;
    
    -- Update preference stage if changed
    IF preference_stage != user_record.preference_stage THEN
      UPDATE queue
      SET preference_stage = preference_stage,
          updated_at = NOW()
      WHERE user_id = user_record.user_id;
    END IF;
    
    -- Find best match for this user
    candidate_id := find_best_match(user_record.user_id, preference_stage);
    
    -- If candidate found, create pair atomically
    IF candidate_id IS NOT NULL THEN
      match_id := create_pair_atomic(user_record.user_id, candidate_id);
      
      IF match_id IS NOT NULL THEN
        matched_count := matched_count + 1;
        
        -- Transition both to vote_active
        UPDATE user_status
        SET state = 'vote_active',
            vote_window_started_at = NOW(),
            last_state = 'paired',
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (user_record.user_id, candidate_id);
        
        -- Update match status with vote_started_at
        UPDATE matches
        SET status = 'vote_active',
            vote_started_at = NOW(),
            vote_window_expires_at = NOW() + INTERVAL '10 seconds'
        WHERE id = match_id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN matched_count;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Main matching engine - processes all eligible users in queue, ordered by priority';
