-- Fix create_pair_atomic to check for existing matches BEFORE trying to insert
-- Also ensure users are removed from queue even if match already exists

CREATE OR REPLACE FUNCTION create_pair_atomic(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
DECLARE
  match_id UUID;
  user1_record RECORD;
  user2_record RECORD;
  locked_user1 BOOLEAN := FALSE;
  locked_user2 BOOLEAN := FALSE;
  existing_match_id UUID;
BEGIN
  -- Check if match already exists FIRST (before locking) - check ANY status due to unique constraint
  SELECT id INTO existing_match_id
  FROM matches
  WHERE user1_id = LEAST(p_user1_id, p_user2_id)
    AND user2_id = GREATEST(p_user1_id, p_user2_id)
  LIMIT 1;
  
  IF existing_match_id IS NOT NULL THEN
    -- Match already exists - check if it's active
    DECLARE
      match_status TEXT;
    BEGIN
      SELECT status INTO match_status
      FROM matches
      WHERE id = existing_match_id;
      
      IF match_status IN ('pending', 'vote_active') THEN
        -- Active match exists - ensure users are removed from queue and return existing match
        DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
        UPDATE user_status
        SET state = 'paired',
            last_state = state,
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (p_user1_id, p_user2_id)
          AND state IN ('spin_active', 'queue_waiting');
        RETURN existing_match_id;
      ELSE
        -- Match exists but is cancelled/ended - can't create new match due to unique constraint
        -- Remove users from queue since they can't be matched
        DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
        RETURN NULL;
      END IF;
    END;
  END IF;
  
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
  
  -- 2. Re-check for existing match AFTER locking (race condition protection) - check ANY status
  SELECT id INTO existing_match_id
  FROM matches
  WHERE user1_id = LEAST(p_user1_id, p_user2_id)
    AND user2_id = GREATEST(p_user1_id, p_user2_id)
  LIMIT 1;
  
  IF existing_match_id IS NOT NULL THEN
    -- Match exists - check status
    DECLARE
      match_status TEXT;
    BEGIN
      SELECT status INTO match_status
      FROM matches
      WHERE id = existing_match_id;
      
      IF match_status IN ('pending', 'vote_active') THEN
        -- Active match was created by another process - clean up and return existing match
        DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
        UPDATE user_status
        SET state = 'paired',
            last_state = state,
            last_state_change = NOW(),
            updated_at = NOW()
        WHERE user_id IN (p_user1_id, p_user2_id)
          AND state IN ('spin_active', 'queue_waiting');
        RETURN existing_match_id;
      ELSE
        -- Match exists but is cancelled/ended - can't create new match
        DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
        RETURN NULL;
      END IF;
    END;
  END IF;
  
  -- 3. Validate eligibility (re-check inside lock)
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
  
  -- 4. Create match (ensure user1_id < user2_id for consistency)
  -- Matches table uses UUID id
  INSERT INTO matches (id, user1_id, user2_id, status)
  VALUES (
    gen_random_uuid(),
    LEAST(p_user1_id, p_user2_id),
    GREATEST(p_user1_id, p_user2_id),
    'pending'
  )
  RETURNING id INTO match_id;
  
  -- 5. Update both user_status to paired
  UPDATE user_status
  SET state = 'paired',
      last_state = state,
      last_state_change = NOW(),
      updated_at = NOW()
  WHERE user_id IN (p_user1_id, p_user2_id);
  
  -- 6. Remove both from queue
  DELETE FROM queue WHERE user_id IN (p_user1_id, p_user2_id);
  
  -- Return UUID
  RETURN match_id;
END;
$$;

COMMENT ON FUNCTION create_pair_atomic IS 'Atomic pairing engine - locks both users, validates eligibility, creates match, updates states';
