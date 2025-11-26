-- ============================================================================
-- Blueprint Migration 504: Cleanup Expired Soft Offline
-- ============================================================================
-- Part 5.2.1: Cleanup function for expired soft_offline users
-- ============================================================================

-- Create a function that processes all expired soft_offline users
CREATE OR REPLACE FUNCTION cleanup_expired_soft_offline()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_users UUID[];
  cleaned_count INTEGER := 0;
BEGIN
  -- Find all users in soft_offline for more than 10 seconds
  SELECT ARRAY_AGG(user_id) INTO expired_users
  FROM matching_queue
  WHERE status = 'soft_offline'
    AND disconnected_at < NOW() - INTERVAL '10 seconds';
  
  -- Finalize each expired user
  IF expired_users IS NOT NULL THEN
    FOREACH user_id IN ARRAY expired_users
    LOOP
      PERFORM finalize_user_offline(user_id);
      cleaned_count := cleaned_count + 1;
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object(
    'cleaned', cleaned_count,
    'checked_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION cleanup_expired_soft_offline IS 'Processes all expired soft_offline users - should be called by scheduler every 5 seconds';

