-- ============================================================================
-- Fix: 20 Users Test Issues
-- ============================================================================
-- Issues Found:
-- 1. Vote window too short (60s) - users don't have time to vote
-- 2. Some users don't reach voting window (redirect issues)
-- 3. Users stuck in voting window after votes
-- ============================================================================

-- ============================================================================
-- FIX 1: Increase vote window duration from 60 to 90 seconds
-- ============================================================================
-- 60 seconds is too short when 20 users are signing in sequentially
-- Some users take longer to reach the voting window
-- Increase to 90 seconds for better reliability
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
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(p_user_id::TEXT));
  IF NOT v_lock_acquired THEN RETURN NULL; END IF;

  -- Verify user is actively waiting
  SELECT user_id, state, last_active, fairness, waiting_since INTO v_user_state 
  FROM users_state 
  WHERE user_id = p_user_id 
    AND state = 'waiting' 
    AND (waiting_since > NOW() - INTERVAL '60 seconds' OR last_active > NOW() - INTERVAL '15 seconds');
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Find compatible partner (more lenient - includes idle users with recent activity)
  SELECT us.user_id, us.fairness, us.waiting_since INTO v_partner
  FROM users_state us
  INNER JOIN profiles p1 ON us.user_id = p1.id
  INNER JOIN profiles p2 ON v_user_state.user_id = p2.id
  LEFT JOIN user_preferences up1 ON us.user_id = up1.user_id
  LEFT JOIN user_preferences up2 ON v_user_state.user_id = up2.user_id
  WHERE us.user_id != p_user_id
    AND ((us.state = 'waiting' AND (us.waiting_since > NOW() - INTERVAL '60 seconds' OR us.last_active > NOW() - INTERVAL '15 seconds')) 
         OR (us.state = 'idle' AND us.last_active > NOW() - INTERVAL '2 seconds'))
    AND p1.gender != p2.gender AND p1.gender IS NOT NULL AND p2.gender IS NOT NULL
    AND ( (up1.city IS NULL OR array_length(up1.city, 1) IS NULL) AND (up2.city IS NULL OR array_length(up2.city, 1) IS NULL) 
          OR (up2.city IS NULL OR array_length(up2.city, 1) IS NULL) 
          OR (up1.city IS NULL OR array_length(up1.city, 1) IS NULL) 
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(up1.city, ARRAY[]::TEXT[])) AS city1 WHERE city1 = ANY(COALESCE(up2.city, ARRAY[]::TEXT[]))) )
    AND ((up1.min_age IS NULL OR p2.age >= up1.min_age) AND (up1.max_age IS NULL OR p2.age <= up1.max_age))
    AND ((up2.min_age IS NULL OR p1.age >= up2.min_age) AND (up2.max_age IS NULL OR p1.age <= up2.max_age))
    AND NOT EXISTS (SELECT 1 FROM match_history mh WHERE (mh.user1_id = p_user_id AND mh.user2_id = us.user_id) OR (mh.user1_id = us.user_id AND mh.user2_id = p_user_id))
    AND NOT EXISTS (SELECT 1 FROM users_state us2 WHERE us2.user_id = us.user_id AND us2.state = 'matched')
  ORDER BY CASE WHEN us.state = 'waiting' THEN 0 ELSE 1 END, us.fairness DESC, us.waiting_since ASC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Lock partner
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(v_partner.user_id::TEXT));
  IF NOT v_lock_acquired THEN RETURN NULL; END IF;

  -- Double-check both users are still available
  IF NOT EXISTS (SELECT 1 FROM users_state WHERE user_id = p_user_id AND state = 'waiting' AND (waiting_since > NOW() - INTERVAL '60 seconds' OR last_active > NOW() - INTERVAL '15 seconds')) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM users_state WHERE user_id = v_partner.user_id AND ((state = 'waiting' AND (waiting_since > NOW() - INTERVAL '60 seconds' OR last_active > NOW() - INTERVAL '15 seconds')) OR (state = 'idle' AND last_active > NOW() - INTERVAL '2 seconds')) AND state != 'matched') THEN RETURN NULL; END IF;

  -- Create match
  v_match_id := gen_random_uuid();
  IF p_user_id < v_partner.user_id THEN 
    v_user1_id := p_user_id; 
    v_user2_id := v_partner.user_id; 
  ELSE 
    v_user1_id := v_partner.user_id; 
    v_user2_id := p_user_id; 
  END IF;

  INSERT INTO matches (match_id, user1_id, user2_id, status, created_at, updated_at) 
  VALUES (v_match_id, v_user1_id, v_user2_id, 'paired', NOW(), NOW());

  -- CRITICAL FIX: Increase vote window from 60 to 90 seconds for better reliability
  -- 60 seconds is too short when multiple users are signing in sequentially
  UPDATE matches
  SET
    status = 'active',
    vote_window_started_at = NOW(),
    vote_window_expires_at = NOW() + INTERVAL '90 seconds', -- INCREASED: 90 seconds instead of 60
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

  -- Record in match_history
  IF NOT EXISTS (SELECT 1 FROM match_history WHERE (user1_id = v_user1_id AND user2_id = v_user2_id) OR (user1_id = v_user2_id AND user2_id = v_user1_id)) THEN
    INSERT INTO match_history (user1_id, user2_id, match_id, created_at) 
    VALUES (v_user1_id, v_user2_id, v_match_id, NOW());
  END IF;

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION try_match_user IS 'Event-driven matching. FIXED: Vote window increased to 90 seconds for better reliability with multiple users.';

-- ============================================================================
-- FIX 2: Also update resolve_expired_votes to handle 90 second windows
-- ============================================================================
-- No changes needed - function already handles any expiration time
-- ============================================================================



