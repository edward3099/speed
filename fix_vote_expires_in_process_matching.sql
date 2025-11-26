-- Fix vote_expires_at not being set correctly in process_matching
CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
  user_record RECORD;
  candidate_id UUID;
  match_id UUID;
  preference_stage INTEGER;
  wait_time_seconds INTEGER;
  new_stage_value INTEGER;
  vote_window_seconds INTEGER := 30;
  queue_count INTEGER;
  users_processed INTEGER := 0;
BEGIN
  -- Log start
  INSERT INTO debug_logs (event_type, metadata, severity)
  VALUES ('matching_process_start', jsonb_build_object('timestamp', NOW()), 'info');
  
  -- Count users in queue
  SELECT COUNT(*) INTO queue_count FROM queue;
  
  INSERT INTO debug_logs (event_type, metadata, severity)
  VALUES ('matching_queue_count', jsonb_build_object('count', queue_count), 'info');
  
  IF queue_count < 2 THEN
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_insufficient_users', jsonb_build_object('count', queue_count), 'warning');
    RETURN 0;
  END IF;
  
  -- Process all users in queue, ordered by priority
  FOR user_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      q.preference_stage,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds,
      u.name as user_name,
      u.gender as user_gender
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    INNER JOIN user_status us ON us.user_id = q.user_id
    WHERE u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND us.state IN ('spin_active', 'queue_waiting')
    ORDER BY 
      q.fairness_score DESC,
      wait_time_seconds DESC,
      RANDOM()
  LOOP
    users_processed := users_processed + 1;
    
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_processing_user', jsonb_build_object(
      'user_id', user_record.user_id,
      'user_name', user_record.user_name,
      'gender', user_record.user_gender,
      'fairness_score', user_record.fairness_score,
      'wait_time_seconds', user_record.wait_time_seconds,
      'users_processed', users_processed
    ), 'info');
    
    -- Skip if already matched in this cycle
    IF EXISTS (
      SELECT 1 FROM matches
      WHERE (user1_id = user_record.user_id OR user2_id = user_record.user_id)
        AND status IN ('pending', 'vote_active')
    ) THEN
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES ('matching_user_already_matched', jsonb_build_object('user_id', user_record.user_id), 'info');
      CONTINUE;
    END IF;
    
    -- Determine preference stage based on wait time
    preference_stage := user_record.preference_stage;
    
    IF user_record.wait_time_seconds >= 20 THEN
      preference_stage := 3;
    ELSIF user_record.wait_time_seconds >= 15 THEN
      preference_stage := 2;
    ELSIF user_record.wait_time_seconds >= 10 THEN
      preference_stage := 1;
    ELSE
      preference_stage := 0;
    END IF;
    
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_preference_stage', jsonb_build_object(
      'user_id', user_record.user_id,
      'old_stage', user_record.preference_stage,
      'new_stage', preference_stage,
      'wait_time_seconds', user_record.wait_time_seconds
    ), 'info');
    
    -- Update preference stage if changed
    IF preference_stage != user_record.preference_stage THEN
      new_stage_value := preference_stage;
      UPDATE queue
      SET preference_stage = new_stage_value,
          updated_at = NOW()
      WHERE queue.user_id = user_record.user_id;
    END IF;
    
    -- Find best match for this user
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_calling_find_best_match', jsonb_build_object(
      'user_id', user_record.user_id,
      'preference_stage', preference_stage
    ), 'info');
    
    candidate_id := find_best_match(user_record.user_id, preference_stage);
    
    IF candidate_id IS NULL THEN
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES ('matching_no_candidate_found', jsonb_build_object(
        'user_id', user_record.user_id,
        'preference_stage', preference_stage
      ), 'warning');
      CONTINUE;
    END IF;
    
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_candidate_found', jsonb_build_object(
      'user_id', user_record.user_id,
      'candidate_id', candidate_id
    ), 'info');
    
    -- If candidate found, create pair atomically
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('matching_calling_create_pair', jsonb_build_object(
      'user1_id', user_record.user_id,
      'user2_id', candidate_id
    ), 'info');
    
    BEGIN
      match_id := create_pair_atomic(user_record.user_id, candidate_id);
      
      IF match_id IS NULL THEN
        INSERT INTO debug_logs (event_type, metadata, severity)
        VALUES ('matching_create_pair_failed', jsonb_build_object(
          'user1_id', user_record.user_id,
          'user2_id', candidate_id
        ), 'error');
        CONTINUE;
      END IF;
      
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES ('matching_pair_created', jsonb_build_object(
        'match_id', match_id,
        'user1_id', user_record.user_id,
        'user2_id', candidate_id
      ), 'info');
      
      matched_count := matched_count + 1;
      
      -- Transition both to vote_active
      UPDATE user_status
      SET state = 'vote_active',
          last_state = 'paired',
          last_state_change = NOW(),
          updated_at = NOW()
      WHERE user_id IN (user_record.user_id, candidate_id);
      
      -- Update match to vote_active and set vote_started_at and vote_expires_at
      -- CRITICAL FIX: Use explicit NOW() + INTERVAL to ensure vote_expires_at is set
      UPDATE matches
      SET status = 'vote_active',
          vote_started_at = NOW(),
          vote_expires_at = NOW() + INTERVAL '30 seconds',
          vote_window_expires_at = NOW() + INTERVAL '30 seconds'
      WHERE id = match_id;
      
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES ('matching_match_activated', jsonb_build_object(
        'match_id', match_id,
        'vote_expires_at', (NOW() + INTERVAL '30 seconds')::TEXT
      ), 'info');
      
      -- Exit loop after creating one match
      EXIT;
      
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO debug_logs (event_type, metadata, severity)
      VALUES ('matching_create_pair_exception', jsonb_build_object(
        'error', SQLERRM,
        'user1_id', user_record.user_id,
        'user2_id', candidate_id
      ), 'error');
      CONTINUE;
    END;
  END LOOP;
  
  INSERT INTO debug_logs (event_type, metadata, severity)
  VALUES ('matching_process_complete', jsonb_build_object(
    'matched_count', matched_count,
    'users_processed', users_processed,
    'queue_count', queue_count
  ), 'info');
  
  RETURN matched_count;
END;
$$;
