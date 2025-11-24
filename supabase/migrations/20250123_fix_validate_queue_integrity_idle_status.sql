-- Fix: validate_queue_integrity() was using invalid status 'idle'
-- The matching_queue table doesn't allow 'idle' status - valid statuses are:
-- 'spin_active', 'queue_waiting', 'vote_active'
-- 
-- Solution: Delete stuck users instead of setting to 'idle', but exclude users with pending matches

CREATE OR REPLACE FUNCTION public.validate_queue_integrity()
RETURNS JSONB AS $$
DECLARE
  issues JSONB := '[]'::JSONB;
  stuck_users INTEGER := 0;
  orphaned_matches INTEGER := 0;
  duplicate_entries INTEGER := 0;
  invalid_states INTEGER := 0;
  cleaned_stuck INTEGER := 0;
  cleaned_orphaned INTEGER := 0;
  cleaned_duplicates INTEGER := 0;
  cleaned_invalid INTEGER := 0;
BEGIN
  -- 1. Find and fix users stuck in queue too long (>5 minutes)
  SELECT COUNT(*) INTO stuck_users
  FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND joined_at < NOW() - INTERVAL '5 minutes';
  
  IF stuck_users > 0 THEN
    issues := issues || jsonb_build_object('stuck_users', stuck_users);
    
    -- Auto-fix: Delete stuck users (not reset to 'idle' - that's not a valid status)
    -- Only delete if they don't have pending matches (to prevent orphaned matches)
    DELETE FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
      AND joined_at < NOW() - INTERVAL '5 minutes'
      -- CRITICAL: Exclude users with pending matches to prevent orphaned matches
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.status = 'pending'
          AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
      );
    
    GET DIAGNOSTICS cleaned_stuck = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'delete_stuck_users', 'count', cleaned_stuck),
      NULL,
      NULL,
      'matching_queue',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 2. Find and fix orphaned matches (match exists but users not in vote_active)
  SELECT COUNT(*) INTO orphaned_matches
  FROM matches m
  WHERE m.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM matching_queue mq
      WHERE mq.user_id IN (m.user1_id, m.user2_id)
        AND mq.status = 'vote_active'
    );
  
  IF orphaned_matches > 0 THEN
    issues := issues || jsonb_build_object('orphaned_matches', orphaned_matches);
    
    -- Auto-fix: Delete orphaned matches and reset users
    WITH orphaned AS (
      SELECT m.id, m.user1_id, m.user2_id
      FROM matches m
      WHERE m.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM matching_queue mq
          WHERE mq.user_id IN (m.user1_id, m.user2_id)
            AND mq.status = 'vote_active'
        )
    )
    DELETE FROM matches
    WHERE id IN (SELECT id FROM orphaned);
    
    GET DIAGNOSTICS cleaned_orphaned = ROW_COUNT;
    
    -- Reset users back to spin_active (only if they're still in queue)
    WITH orphaned AS (
      SELECT DISTINCT user_id
      FROM (
        SELECT m.user1_id as user_id FROM matches m
        WHERE m.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM matching_queue mq
            WHERE mq.user_id IN (m.user1_id, m.user2_id)
              AND mq.status = 'vote_active'
          )
        UNION
        SELECT m.user2_id as user_id FROM matches m
        WHERE m.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM matching_queue mq
            WHERE mq.user_id IN (m.user1_id, m.user2_id)
              AND mq.status = 'vote_active'
          )
      ) users
    )
    UPDATE matching_queue
    SET status = 'spin_active', updated_at = NOW()
    WHERE user_id IN (SELECT user_id FROM orphaned)
      AND status NOT IN ('spin_active', 'queue_waiting');
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'remove_orphaned_matches', 'count', cleaned_orphaned),
      NULL,
      NULL,
      'matches',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 3. Find and fix duplicate queue entries (same user_id, multiple entries)
  WITH duplicates AS (
    SELECT user_id, COUNT(*) as dup_count
    FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
    GROUP BY user_id
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(*) INTO duplicate_entries FROM duplicates;
  
  IF duplicate_entries > 0 THEN
    issues := issues || jsonb_build_object('duplicate_entries', duplicate_entries);
    
    -- Auto-fix: Keep most recent entry, delete others
    WITH duplicates AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id 
        ORDER BY joined_at DESC
      ) as rn
      FROM matching_queue
      WHERE status IN ('spin_active', 'queue_waiting')
    )
    DELETE FROM matching_queue
    WHERE id IN (
      SELECT id FROM duplicates WHERE rn > 1
    );
    
    GET DIAGNOSTICS cleaned_duplicates = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'remove_duplicate_entries', 'count', cleaned_duplicates),
      NULL,
      NULL,
      'matching_queue',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  -- 4. Find and fix invalid states (vote_active but no match)
  SELECT COUNT(*) INTO invalid_states
  FROM matching_queue mq
  WHERE mq.status = 'vote_active'
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.status = 'pending'
        AND (m.user1_id = mq.user_id OR m.user2_id = mq.user_id)
    );
  
  IF invalid_states > 0 THEN
    issues := issues || jsonb_build_object('invalid_states', invalid_states);
    
    -- Auto-fix: Reset to spin_active
    UPDATE matching_queue
    SET status = 'spin_active', updated_at = NOW()
    WHERE status = 'vote_active'
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.status = 'pending'
          AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
      );
    
    GET DIAGNOSTICS cleaned_invalid = ROW_COUNT;
    
    -- Log the cleanup
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object('action', 'fix_invalid_states', 'count', cleaned_invalid),
      NULL,
      NULL,
      'matching_queue',
      'UPDATE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'issues', issues,
    'stuck_users_found', stuck_users,
    'orphaned_matches_found', orphaned_matches,
    'duplicate_entries_found', duplicate_entries,
    'invalid_states_found', invalid_states,
    'stuck_users_fixed', cleaned_stuck,
    'orphaned_matches_fixed', cleaned_orphaned,
    'duplicate_entries_fixed', cleaned_duplicates,
    'invalid_states_fixed', cleaned_invalid,
    'total_issues', jsonb_array_length(issues)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_queue_integrity IS 'Validates queue integrity and auto-fixes issues: stuck users, orphaned matches, duplicates, invalid states. FIXED: No longer uses invalid "idle" status.';


