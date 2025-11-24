-- ============================================================================
-- Debugging Architecture - Triggers and Integration
-- ============================================================================
-- This migration creates triggers on existing tables to automatically
-- log events, validate state, and track changes.
-- ============================================================================

-- ============================================================================
-- Component #7: State Watcher - Automatic State Change Tracking
-- ============================================================================
-- Trigger function to log all changes to matching_queue
CREATE OR REPLACE FUNCTION debug_watch_matching_queue()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
  v_before_snapshot JSONB;
  v_after_snapshot JSONB;
  v_event_type TEXT;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'queue_entry_created';
    v_before_snapshot := NULL;
    v_after_snapshot := row_to_json(NEW)::jsonb;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_type := 'queue_entry_updated';
    v_before_snapshot := row_to_json(OLD)::jsonb;
    v_after_snapshot := row_to_json(NEW)::jsonb;
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'queue_entry_deleted';
    v_before_snapshot := row_to_json(OLD)::jsonb;
    v_after_snapshot := NULL;
  END IF;
  
  -- Create snapshots
  IF v_before_snapshot IS NOT NULL THEN
    PERFORM debug_create_snapshot(
      'before',
      TG_TABLE_NAME,
      (NEW.id OR OLD.id),
      v_before_snapshot,
      NULL,
      COALESCE(NEW.user_id, OLD.user_id)
    );
  END IF;
  
  IF v_after_snapshot IS NOT NULL THEN
    PERFORM debug_create_snapshot(
      'after',
      TG_TABLE_NAME,
      NEW.id,
      v_after_snapshot,
      NULL,
      NEW.user_id
    );
  END IF;
  
  -- Log event
  v_event_id := debug_log_event(
    v_event_type,
    jsonb_build_object(
      'queue_id', COALESCE(NEW.id, OLD.id),
      'status', COALESCE(NEW.status, OLD.status),
      'old_status', OLD.status,
      'new_status', NEW.status
    ),
    COALESCE(NEW.user_id, OLD.user_id),
    NULL,
    TG_TABLE_NAME,
    TG_OP,
    v_before_snapshot,
    v_after_snapshot,
    'INFO'
  );
  
  -- Store rollback data
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO debug_rollback_journal (
      table_name,
      record_id,
      previous_state,
      current_state,
      operation,
      event_log_id
    ) VALUES (
      TG_TABLE_NAME,
      NEW.id,
      v_before_snapshot,
      v_after_snapshot,
      TG_OP,
      v_event_id
    );
  END IF;
  
  -- Run validation after state change
  PERFORM debug_validate_on_update();
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on matching_queue (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'matching_queue'
  ) THEN
    DROP TRIGGER IF EXISTS debug_watch_matching_queue_trigger ON matching_queue;
    CREATE TRIGGER debug_watch_matching_queue_trigger
      AFTER INSERT OR UPDATE OR DELETE ON matching_queue
      FOR EACH ROW
      EXECUTE FUNCTION debug_watch_matching_queue();
  END IF;
END $$;

