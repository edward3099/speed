-- Fix: Prevent cleanup from removing users with pending matches
-- This prevents orphaned matches where match exists but partner queue entry is deleted

CREATE OR REPLACE FUNCTION public.cleanup_stale_queue_entries()
RETURNS JSONB AS $$
DECLARE
  cleaned_count INTEGER := 0;
  offline_removed INTEGER := 0;
  timeout_removed INTEGER := 0;
  duplicate_removed INTEGER := 0;
BEGIN
  -- 1. Remove offline users (if they've been offline > 2 minutes)
  -- CRITICAL: Exclude users who have pending matches
  DELETE FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND user_id IN (
      SELECT id FROM profiles
      WHERE is_online = FALSE
        AND last_active_at < NOW() - INTERVAL '2 minutes'
    )
    -- EXCLUDE users with pending matches to prevent orphaned matches
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.status = 'pending'
        AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
    );
  GET DIAGNOSTICS offline_removed = ROW_COUNT;
  cleaned_count := cleaned_count + offline_removed;
  
  -- 2. Remove users who have been waiting > 10 minutes (timeout)
  -- CRITICAL: Exclude users who have pending matches
  DELETE FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting')
    AND joined_at < NOW() - INTERVAL '10 minutes'
    -- EXCLUDE users with pending matches to prevent orphaned matches
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.status = 'pending'
        AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
    );
  GET DIAGNOSTICS timeout_removed = ROW_COUNT;
  cleaned_count := cleaned_count + timeout_removed;
  
  -- 3. Remove duplicate entries (keep most recent)
  -- CRITICAL: Exclude users who have pending matches
  WITH duplicates AS (
    SELECT id, user_id, ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY joined_at DESC
    ) as rn
    FROM matching_queue
    WHERE status IN ('spin_active', 'queue_waiting')
      -- EXCLUDE users with pending matches to prevent orphaned matches
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.status = 'pending'
          AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
      )
  )
  DELETE FROM matching_queue
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  GET DIAGNOSTICS duplicate_removed = ROW_COUNT;
  cleaned_count := cleaned_count + duplicate_removed;
  
  -- Log cleanup if significant
  IF cleaned_count > 0 THEN
    PERFORM spark_log_event(
      'queue_cleanup',
      jsonb_build_object(
        'action', 'cleanup_stale_entries',
        'offline_removed', offline_removed,
        'timeout_removed', timeout_removed,
        'duplicate_removed', duplicate_removed,
        'total_cleaned', cleaned_count
      ),
      NULL,
      NULL,
      'matching_queue',
      'DELETE',
      NULL,
      NULL,
      'INFO'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'total_cleaned', cleaned_count,
    'offline_removed', offline_removed,
    'timeout_removed', timeout_removed,
    'duplicate_removed', duplicate_removed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_stale_queue_entries IS 'Removes stale queue entries: offline users, timeouts, duplicates. CRITICAL: Excludes users with pending matches to prevent orphaned matches.';


