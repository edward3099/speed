-- Fix process_matching to handle UUID match IDs
CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
  user_record RECORD;
  candidate_id UUID;
  match_uuid UUID;
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
      -- Call create_pair_atomic and get the actual UUID match id
      -- We need to get the UUID directly, not the BIGINT hash
      SELECT id INTO match_uuid
      FROM matches
      WHERE (user1_id = user_record.user_id AND user2_id = candidate_id)
         OR (user1_id = candidate_id AND user2_id = user_record.user_id)
      ORDER BY matched_at DESC
      LIMIT 1;
      
      -- If match doesn't exist yet, create it
      IF match_uuid IS NULL THEN
        -- Create match directly with proper locking to ensure atomicity
        -- Use a transaction-safe approach
        BEGIN
          -- Lock both users
          PERFORM 1 FROM profiles WHERE id = LEAST(user_record.user_id, candidate_id) FOR UPDATE SKIP LOCKED;
          PERFORM 1 FROM profiles WHERE id = GREATEST(user_record.user_id, candidate_id) FOR UPDATE SKIP LOCKED;
          
          -- Create match
          INSERT INTO matches (user1_id, user2_id, status)
          VALUES (
            LEAST(user_record.user_id, candidate_id),
            GREATEST(user_record.user_id, candidate_id),
            'pending'
          )
          RETURNING id INTO match_uuid;
        EXCEPTION
          WHEN unique_violation THEN
            -- Match already exists, get it
            SELECT id INTO match_uuid
            FROM matches
            WHERE (user1_id = LEAST(user_record.user_id, candidate_id) 
               AND user2_id = GREATEST(user_record.user_id, candidate_id))
               OR (user1_id = GREATEST(user_record.user_id, candidate_id) 
               AND user2_id = LEAST(user_record.user_id, candidate_id))
            LIMIT 1;
        END;
        
        -- Update user_status to paired
        UPDATE user_status
        SET state = 'paired',
            last_state = state,
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (user_record.user_id, candidate_id);
        
        -- Remove both from queue
        DELETE FROM queue WHERE user_id IN (user_record.user_id, candidate_id);
      END IF;
      
      IF match_uuid IS NOT NULL THEN
        matched_count := matched_count + 1;
        
        -- Transition both to vote_active
        UPDATE user_status
        SET state = 'vote_active',
            vote_window_started_at = NOW(),
            last_state = 'paired',
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (user_record.user_id, candidate_id);
        
        -- Update match status
        UPDATE matches
        SET status = 'vote_active',
            vote_window_expires_at = NOW() + INTERVAL '10 seconds'
        WHERE id = match_uuid;
      END IF;
    END IF;
  END LOOP;
  
  RETURN matched_count;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Main matching engine - processes all eligible users in queue, ordered by priority';