-- ============================================================================
-- Component #6: Sanity Guards on Incoming Events
-- ============================================================================
-- Function to validate queue entry before insert/update
CREATE OR REPLACE FUNCTION debug_validate_queue_entry(
  p_user_id UUID,
  p_status TEXT,
  p_operation TEXT DEFAULT 'INSERT'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_status TEXT;
  v_error_message TEXT;
BEGIN
  -- Guard 1: Check for duplicate queue entries
  IF p_operation = 'INSERT' THEN
    SELECT status INTO v_existing_status
    FROM matching_queue
    WHERE user_id = p_user_id
    AND status IN ('spin_active', 'queue_waiting');
    
    IF FOUND THEN
      v_error_message := format('User %s already in queue with status %s', p_user_id, v_existing_status);
      
      INSERT INTO debug_validation_errors (
        validator_name,
        error_type,
        error_message,
        affected_users,
        severity
      ) VALUES (
        'sanity_guard',
        'duplicate_queue_entry',
        v_error_message,
        ARRAY[p_user_id],
        'ERROR'
      );
      
      PERFORM debug_log_event(
        'validation_error',
        jsonb_build_object('error', v_error_message, 'guard', 'duplicate_queue_entry'),
        p_user_id,
        NULL,
        'matching_queue',
        'INSERT',
        NULL,
        NULL,
        'ERROR'
      );
      
      RAISE EXCEPTION '%', v_error_message;
    END IF;
  END IF;
  
  -- Guard 2: Check if user is already paired
  IF EXISTS (
    SELECT 1 FROM matching_queue
    WHERE user_id = p_user_id
    AND status IN ('paired', 'vote_active', 'video_date')
  ) THEN
    v_error_message := format('User %s is already paired, cannot join queue', p_user_id);
    
    INSERT INTO debug_validation_errors (
      validator_name,
      error_type,
      error_message,
      affected_users,
      severity
    ) VALUES (
      'sanity_guard',
      'user_already_paired',
      v_error_message,
      ARRAY[p_user_id],
      'ERROR'
    );
    
    PERFORM debug_log_event(
      'validation_error',
      jsonb_build_object('error', v_error_message, 'guard', 'user_already_paired'),
      p_user_id,
      NULL,
      'matching_queue',
      p_operation,
      NULL,
      NULL,
      'ERROR'
    );
    
    RAISE EXCEPTION '%', v_error_message;
  END IF;
  
  -- Guard 3: Validate status transition
  IF p_operation = 'UPDATE' THEN
    -- Allow valid transitions
    -- spin_active -> queue_waiting -> paired -> vote_active -> video_date OR back to spin_active
    -- This would be more complex in practice
    
    -- For now, we'll log invalid transitions without blocking
    IF p_status NOT IN ('spin_active', 'queue_waiting', 'paired', 'vote_active', 'video_date') THEN
      v_error_message := format('Invalid status transition to %s', p_status);
      
      PERFORM debug_log_event(
        'invalid_status_transition',
        jsonb_build_object('status', p_status, 'user_id', p_user_id),
        p_user_id,
        NULL,
        'matching_queue',
        'UPDATE',
        NULL,
        NULL,
        'WARNING'
      );
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #2: Atomic Pairing - Wrapper for process_matching
-- ============================================================================
-- Wrapper function to ensure atomic pairing with debugging
CREATE OR REPLACE FUNCTION debug_process_matching_atomic(
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_match_id UUID;
  v_lock_id UUID;
  v_start_time TIMESTAMP WITH TIME ZONE;
  v_end_time TIMESTAMP WITH TIME ZONE;
  v_error_message TEXT;
BEGIN
  v_start_time := NOW();
  
  -- Component #14: Race Condition Sentinel
  -- Check for concurrent operations
  IF EXISTS (
    SELECT 1 FROM debug_race_conditions
    WHERE user_id = p_user_id
    AND operation_type = 'pairing'
    AND resolved = FALSE
    AND detected_at > NOW() - INTERVAL '5 seconds'
  ) THEN
    INSERT INTO debug_race_conditions (
      operation_type,
      user_id,
      concurrent_operations,
      resolution_action
    ) VALUES (
      'pairing',
      p_user_id,
      jsonb_build_object('detected_at', NOW()),
      'blocked'
    );
    
    RAISE EXCEPTION 'Concurrent pairing operation detected for user %', p_user_id;
  END IF;
  
  -- Create pairing lock
  BEGIN
    v_lock_id := debug_create_pairing_lock(p_user_id, NULL, 10, 'pairing_operation');
  EXCEPTION WHEN OTHERS THEN
    -- Lock already exists, log race condition
    INSERT INTO debug_race_conditions (
      operation_type,
      user_id,
      concurrent_operations,
      resolution_action
    ) VALUES (
      'pairing',
      p_user_id,
      jsonb_build_object('error', SQLERRM),
      'blocked_by_lock'
    );
    
    RAISE;
  END;
  
  -- Log pairing attempt
  PERFORM debug_log_event(
    'pairing_attempt',
    jsonb_build_object('user_id', p_user_id, 'lock_id', v_lock_id),
    p_user_id,
    NULL,
    NULL,
    'RPC',
    NULL,
    NULL,
    'INFO'
  );
  
  -- Call the actual process_matching function
  -- Note: This assumes process_matching exists as an RPC function
  BEGIN
    SELECT process_matching INTO v_match_id FROM process_matching(p_user_id);
    
    v_end_time := NOW();
    
    -- Log successful pairing
    IF v_match_id IS NOT NULL THEN
      PERFORM debug_log_event(
        'pairing_success',
        jsonb_build_object(
          'user_id', p_user_id,
          'match_id', v_match_id,
          'duration_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000
        ),
        p_user_id,
        NULL,
        NULL,
        'RPC',
        NULL,
        NULL,
        'INFO'
      );
    ELSE
      PERFORM debug_log_event(
        'pairing_no_match',
        jsonb_build_object('user_id', p_user_id),
        p_user_id,
        NULL,
        NULL,
        'RPC',
        NULL,
        NULL,
        'INFO'
      );
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    v_error_message := SQLERRM;
    
    -- Log pairing error
    PERFORM debug_log_event(
      'pairing_error',
      jsonb_build_object('user_id', p_user_id, 'error', v_error_message),
      p_user_id,
      NULL,
      NULL,
      'RPC',
      NULL,
      NULL,
      'ERROR'
    );
    
    -- Log validation error
    INSERT INTO debug_validation_errors (
      validator_name,
      error_type,
      error_message,
      affected_users,
      severity
    ) VALUES (
      'pairing_function',
      'pairing_error',
      v_error_message,
      ARRAY[p_user_id],
      'ERROR'
    );
    
    -- Re-raise error
    RAISE;
  END;
  
  -- Release lock
  PERFORM debug_release_lock(v_lock_id, FALSE);
  
  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #11: Event Ordering Verifier
-- ============================================================================
-- Function to validate event sequence
CREATE OR REPLACE FUNCTION debug_validate_event_sequence(
  p_user_id UUID,
  p_current_event TEXT,
  p_previous_events TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
  v_last_event TEXT;
  v_valid BOOLEAN := TRUE;
  v_error_message TEXT;
BEGIN
  -- Get the last event for this user
  SELECT event_type INTO v_last_event
  FROM debug_event_log
  WHERE user_id = p_user_id
  ORDER BY timestamp DESC
  LIMIT 1;
  
  -- Define valid event sequences
  -- Example: vote should only happen after pair, respin after vote, etc.
  
  -- Validation 1: Vote before pair
  IF p_current_event = 'vote_cast' AND v_last_event NOT IN ('pairing_success', 'queue_entry_created') THEN
    v_valid := FALSE;
    v_error_message := format('Vote attempted before pairing for user %s', p_user_id);
  END IF;
  
  -- Validation 2: Respin before vote
  IF p_current_event = 'respin' AND v_last_event != 'vote_cast' THEN
    v_valid := FALSE;
    v_error_message := format('Respin attempted before vote for user %s', p_user_id);
  END IF;
  
  -- Validation 3: Spin while paired
  IF p_current_event = 'queue_entry_created' AND EXISTS (
    SELECT 1 FROM matching_queue
    WHERE user_id = p_user_id
    AND status IN ('paired', 'vote_active', 'video_date')
  ) THEN
    v_valid := FALSE;
    v_error_message := format('Spin attempted while paired for user %s', p_user_id);
  END IF;
  
  IF NOT v_valid THEN
    -- Log ordering error
    INSERT INTO debug_event_ordering_errors (
      user_id,
      invalid_sequence,
      error_message
    ) VALUES (
      p_user_id,
      jsonb_build_object(
        'current_event', p_current_event,
        'last_event', v_last_event,
        'previous_events', p_previous_events
      ),
      v_error_message
    );
    
    PERFORM debug_log_event(
      'event_ordering_error',
      jsonb_build_object('error', v_error_message, 'current_event', p_current_event),
      p_user_id,
      NULL,
      NULL,
      'VALIDATION',
      NULL,
      NULL,
      'WARNING'
    );
  END IF;
  
  RETURN v_valid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #12: Orphan State Scanner
-- ============================================================================
-- Function to scan for orphaned state
CREATE OR REPLACE FUNCTION debug_scan_orphan_states()
RETURNS INTEGER AS $$
DECLARE
  v_orphan_count INTEGER := 0;
BEGIN
  -- Scan 1: Users referenced in pairs who are not in users map
  -- (This would check if user exists in profiles table)
  
  -- Scan 2: Vote entries for users not paired
  -- (Implementation depends on votes table structure)
  
  -- Scan 3: Locks referring to missing users
  INSERT INTO debug_orphan_states (
    orphan_type,
    user_id,
    related_data,
    auto_cleaned
  )
  SELECT 
    'lock_for_missing_user',
    dlt.user_id,
    jsonb_build_object('lock_id', dlt.id, 'lock_type', dlt.lock_type),
    FALSE
  FROM debug_lock_tracker dlt
  WHERE dlt.released_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = dlt.user_id
  );
  
  GET DIAGNOSTICS v_orphan_count = ROW_COUNT;
  
  -- Scan 4: Users in queue but not in profiles
  INSERT INTO debug_orphan_states (
    orphan_type,
    user_id,
    related_data,
    auto_cleaned
  )
  SELECT 
    'user_in_queue_not_in_users',
    mq.user_id,
    jsonb_build_object('queue_id', mq.id, 'status', mq.status),
    FALSE
  FROM matching_queue mq
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = mq.user_id
  );
  
  GET DIAGNOSTICS v_orphan_count = v_orphan_count + ROW_COUNT;
  
  RETURN v_orphan_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #13: Synchronised Time Engine - Timer Functions
-- ============================================================================
-- Function to start a timer
CREATE OR REPLACE FUNCTION debug_start_timer(
  p_timer_type TEXT,
  p_user_id UUID,
  p_timeout_ms INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_timer_id UUID;
BEGIN
  INSERT INTO debug_time_events (
    timer_type,
    user_id,
    started_at,
    expected_end_at,
    timeout_duration_ms,
    status
  ) VALUES (
    p_timer_type,
    p_user_id,
    NOW(),
    NOW() + (p_timeout_ms || ' milliseconds')::INTERVAL,
    p_timeout_ms,
    'active'
  ) RETURNING id INTO v_timer_id;
  
  -- Log timer start
  PERFORM debug_log_event(
    'timer_started',
    jsonb_build_object('timer_id', v_timer_id, 'timer_type', p_timer_type, 'timeout_ms', p_timeout_ms),
    p_user_id,
    NULL,
    'debug_time_events',
    'INSERT',
    NULL,
    NULL,
    'INFO'
  );
  
  RETURN v_timer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel/complete a timer
CREATE OR REPLACE FUNCTION debug_complete_timer(
  p_timer_id UUID,
  p_status TEXT DEFAULT 'completed'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_timer RECORD;
  v_drift_ms INTEGER;
BEGIN
  SELECT * INTO v_timer
  FROM debug_time_events
  WHERE id = p_timer_id
  AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Calculate drift
  v_drift_ms := EXTRACT(EPOCH FROM (NOW() - v_timer.expected_end_at)) * 1000;
  
  UPDATE debug_time_events
  SET status = p_status,
      actual_end_at = NOW(),
      drift_ms = v_drift_ms
  WHERE id = p_timer_id;
  
  -- Log timer completion
  PERFORM debug_log_event(
    'timer_completed',
    jsonb_build_object(
      'timer_id', p_timer_id,
      'timer_type', v_timer.timer_type,
      'drift_ms', v_drift_ms,
      'status', p_status
    ),
    v_timer.user_id,
    NULL,
    'debug_time_events',
    'UPDATE',
    NULL,
    NULL,
    'INFO'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Component #4: Heartbeat Manager - Cleanup Function
-- ============================================================================
-- Function to check and clean up disconnected users
CREATE OR REPLACE FUNCTION debug_heartbeat_cleanup(
  p_timeout_seconds INTEGER DEFAULT 60
)
RETURNS INTEGER AS $$
DECLARE
  v_cleaned_count INTEGER := 0;
  v_disconnected_user RECORD;
BEGIN
  -- Find users who haven't sent heartbeat in timeout period
  FOR v_disconnected_user IN
    SELECT user_id
    FROM debug_heartbeat_tracker
    WHERE is_online = TRUE
    AND last_heartbeat < NOW() - (p_timeout_seconds || ' seconds')::INTERVAL
  LOOP
    -- Mark as offline
    UPDATE debug_heartbeat_tracker
    SET is_online = FALSE
    WHERE user_id = v_disconnected_user.user_id;
    
    -- Remove from queue
    UPDATE matching_queue
    SET status = 'idle'
    WHERE user_id = v_disconnected_user.user_id
    AND status IN ('spin_active', 'queue_waiting');
    
    -- Clear locks
    UPDATE debug_lock_tracker
    SET released_at = NOW(),
        auto_released = TRUE
    WHERE user_id = v_disconnected_user.user_id
    AND released_at IS NULL;
    
    -- Log cleanup
    PERFORM debug_log_event(
      'heartbeat_timeout',
      jsonb_build_object('user_id', v_disconnected_user.user_id, 'timeout_seconds', p_timeout_seconds),
      v_disconnected_user.user_id,
      NULL,
      'debug_heartbeat_tracker',
      'UPDATE',
      NULL,
      NULL,
      'WARNING'
    );
    
    v_cleaned_count := v_cleaned_count + 1;
  END LOOP;
  
  RETURN v_cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Scheduled Jobs (for production, use pg_cron extension)
-- ============================================================================
-- Note: These would be set up using pg_cron or external scheduler

-- Job 1: Run orphan state scan every 5 minutes
-- SELECT cron.schedule('debug-scan-orphans', '*/5 * * * *', 'SELECT debug_scan_orphan_states();');

-- Job 2: Run heartbeat cleanup every 30 seconds
-- SELECT cron.schedule('debug-heartbeat-cleanup', '*/30 * * * * *', 'SELECT debug_heartbeat_cleanup(60);');

-- Job 3: Validate state every minute
-- SELECT cron.schedule('debug-validate-state', '* * * * *', 'SELECT debug_validate_state();');

-- ============================================================================
-- Completion
-- ============================================================================

COMMENT ON FUNCTION debug_validate_queue_entry IS 'Component #6: Sanity guards on incoming events';
COMMENT ON FUNCTION debug_process_matching_atomic IS 'Component #2: Atomic pairing with race condition detection';
COMMENT ON FUNCTION debug_validate_event_sequence IS 'Component #11: Event ordering verifier';
COMMENT ON FUNCTION debug_scan_orphan_states IS 'Component #12: Orphan state scanner';
COMMENT ON FUNCTION debug_start_timer IS 'Component #13: Synchronised time engine - start timer';
COMMENT ON FUNCTION debug_heartbeat_cleanup IS 'Component #4: Heartbeat manager - cleanup disconnected users';

