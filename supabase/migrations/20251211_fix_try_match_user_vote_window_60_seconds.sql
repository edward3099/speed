-- Fix try_match_user to use 60 seconds for vote window instead of 10 seconds
-- This ensures consistency with the trigger and acknowledge_match function

CREATE OR REPLACE FUNCTION try_match_user(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_state RECORD;
  v_partner RECORD;
  v_match_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_lock_acquired BOOLEAN;
BEGIN
  -- Acquire advisory lock on user (non-blocking)
  -- Use hash of user_id for lock key
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(p_user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Another process is matching this user, skip
    RETURN NULL;
  END IF;

  -- FIXED: Verify user is actively waiting
  -- Must have joined queue recently (within 60 seconds) OR have recent activity (within 15 seconds)
  SELECT 
    user_id,
    state,
    last_active,
    fairness,
    waiting_since
  INTO v_user_state
  FROM users_state
  WHERE user_id = p_user_id
    AND state = 'waiting'
    -- User must have joined queue recently OR have recent activity
    AND (
      -- Joined queue within last 60 seconds (actively spinning)
      waiting_since > NOW() - INTERVAL '60 seconds'
      OR
      -- OR has recent activity (within 15 seconds - accounts for 7s heartbeat + delays)
      last_active > NOW() - INTERVAL '15 seconds'
    );
  
  IF NOT FOUND THEN
    -- User not actively available for matching
    RETURN NULL;
  END IF;

  -- Find best partner
  -- FIXED: Partner must also be actively waiting (same relaxed criteria)
  SELECT 
    us.user_id,
    us.fairness,
    us.waiting_since
  INTO v_partner
  FROM users_state us
  INNER JOIN profiles p1 ON us.user_id = p1.id
  INNER JOIN profiles p2 ON v_user_state.user_id = p2.id
  WHERE us.state = 'waiting'
    AND us.user_id != p_user_id
    -- Partner must have joined queue recently OR have recent activity
    AND (
      -- Joined queue within last 60 seconds (actively spinning)
      us.waiting_since > NOW() - INTERVAL '60 seconds'
      OR
      -- OR has recent activity (within 15 seconds - accounts for 7s heartbeat + delays)
      us.last_active > NOW() - INTERVAL '15 seconds'
    )
    -- Gender compatibility (opposite genders)
    AND p1.gender != p2.gender
    AND p1.gender IS NOT NULL
    AND p2.gender IS NOT NULL
    -- No match history (bidirectional check)
    AND NOT EXISTS (
      SELECT 1 FROM match_history mh
      WHERE (mh.user1_id = p_user_id AND mh.user2_id = us.user_id)
         OR (mh.user1_id = us.user_id AND mh.user2_id = p_user_id)
    )
    -- Partner not already matched
    AND NOT EXISTS (
      SELECT 1 FROM users_state us2
      WHERE us2.user_id = us.user_id
        AND us2.state = 'matched'
    )
  ORDER BY us.fairness DESC, us.waiting_since ASC
  LIMIT 1;

  -- If no partner found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Try to acquire lock on partner
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(v_partner.user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Partner is being matched by another process, skip
    RETURN NULL;
  END IF;

  -- FIXED: Final double-check partner still actively available (same relaxed criteria)
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND state = 'waiting'
      -- Partner must have joined queue recently OR have recent activity
      AND (
        -- Joined queue within last 60 seconds (actively spinning)
        waiting_since > NOW() - INTERVAL '60 seconds'
        OR
        -- OR has recent activity (within 15 seconds - accounts for 7s heartbeat + delays)
        last_active > NOW() - INTERVAL '15 seconds'
      )
  ) THEN
    -- Partner no longer actively available
    RETURN NULL;
  END IF;

  -- Create match (atomic transaction)
  v_match_id := gen_random_uuid();
  
  -- Determine user order (consistent: smaller UUID first)
  IF p_user_id < v_partner.user_id THEN
    v_user1_id := p_user_id;
    v_user2_id := v_partner.user_id;
  ELSE
    v_user1_id := v_partner.user_id;
    v_user2_id := p_user_id;
  END IF;

  -- Insert match with status='paired' initially
  INSERT INTO matches (
    match_id,
    user1_id,
    user2_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_match_id,
    v_user1_id,
    v_user2_id,
    'paired',
    NOW(),
    NOW()
  );

  -- CRITICAL FIX: Initialize vote window immediately after match creation (60 seconds, not 10!)
  -- Set status to 'active' (required by constraint when vote_window_expires_at is set)
  -- This prevents matches from getting stuck in 'paired' state
  -- FIXED: Changed from 10 seconds to 60 seconds to match acknowledge_match and trigger
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '60 seconds',
    updated_at = NOW()
  WHERE match_id = v_match_id;

  -- Update both users to matched state
  UPDATE users_state
  SET
    state = 'matched',
    match_id = v_match_id,
    partner_id = CASE 
      WHEN user_id = p_user_id THEN v_partner.user_id
      ELSE p_user_id
    END,
    updated_at = NOW()
  WHERE user_id IN (p_user_id, v_partner.user_id);

  -- FIXED: Record in match_history (prevents rematching)
  -- Check if exists first (since PK includes match_id, we can't use ON CONFLICT)
  IF NOT EXISTS (
    SELECT 1 FROM match_history
    WHERE (user1_id = v_user1_id AND user2_id = v_user2_id)
       OR (user1_id = v_user2_id AND user2_id = v_user1_id)
  ) THEN
    INSERT INTO match_history (
      user1_id,
      user2_id,
      match_id,
      created_at
    )
    VALUES (
      v_user1_id,
      v_user2_id,
      v_match_id,
      NOW()
    );
  END IF;

  RETURN v_match_id;
END;
$$;
