-- ============================================================================
-- Simple Matching System - Easy to Debug
-- ============================================================================
-- This is the SIMPLEST possible approach for easy debugging:
-- 1. Simple join_queue function (adds user to queue)
-- 2. Simple process_matching function (runs every 5 seconds, finds pairs)
-- 3. Simple acknowledge_match function (transitions to vote_window)
-- 4. No triggers, no complex locks, easy to trace
-- ============================================================================

-- ============================================================================
-- 1. SIMPLE JOIN QUEUE FUNCTION
-- ============================================================================
-- Adds user to queue, updates state to 'waiting'
-- Idempotent: safe to call multiple times
-- ============================================================================

CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fairness INTEGER;
BEGIN
  -- Get current fairness (default to 0 if new user)
  SELECT COALESCE(fairness, 0) INTO v_fairness
  FROM users_state
  WHERE user_id = p_user_id;

  -- Update or insert user state to 'waiting'
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
    fairness = COALESCE(users_state.fairness, 0);

  -- Add to queue (idempotent)
  INSERT INTO queue (
    user_id,
    fairness,
    waiting_since,
    preference_stage,
    updated_at
  )
  VALUES (
    p_user_id,
    COALESCE(v_fairness, 0),
    NOW(),
    0,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    fairness = COALESCE(EXCLUDED.fairness, queue.fairness),
    waiting_since = NOW(),
    preference_stage = 0,
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION join_queue IS 'Simple function to join queue - idempotent, easy to debug';

-- ============================================================================
-- 2. SIMPLE MATCHING FUNCTION
-- ============================================================================
-- This is the CORE matching function - runs every 5 seconds
-- Finds pairs, creates matches, removes from queue
-- SIMPLE: No complex locks, easy to understand, easy to debug
-- ============================================================================

CREATE OR REPLACE FUNCTION process_matching()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user1 RECORD;
  v_user2 RECORD;
  v_match_id UUID;
  v_matches_created INTEGER := 0;
  v_potential_match RECORD;
BEGIN
  -- Process queue: find pairs
  -- Order by fairness DESC, waiting_since ASC (long waiters first)
  FOR v_user1 IN
    SELECT 
      q.user_id,
      q.fairness,
      q.waiting_since,
      us.state
    FROM queue q
    INNER JOIN users_state us ON q.user_id = us.user_id
    WHERE us.state = 'waiting'
      AND us.last_active > NOW() - INTERVAL '30 seconds' -- Only online users
    ORDER BY q.fairness DESC, q.waiting_since ASC
    LIMIT 50 -- Process up to 50 users per run
  LOOP
    -- Skip if user1 is already matched (safety check)
    IF EXISTS (
      SELECT 1 FROM users_state
      WHERE user_id = v_user1.user_id
      AND state IN ('paired', 'vote_window', 'video_date')
    ) THEN
      CONTINUE;
    END IF;

    -- Find a partner for user1
    -- Exclude: same user, already matched, offline, matched before
    SELECT 
      q.user_id,
      q.fairness,
      q.waiting_since
    INTO v_potential_match
    FROM queue q
    INNER JOIN users_state us ON q.user_id = us.user_id
    WHERE us.user_id != v_user1.user_id
      AND us.state = 'waiting'
      AND us.last_active > NOW() - INTERVAL '30 seconds'
      -- Check match history: never match same pair twice
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = v_user1.user_id AND m.user2_id = us.user_id)
           OR (m.user1_id = us.user_id AND m.user2_id = v_user1.user_id)
      )
      -- User2 not already matched
      AND NOT EXISTS (
        SELECT 1 FROM users_state
        WHERE user_id = us.user_id
        AND state IN ('paired', 'vote_window', 'video_date')
      )
    ORDER BY q.fairness DESC, q.waiting_since ASC
    LIMIT 1;

    -- If we found a partner, create match
    IF v_potential_match IS NOT NULL THEN
      v_match_id := gen_random_uuid();

      -- Create match
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
        v_user1.user_id,
        v_potential_match.user_id,
        'paired',
        NOW(),
        NOW()
      );

      -- Update both users to 'paired' state
      UPDATE users_state
      SET
        state = 'paired',
        match_id = v_match_id,
        partner_id = CASE 
          WHEN user_id = v_user1.user_id THEN v_potential_match.user_id
          ELSE v_user1.user_id
        END,
        updated_at = NOW()
      WHERE user_id IN (v_user1.user_id, v_potential_match.user_id);

      -- Remove both from queue
      DELETE FROM queue
      WHERE user_id IN (v_user1.user_id, v_potential_match.user_id);

      v_matches_created := v_matches_created + 1;

      -- Log match creation (if logging table exists)
      BEGIN
        INSERT INTO matching_log (
          user1_id,
          user2_id,
          match_id,
          action,
          created_at
        )
        VALUES (
          v_user1.user_id,
          v_potential_match.user_id,
          v_match_id,
          'match_created',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Logging table might not exist, ignore
        NULL;
      END;

      -- Break after creating one match (process one at a time for simplicity)
      -- This ensures fairness: long waiters get matched first
      EXIT;
    END IF;
  END LOOP;

  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION process_matching IS 'Simple matching function - runs every 5 seconds, finds pairs, creates matches. Easy to debug.';

-- ============================================================================
-- 3. SIMPLE ACKNOWLEDGE MATCH FUNCTION
-- ============================================================================
-- When both users acknowledge, transition to vote_window
-- Simple: checks if both acknowledged, then transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION acknowledge_match(p_user_id UUID, p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_user1_acknowledged BOOLEAN;
  v_user2_acknowledged BOOLEAN;
  v_both_acknowledged BOOLEAN;
  v_vote_window_expires_at TIMESTAMPTZ;
BEGIN
  -- Get match info
  SELECT 
    user1_id,
    user2_id,
    user1_acknowledged_at,
    user2_acknowledged_at,
    vote_window_started_at
  INTO v_match
  FROM matches
  WHERE match_id = p_match_id
    AND (user1_id = p_user_id OR user2_id = p_user_id);

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Match not found or user not part of match'
    );
  END IF;

  -- Update acknowledgment for this user
  IF p_user_id = v_match.user1_id THEN
    UPDATE matches
    SET user1_acknowledged_at = NOW(),
        updated_at = NOW()
    WHERE match_id = p_match_id
      AND user1_acknowledged_at IS NULL;
  ELSE
    UPDATE matches
    SET user2_acknowledged_at = NOW(),
        updated_at = NOW()
    WHERE match_id = p_match_id
      AND user2_acknowledged_at IS NULL;
  END IF;

  -- Check if both acknowledged
  SELECT 
    user1_acknowledged_at IS NOT NULL,
    user2_acknowledged_at IS NOT NULL
  INTO v_user1_acknowledged, v_user2_acknowledged
  FROM matches
  WHERE match_id = p_match_id;

  v_both_acknowledged := v_user1_acknowledged AND v_user2_acknowledged;

  -- If both acknowledged, start vote window
  IF v_both_acknowledged AND v_match.vote_window_started_at IS NULL THEN
    v_vote_window_expires_at := NOW() + INTERVAL '10 seconds'; -- 10 second voting window

    -- Update match to vote_active
    UPDATE matches
    SET
      status = 'vote_active',
      vote_window_started_at = NOW(),
      vote_window_expires_at = v_vote_window_expires_at,
      updated_at = NOW()
    WHERE match_id = p_match_id;

    -- Update both users to vote_window state
    UPDATE users_state
    SET
      state = 'vote_window',
      updated_at = NOW()
    WHERE user_id IN (v_match.user1_id, v_match.user2_id);

    RETURN jsonb_build_object(
      'success', true,
      'vote_window_started', true,
      'vote_window_expires_at', v_vote_window_expires_at
    );
  END IF;

  -- Not both acknowledged yet
  RETURN jsonb_build_object(
    'success', true,
    'vote_window_started', false,
    'user1_acknowledged', v_user1_acknowledged,
    'user2_acknowledged', v_user2_acknowledged
  );
END;
$$;

COMMENT ON FUNCTION acknowledge_match IS 'Simple acknowledge function - when both users acknowledge, transitions to vote_window';

-- ============================================================================
-- 4. HELPER FUNCTION: Get user match status
-- ============================================================================
-- Simple function to get current match status for polling
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_match_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_state RECORD;
  v_match RECORD;
  v_partner RECORD;
  v_result JSONB;
BEGIN
  -- Get user state
  SELECT 
    state,
    match_id,
    partner_id
  INTO v_user_state
  FROM users_state
  WHERE user_id = p_user_id;

  IF v_user_state IS NULL THEN
    RETURN jsonb_build_object(
      'state', 'idle',
      'match', NULL
    );
  END IF;

  -- If no match, return state only
  IF v_user_state.match_id IS NULL THEN
    RETURN jsonb_build_object(
      'state', v_user_state.state,
      'match', NULL
    );
  END IF;

  -- Get match info
  SELECT 
    match_id,
    user1_id,
    user2_id,
    status,
    outcome,
    vote_window_started_at,
    vote_window_expires_at,
    created_at
  INTO v_match
  FROM matches
  WHERE match_id = v_user_state.match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'state', v_user_state.state,
      'match', NULL
    );
  END IF;

  -- Get partner info
  SELECT 
    id,
    name,
    age,
    photo,
    bio
  INTO v_partner
  FROM profiles
  WHERE id = v_user_state.partner_id;

  -- Build result
  v_result := jsonb_build_object(
    'state', v_user_state.state,
    'match', jsonb_build_object(
      'match_id', v_match.match_id,
      'partner_id', v_user_state.partner_id,
      'partner', CASE 
        WHEN v_partner IS NOT NULL THEN jsonb_build_object(
          'id', v_partner.id,
          'name', v_partner.name,
          'age', v_partner.age,
          'photo', v_partner.photo,
          'bio', v_partner.bio
        )
        ELSE NULL
      END,
      'status', v_match.status,
      'outcome', v_match.outcome,
      'vote_window_started_at', v_match.vote_window_started_at,
      'vote_window_expires_at', v_match.vote_window_expires_at,
      'created_at', v_match.created_at
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_user_match_status IS 'Simple function to get user match status for polling - easy to debug';

