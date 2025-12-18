-- Fix get_user_match_status to include partner's actual location (not filter preferences)
-- The location should come from profiles.location, not user_preferences.city

CREATE OR REPLACE FUNCTION get_user_match_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_state RECORD;
  v_match RECORD;
  v_partner RECORD;
  v_partner_user_id UUID;
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
      'user_id', p_user_id,
      'state', 'idle',
      'match', NULL
    );
  END IF;

  -- If no match, return state only
  IF v_user_state.match_id IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'state', v_user_state.state,
      'match', NULL
    );
  END IF;

  -- Get match info including votes
  SELECT 
    match_id,
    user1_id,
    user2_id,
    status,
    outcome,
    user1_vote,
    user2_vote,
    vote_window_started_at,
    vote_window_expires_at,
    created_at
  INTO v_match
  FROM matches
  WHERE match_id = v_user_state.match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'state', v_user_state.state,
      'match', NULL
    );
  END IF;

  -- Get partner info
  -- FIXED: If partner_id is NULL, get partner from match user IDs (fallback)
  -- Determine partner ID: if partner_id is set, use it; otherwise derive from match
  IF v_user_state.partner_id IS NOT NULL THEN
    v_partner_user_id := v_user_state.partner_id;
  ELSE
    -- Fallback: get partner ID from match (user1 or user2, whichever is not current user)
    v_partner_user_id := CASE 
      WHEN v_match.user1_id = p_user_id THEN v_match.user2_id
      ELSE v_match.user1_id
    END;
  END IF;
  
  -- Get partner profile - IMPORTANT: Get location from profiles.location (actual location)
  -- NOT from user_preferences.city (filter preferences)
  SELECT 
    id,
    name,
    age,
    photo,
    bio,
    location  -- Add location field from profiles table
  INTO v_partner
  FROM profiles
  WHERE id = v_partner_user_id;

  -- Build result
  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'state', v_user_state.state,
    'match', jsonb_build_object(
      'match_id', v_match.match_id,
      'user1_id', v_match.user1_id,
      'user2_id', v_match.user2_id,
      'partner_id', COALESCE(v_user_state.partner_id, v_partner_user_id),
      'partner', CASE 
        WHEN v_partner IS NOT NULL THEN jsonb_build_object(
          'id', v_partner.id,
          'name', v_partner.name,
          'age', v_partner.age,
          'photo', v_partner.photo,
          'bio', v_partner.bio,
          'location', v_partner.location  -- Include partner's actual location
        )
        ELSE NULL
      END,
      'status', v_match.status,
      'outcome', v_match.outcome,
      'user1_vote', v_match.user1_vote,
      'user2_vote', v_match.user2_vote,
      'vote_window_started_at', v_match.vote_window_started_at,
      'vote_window_expires_at', v_match.vote_window_expires_at,
      'created_at', v_match.created_at
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_user_match_status IS 'Get user match status for polling. Returns partner location from profiles.location (actual location), not filter preferences.';



