-- ============================================================================
-- Blueprint Migration 204: Create Match Atomic
-- ============================================================================
-- Part 2.3: Create match atomically with duplicate prevention and strict ordering
-- ============================================================================

-- Create match atomically with duplicate prevention and strict ordering
CREATE OR REPLACE FUNCTION create_match_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  match_id UUID;
  user1_locked BOOLEAN := FALSE;
  user2_locked BOOLEAN := FALSE;
BEGIN
  -- 1. Validate gender compatibility
  IF NOT validate_gender_compatibility(p_user1_id, p_user2_id) THEN
    RETURN NULL;
  END IF;
  
  -- 2. Lock both users in consistent order (prevent deadlocks)
  -- Always lock lower UUID first
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first, then user2
    SELECT TRUE INTO user1_locked
    FROM matching_queue
    WHERE user_id = p_user1_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user1_locked THEN
      RETURN NULL;
    END IF;
    
    SELECT TRUE INTO user2_locked
    FROM matching_queue
    WHERE user_id = p_user2_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user2_locked THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Lock user2 first, then user1
    SELECT TRUE INTO user2_locked
    FROM matching_queue
    WHERE user_id = p_user2_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user2_locked THEN
      RETURN NULL;
    END IF;
    
    SELECT TRUE INTO user1_locked
    FROM matching_queue
    WHERE user_id = p_user1_id
      AND status IN ('queue_waiting', 'spin_active')
    FOR UPDATE NOWAIT;
    
    IF NOT user1_locked THEN
      RETURN NULL;
    END IF;
  END IF;
  
  -- 3. Double-check both users aren't already matched (with locks held)
  IF is_user_already_matched(p_user1_id) OR is_user_already_matched(p_user2_id) THEN
    RETURN NULL;
  END IF;
  
  -- 4. Create match (matches table uses matched_at, not created_at)
  INSERT INTO matches (user1_id, user2_id, status, matched_at)
  VALUES (p_user1_id, p_user2_id, 'pending', NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO match_id;
  
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION create_match_atomic IS 'Creates match atomically with strict ordering to prevent deadlocks and duplicate pairings';

