-- Add logging to join_queue function
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_online BOOLEAN;
  user_cooldown TIMESTAMPTZ;
BEGIN
  -- Check user is online (from profiles table)
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('join_queue_failed', jsonb_build_object(
      'user_id', p_user_id,
      'reason', 'profile.online = FALSE'
    ), 'warning');
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('join_queue_failed', jsonb_build_object(
      'user_id', p_user_id,
      'reason', 'in_cooldown',
      'cooldown_until', user_cooldown
    ), 'warning');
    RETURN FALSE;
  END IF;
  
  -- Check not already in queue
  IF EXISTS (SELECT 1 FROM queue WHERE user_id = p_user_id) THEN
    INSERT INTO debug_logs (event_type, metadata, severity)
    VALUES ('join_queue_already_in_queue', jsonb_build_object('user_id', p_user_id), 'info');
    -- Still update user_status to ensure it's correct
    INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
    VALUES (p_user_id, 'spin_active', NOW(), 'idle', NOW(), NOW(), TRUE, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET state = 'spin_active',
        spin_started_at = NOW(),
        last_state = COALESCE(user_status.state, 'idle'),
        last_state_change = NOW(),
        updated_at = NOW(),
        online_status = TRUE,
        last_heartbeat = NOW();
    RETURN TRUE;
  END IF;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Ensure user_status exists and update to spin_active
  INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  VALUES (p_user_id, 'spin_active', NOW(), 'idle', NOW(), NOW(), TRUE, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(user_status.state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW(),
      online_status = TRUE,
      last_heartbeat = NOW();
  
  INSERT INTO debug_logs (event_type, metadata, severity)
  VALUES ('join_queue_success', jsonb_build_object(
    'user_id', p_user_id
  ), 'info');
  
  RETURN TRUE;
END;
$$;
