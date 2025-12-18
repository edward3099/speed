-- ============================================================================
-- Fix Match Persistence Issues
-- ============================================================================
-- CRITICAL FIXES:
-- 1. Ensure join_queue preserves matches (already exists, but ensure it's correct)
-- 2. Fix auto_remove_offline_users to NOT clear matched users (too aggressive)
-- 3. Ensure vote windows are set to 60 seconds consistently
-- 4. Prevent cleanup functions from clearing active matches
-- ============================================================================

-- ============================================================================
-- FIX 1: Ensure join_queue preserves matches (reapply fix to be safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
  v_current_state TEXT;
BEGIN
  -- Get current state and fairness
  SELECT 
    COALESCE(state, 'idle'),
    COALESCE(fairness, 0)
  INTO v_current_state, v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- CRITICAL FIX: If user is already matched, don't clear their match!
  -- They should stay matched and not rejoin queue
  IF v_current_state = 'matched' THEN
    -- User is already matched - don't clear their match_id
    -- Just update last_active to keep them online
    UPDATE users_state
    SET
      last_active = NOW(),
      updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN; -- Exit early, don't clear match
  END IF;
  
  -- CRITICAL FIX: Also check if user is in an active match (race condition protection)
  -- This handles cases where state hasn't been updated to 'matched' yet but match exists
  IF EXISTS (
    SELECT 1 FROM matches m
    WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
      AND m.status = 'active'
      AND m.outcome IS NULL
      AND (m.vote_window_expires_at IS NULL OR m.vote_window_expires_at > NOW())
  ) THEN
    -- User is in an active match - don't clear it
    -- Update last_active and state to matched (if not already)
    UPDATE users_state
    SET
      state = 'matched',
      match_id = (SELECT match_id FROM matches WHERE (user1_id = p_user_id OR user2_id = p_user_id) AND status = 'active' AND outcome IS NULL LIMIT 1),
      last_active = NOW(),
      updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN; -- Exit early, don't clear match
  END IF;

  -- Only allow joining queue from 'idle' or 'waiting' states
  -- This prevents clearing matches when user is already matched
  IF v_current_state NOT IN ('idle', 'waiting') THEN
    -- Invalid state transition - log and return
    -- Don't throw error, just silently return (idempotent behavior)
    RETURN;
  END IF;

  -- Single atomic operation: Update or insert user state
  INSERT INTO users_state (
    user_id,
    state,
    waiting_since,
    fairness,
    partner_id,
    match_id,
    last_active,
    updated_at
  )
  VALUES (
    p_user_id,
    'waiting',
    NOW(),
    COALESCE(v_fairness, 0),
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    state = 'waiting',
    waiting_since = NOW(),
    partner_id = NULL,
    match_id = NULL,
    last_active = NOW(),
    updated_at = NOW(),
    fairness = COALESCE(users_state.fairness, 0)
  WHERE users_state.state IN ('idle', 'waiting'); -- Only update if in valid states
  
  -- Note: Database constraints ensure valid state transitions
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Add user to queue (idle → waiting). CRITICAL: Preserves matches - does NOT clear match_id if user is already matched. Only allows joining from idle or waiting states.';

-- ============================================================================
-- FIX 2: Fix auto_remove_offline_users to NOT clear matched users
-- ============================================================================
-- Issue: Function is too aggressive - clears matches for users who are actively matched
-- Fix: Only remove users from queue (waiting state), NOT matched users
--      Matched users should only be cleared by resolve_expired_votes or record_vote
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_remove_offline_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_removed INTEGER := 0;
BEGIN
  -- CRITICAL FIX: Only remove users from queue (waiting state)
  -- DO NOT touch matched users - they are handled by resolve_expired_votes
  -- Matched users might have brief delays in heartbeat but are still in active matches
  
  -- Remove offline users from queue only (waiting state)
  DELETE FROM queue
  WHERE user_id IN (
    SELECT user_id FROM users_state
    WHERE last_active < NOW() - INTERVAL '30 seconds' -- More lenient: 30 seconds instead of 10
      AND state = 'waiting' -- ONLY waiting state, NOT matched
  );
  
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  
  -- Reset their state to idle (only waiting users, NOT matched users)
  UPDATE users_state
  SET 
    state = 'idle', 
    match_id = NULL, 
    partner_id = NULL,
    updated_at = NOW()
  WHERE state = 'waiting' -- ONLY waiting state
    AND last_active < NOW() - INTERVAL '30 seconds'; -- More lenient: 30 seconds
  
  -- DO NOT cancel matches - let resolve_expired_votes handle expired vote windows
  -- DO NOT clear matched users - they are in active matches
  
  RETURN v_removed;
END;
$$;

COMMENT ON FUNCTION auto_remove_offline_users IS 'Removes offline users (last_active > 30s) from queue ONLY. Does NOT touch matched users - they are handled by resolve_expired_votes.';

-- ============================================================================
-- FIX 3: Ensure try_match_user sets vote window to 60 seconds consistently
-- ============================================================================
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

  -- Verify user is actively waiting
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
  -- Partner must also be actively waiting (same relaxed criteria)
  -- Filter by city preferences (overlapping cities) and age range
  SELECT 
    us.user_id,
    us.fairness,
    us.waiting_since
  INTO v_partner
  FROM users_state us
  INNER JOIN profiles p1 ON us.user_id = p1.id
  INNER JOIN profiles p2 ON v_user_state.user_id = p2.id
  LEFT JOIN user_preferences up1 ON us.user_id = up1.user_id -- Partner's preferences
  LEFT JOIN user_preferences up2 ON v_user_state.user_id = up2.user_id -- Current user's preferences
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
    -- City preference matching: users match if they have at least one city in common
    -- OR if either user has no city preference (NULL or empty array)
    AND (
      -- Both have no city preference (match anyone)
      (up1.city IS NULL OR array_length(up1.city, 1) IS NULL)
      AND (up2.city IS NULL OR array_length(up2.city, 1) IS NULL)
      OR
      -- Current user has no city preference (match anyone)
      (up2.city IS NULL OR array_length(up2.city, 1) IS NULL)
      OR
      -- Partner has no city preference (match anyone)
      (up1.city IS NULL OR array_length(up1.city, 1) IS NULL)
      OR
      -- Both have city preferences - check for overlap (at least one city in common)
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(up1.city, ARRAY[]::TEXT[])) AS city1
        WHERE city1 = ANY(COALESCE(up2.city, ARRAY[]::TEXT[]))
      )
    )
    -- Age range matching: user's age must be within partner's min_age/max_age
    -- AND partner's age must be within user's min_age/max_age
    AND (
      -- Current user's age is within partner's age range
      (up1.min_age IS NULL OR p2.age >= up1.min_age)
      AND (up1.max_age IS NULL OR p2.age <= up1.max_age)
    )
    AND (
      -- Partner's age is within current user's age range
      (up2.min_age IS NULL OR p1.age >= up2.min_age)
      AND (up2.max_age IS NULL OR p1.age <= up2.max_age)
    )
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

  -- If no partner found, return NULL (no lock was needed)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- CRITICAL SECTION: Acquire locks just before match creation
  -- Try to acquire lock on partner (prevent partner from being matched by another process)
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtext(v_partner.user_id::TEXT)
  );
  
  IF NOT v_lock_acquired THEN
    -- Partner is being matched by another process, skip
    RETURN NULL;
  END IF;

  -- Double-check both users still available (state may have changed during query)
  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = p_user_id
      AND state = 'waiting'
      AND (
        waiting_since > NOW() - INTERVAL '60 seconds'
        OR last_active > NOW() - INTERVAL '15 seconds'
      )
  ) THEN
    -- Current user no longer available
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users_state
    WHERE user_id = v_partner.user_id
      AND state = 'waiting'
      AND (
        waiting_since > NOW() - INTERVAL '60 seconds'
        OR last_active > NOW() - INTERVAL '15 seconds'
      )
  ) THEN
    -- Partner no longer available
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

  -- CRITICAL FIX: Initialize vote window immediately after match creation (60 seconds)
  -- Set status to 'active' (required by constraint when vote_window_expires_at is set)
  -- This prevents matches from getting stuck in 'paired' state
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '60 seconds', -- FIXED: 60 seconds, not 10
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

  -- Record in match_history (prevents rematching)
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

