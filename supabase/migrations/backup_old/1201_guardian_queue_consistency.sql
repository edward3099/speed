-- ============================================================================
-- Blueprint Migration 1201: Guardian Queue Consistency
-- ============================================================================
-- Part 7.1: Guardian: Ensure queue consistency
-- ============================================================================

-- Guardian: Ensure queue consistency
CREATE OR REPLACE FUNCTION guardian_queue_consistency()
RETURNS JSONB AS $$
DECLARE
  invalid_entries INTEGER;
BEGIN
  -- Find and remove invalid queue entries
  -- Valid states: spin_active, queue_waiting, paired, vote_active
  -- (paired is valid - user is in reveal phase, not yet voting)
  
  -- This should be EMPTY if system is working correctly
  SELECT COUNT(*) INTO invalid_entries
  FROM matching_queue mq
  LEFT JOIN profiles p ON p.id = mq.user_id
  WHERE p.is_online = FALSE
     OR mq.status NOT IN ('spin_active', 'queue_waiting', 'paired', 'vote_active');
  
  IF invalid_entries > 0 THEN
    -- Log warning (not error - this shouldn't happen)
    PERFORM log_event('guardian_warning', NULL,
      jsonb_build_object('type', 'queue_consistency', 'invalid_entries', invalid_entries),
      'WARNING',
      'guardian_queue_consistency'
    );
    
    -- Clean up (but this is a safety net, not the primary mechanism)
    DELETE FROM matching_queue
    WHERE user_id IN (
      SELECT mq.user_id
      FROM matching_queue mq
      LEFT JOIN profiles p ON p.id = mq.user_id
      WHERE p.is_online = FALSE
         OR mq.status NOT IN ('spin_active', 'queue_waiting', 'paired', 'vote_active')
    );
  END IF;
  
  RETURN jsonb_build_object('cleaned', invalid_entries);
END;
$$;

COMMENT ON FUNCTION guardian_queue_consistency IS 'Guardian: Ensures queue consistency - should be EMPTY if system is working correctly (safety net, not primary mechanism)';

