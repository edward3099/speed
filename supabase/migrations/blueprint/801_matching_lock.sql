-- ============================================================================
-- Blueprint Migration 801: Matching Lock
-- ============================================================================
-- Part 8.1: Global Matching Lock
-- ============================================================================

-- Prevent multiple matching processes from running simultaneously
CREATE OR REPLACE FUNCTION acquire_matching_lock()
RETURNS BOOLEAN AS $$
DECLARE
  lock_acquired BOOLEAN;
BEGIN
  -- Try to acquire advisory lock
  SELECT pg_try_advisory_lock(123456) INTO lock_acquired;
  
  IF NOT lock_acquired THEN
    -- Another matching process is running
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_matching_lock()
RETURNS VOID AS $$
BEGIN
  PERFORM pg_advisory_unlock(123456);
END;
$$;

COMMENT ON FUNCTION acquire_matching_lock IS 'Acquires global matching lock to prevent concurrent matching processes';
COMMENT ON FUNCTION release_matching_lock IS 'Releases global matching lock';