COMMENT ON FUNCTION try_match_user IS 
'Event-driven matching for specific user. Uses advisory locks and double-check locking. Returns match_id if matched, NULL otherwise. Sets vote window to 60 seconds.';

-- ============================================================================
-- FIX 4: Ensure resolve_expired_votes handles 'active' status correctly
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_expired_votes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_resolved_count INTEGER := 0;
BEGIN
  -- Find expired vote windows
  FOR v_match IN
    SELECT 
      match_id,
      user1_id,
      user2_id,
      user1_vote,
      user2_vote
    FROM matches
    WHERE vote_window_expires_at < NOW()
      AND status = 'active' -- FIXED: Check for 'active' status, not 'vote_active'
      AND outcome IS NULL
  LOOP
    -- Determine outcome based on votes received (or lack thereof)
    DECLARE
      v_outcome TEXT;
    BEGIN
      -- Determine outcome
      IF v_match.user1_vote IS NULL AND v_match.user2_vote IS NULL THEN
        v_outcome := 'idle_idle';
      ELSIF v_match.user1_vote = 'pass' AND v_match.user2_vote IS NULL THEN
        v_outcome := 'pass_idle';
      ELSIF v_match.user1_vote IS NULL AND v_match.user2_vote = 'pass' THEN
        v_outcome := 'pass_idle';
      ELSIF v_match.user1_vote = 'yes' AND v_match.user2_vote IS NULL THEN
        v_outcome := 'yes_idle';
      ELSIF v_match.user1_vote IS NULL AND v_match.user2_vote = 'yes' THEN
        v_outcome := 'yes_idle';
      ELSE
        -- Should not happen, but handle gracefully
        v_outcome := 'idle_idle';
      END IF;

      -- Update match
      UPDATE matches
      SET 
        outcome = v_outcome,
        status = 'completed',
        updated_at = NOW()
      WHERE match_id = v_match.match_id;

      -- Handle outcome
      IF v_outcome = 'idle_idle' THEN
        -- Both → idle
        UPDATE users_state
        SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
        WHERE user_id IN (v_match.user1_id, v_match.user2_id);
        
      ELSIF v_outcome = 'pass_idle' THEN
        -- Pass user → waiting, idle user → idle
        UPDATE users_state
        SET state = 'waiting', match_id = NULL, partner_id = NULL, updated_at = NOW()
        WHERE user_id IN (
          SELECT CASE 
            WHEN v_match.user1_vote = 'pass' THEN v_match.user1_id
            ELSE v_match.user2_id
          END
        );
        UPDATE users_state
        SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
        WHERE user_id IN (
          SELECT CASE 
            WHEN v_match.user1_vote IS NULL THEN v_match.user1_id
            ELSE v_match.user2_id
          END
        );
        
      ELSIF v_outcome = 'yes_idle' THEN
        -- Yes user → waiting (with boost), idle user → idle
        UPDATE users_state
        SET 
          state = 'waiting', 
          match_id = NULL, 
          partner_id = NULL, 
          fairness = fairness + 1, -- Boost fairness
          updated_at = NOW()
        WHERE user_id IN (
          SELECT CASE 
            WHEN v_match.user1_vote = 'yes' THEN v_match.user1_id
            ELSE v_match.user2_id
          END
        );
        UPDATE users_state
        SET state = 'idle', match_id = NULL, partner_id = NULL, updated_at = NOW()
        WHERE user_id IN (
          SELECT CASE 
            WHEN v_match.user1_vote IS NULL THEN v_match.user1_id
            ELSE v_match.user2_id
          END
        );
      END IF;
      
      v_resolved_count := v_resolved_count + 1;
    END;
  END LOOP;
  
  RETURN v_resolved_count;
END;
$$;

COMMENT ON FUNCTION resolve_expired_votes IS 'Resolves expired vote windows (status=active). Handles idle_idle, pass_idle, and yes_idle outcomes.';



