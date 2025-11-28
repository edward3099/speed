-- ============================================================================
-- Blueprint Migration 302: Queue Remove
-- ============================================================================
-- Part 3.2: THE ONLY FUNCTION THAT REMOVES USERS FROM QUEUE
-- ============================================================================

-- THE ONLY FUNCTION THAT REMOVES USERS FROM QUEUE
CREATE OR REPLACE FUNCTION queue_remove(
  p_user_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove from queue
  DELETE FROM matching_queue
  WHERE user_id = p_user_id;
  
  -- Log removal
  PERFORM log_event('queue_removed', p_user_id, 
    jsonb_build_object('reason', p_reason),
    'INFO',
    'queue_remove'
  );
END;
$$;

COMMENT ON FUNCTION queue_remove IS 'THE ONLY FUNCTION THAT REMOVES USERS FROM QUEUE - Single entry point for queue removal';

