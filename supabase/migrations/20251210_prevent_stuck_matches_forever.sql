-- ============================================================================
-- PREVENT STUCK MATCHES FOREVER - Comprehensive Safeguards
-- ============================================================================
-- This migration ensures matches can NEVER get stuck without vote windows
-- Multiple layers of protection:
-- 1. Database constraint to prevent invalid states
-- 2. Automatic repair function for stuck matches
-- 3. Trigger to auto-initialize vote window if missing
-- 4. Validation in try_match_user function
-- ============================================================================

-- ============================================================================
-- STEP 1: Add database constraint to prevent matches without vote windows
-- ============================================================================
-- Constraint: If status is 'active', vote_window_expires_at MUST be set
-- This prevents matches from being created in invalid states
ALTER TABLE matches
DROP CONSTRAINT IF EXISTS matches_active_requires_vote_window;

ALTER TABLE matches
ADD CONSTRAINT matches_active_requires_vote_window
CHECK (
  -- If status is 'active', vote_window_expires_at must be set
  (status != 'active') OR (vote_window_expires_at IS NOT NULL AND vote_window_started_at IS NOT NULL)
);

-- ============================================================================
-- STEP 2: Create automatic repair function for stuck matches
-- ============================================================================
CREATE OR REPLACE FUNCTION repair_stuck_matches()
RETURNS TABLE(
  repaired_count INTEGER,
  stuck_matches_found INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repaired INTEGER := 0;
  v_found INTEGER := 0;
BEGIN
  -- Find matches that are stuck (status='active' or 'paired' but no vote window)
  SELECT COUNT(*) INTO v_found
  FROM matches
  WHERE (status = 'active' OR status = 'paired')
    AND (vote_window_expires_at IS NULL OR vote_window_started_at IS NULL)
    AND created_at > NOW() - INTERVAL '1 hour'; -- Only check recent matches
  
  -- Repair stuck matches by initializing vote window
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = COALESCE(vote_window_started_at, NOW()),
    vote_window_expires_at = COALESCE(vote_window_expires_at, NOW() + INTERVAL '10 seconds'),
    updated_at = NOW()
  WHERE (status = 'active' OR status = 'paired')
    AND (vote_window_expires_at IS NULL OR vote_window_started_at IS NULL)
    AND created_at > NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS v_repaired = ROW_COUNT;
  
  RETURN QUERY SELECT v_repaired, v_found;
END;
$$;

COMMENT ON FUNCTION repair_stuck_matches IS 'Automatically repairs stuck matches (missing vote windows). Should be called every 10 seconds by cron job.';

-- ============================================================================
-- STEP 3: Create trigger function to auto-initialize vote window
-- ============================================================================
-- This trigger ensures vote window is ALWAYS initialized when match is created
CREATE OR REPLACE FUNCTION ensure_vote_window_initialized()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If match is created with status='active' or 'paired' but no vote window, initialize it
  IF (NEW.status = 'active' OR NEW.status = 'paired')
     AND (NEW.vote_window_expires_at IS NULL OR NEW.vote_window_started_at IS NULL) THEN
    NEW.status := 'active';
    NEW.vote_window_started_at := NOW();
    NEW.vote_window_expires_at := NOW() + INTERVAL '10 seconds';
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_ensure_vote_window_initialized ON matches;
CREATE TRIGGER trigger_ensure_vote_window_initialized
BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION ensure_vote_window_initialized();

COMMENT ON FUNCTION ensure_vote_window_initialized IS 'Trigger function that automatically initializes vote window if missing when match is created or updated. Prevents stuck matches.';

-- ============================================================================
-- STEP 4: Add validation check in try_match_user (already done, but add comment)
-- ============================================================================
-- The try_match_user function already initializes vote window
-- This is documented here for reference

-- ============================================================================
-- STEP 5: Create monitoring function to detect stuck matches
-- ============================================================================
CREATE OR REPLACE FUNCTION check_for_stuck_matches()
RETURNS TABLE(
  stuck_count INTEGER,
  stuck_match_ids UUID[],
  oldest_stuck_match_age INTERVAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stuck_count INTEGER;
  v_stuck_ids UUID[];
  v_oldest_age INTERVAL;
BEGIN
  -- Find stuck matches
  SELECT 
    COUNT(*),
    ARRAY_AGG(match_id),
    MAX(NOW() - created_at)
  INTO v_stuck_count, v_stuck_ids, v_oldest_age
  FROM matches
  WHERE (status = 'active' OR status = 'paired')
    AND (vote_window_expires_at IS NULL OR vote_window_started_at IS NULL)
    AND created_at > NOW() - INTERVAL '1 hour';
  
  RETURN QUERY SELECT 
    COALESCE(v_stuck_count, 0),
    COALESCE(v_stuck_ids, ARRAY[]::UUID[]),
    COALESCE(v_oldest_age, INTERVAL '0 seconds');
END;
$$;

COMMENT ON FUNCTION check_for_stuck_matches IS 'Monitors for stuck matches. Returns count, IDs, and age of stuck matches. Should be called regularly for monitoring.';


