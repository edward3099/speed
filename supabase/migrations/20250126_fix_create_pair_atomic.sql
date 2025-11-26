-- ============================================================================
-- Migration: Fix create_pair_atomic function
-- Date: 2025-01-26
-- ============================================================================
-- Fixes bug where create_pair_atomic was trying to use UUID for match_id
-- when matches table uses BIGSERIAL (BIGINT) for id column
-- ============================================================================

CREATE OR REPLACE FUNCTION create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  match_id BIGINT;
  user1_record RECORD;
  user2_record RECORD;
  locked_user1 BOOLEAN := FALSE;
  locked_user2 BOOLEAN := FALSE;
BEGIN
  -- 1. Lock both users using FOR UPDATE SKIP LOCKED (consistent order to prevent deadlocks)
  -- Always lock lower UUID first
  IF p_user1_id < p_user2_id THEN
    -- Lock user1 first
    SELECT * INTO user1_record
    FROM profiles
    WHERE id = p_user1_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user1 := TRUE;
    
    -- Lock user2
    SELECT * INTO user2_record
    FROM profiles
    WHERE id = p_user2_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user2 := TRUE;
  ELSE
    -- Lock user2 first
    SELECT * INTO user2_record
    FROM profiles
    WHERE id = p_user2_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user2 := TRUE;
    
    -- Lock user1
    SELECT * INTO user1_record
    FROM profiles
    WHERE id = p_user1_id
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    
    locked_user1 := TRUE;
  END IF;
  
  -- 2. Validate eligibility (re-check inside lock)
  -- Both must be online
  IF NOT user1_record.online OR NOT user2_record.online THEN
    RETURN NULL;
  END IF;
  
  -- Both must not be in cooldown
  IF (user1_record.cooldown_until IS NOT NULL AND user1_record.cooldown_until > NOW()) OR
     (user2_record.cooldown_until IS NOT NULL AND user2_record.cooldown_until > NOW()) THEN
    RETURN NULL;
  END IF;
  
  -- Check user_status: both must be spin_active or queue_waiting
  IF NOT EXISTS (
    SELECT 1 FROM user_status WHERE user_id = p_user1_id AND state IN ('spin_active', 'queue_waiting')
  ) OR NOT EXISTS (
    SELECT 1 FROM user_status WHERE user_id = p_user2_id AND state IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Check never_pair_again (symmetric check)
  IF EXISTS (
    SELECT 1 FROM never_pair_again
    WHERE (user1 = p_user1_id AND user2 = p_user2_id)
       OR (user1 = p_user2_id AND user2 = p_user1_id)
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Check neither already paired
  IF EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user1_id OR user2_id = p_user1_id)
      AND status IN ('pending', 'vote_active')
  ) OR EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user2_id OR user2_id = p_user2_id)
      AND status IN ('pending', 'vote_active')
  ) THEN
    RETURN NULL;
  END IF;
  
  -- 3. Create match (ensure user1_id < user2_id for consistency)
  -- Matches table uses BIGSERIAL id (BIGINT), not UUID
  INSERT INTO matches (user1_id, user2_id, status)
  VALUES (
    LEAST(p_user1_id, p_user2_id),
    GREATEST(p_user1_id, p_user2_id),
    'pending'
  )
  RETURNING id INTO match_id;
  
  -- 4. Update both user_status to paired
  UPDATE user_status
  SET state = 'paired',
      last_state = state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id IN (p_user1_id, p_user2_id);
  
  -- 5. Remove both from queue
  DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
  
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION create_pair_atomic IS 'Atomic pairing engine - locks both users, validates eligibility, creates match, updates states';
