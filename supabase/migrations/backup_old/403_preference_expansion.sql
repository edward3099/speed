-- ============================================================================
-- Blueprint Migration 403: Preference Expansion Management
-- ============================================================================
-- Part 4.3: Apply and Reset Preference Expansion
-- ============================================================================

-- Apply preference expansion when user has been waiting
-- Expansion starts after 30 seconds of waiting
-- Expansion increments: Age range +5 years, Distance +50 miles
CREATE OR REPLACE FUNCTION apply_preference_expansion(
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  wait_time_seconds INTEGER;
  current_prefs RECORD;
BEGIN
  -- Get wait time
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER,
    up.*
  INTO wait_time_seconds, current_prefs
  FROM matching_queue mq
  LEFT JOIN user_preferences up ON up.user_id = mq.user_id
  WHERE mq.user_id = p_user_id;
  
  -- Only expand if waiting > 30 seconds
  -- Support repeated expansions: if already expanded, expand further
  IF wait_time_seconds >= 30 THEN
    -- Store original preferences only on first expansion
    IF current_prefs.expanded = FALSE OR current_prefs.expanded IS NULL THEN
      -- First expansion: store originals
      UPDATE user_preferences
      SET 
        original_min_age = min_age,
        original_max_age = max_age,
        original_max_distance = max_distance,
        min_age = GREATEST(18, min_age - 5),  -- Expand age range down by 5 years
        max_age = LEAST(100, max_age + 5),    -- Expand age range up by 5 years
        max_distance = max_distance + 50,     -- Expand distance by 50 miles
        expanded = TRUE,
        expanded_until = NOW() + INTERVAL '5 minutes'  -- Expires after 5 minutes
      WHERE user_id = p_user_id;
      
      -- Log expansion
      PERFORM log_event('preference_expanded', p_user_id, 
        jsonb_build_object('wait_time', wait_time_seconds, 'expires_at', NOW() + INTERVAL '5 minutes', 'expansion_level', 1));
    ELSIF wait_time_seconds >= 60 THEN
      -- Second expansion (after 60 seconds): expand further from current (not original)
      UPDATE user_preferences
      SET 
        min_age = GREATEST(18, min_age - 5),  -- Expand age range down by 5 more years
        max_age = LEAST(100, max_age + 5),    -- Expand age range up by 5 more years
        max_distance = max_distance + 50,     -- Expand distance by 50 more miles
        expanded_until = NOW() + INTERVAL '5 minutes'  -- Reset expiration
      WHERE user_id = p_user_id
        AND expanded = TRUE;
      
      -- Log second expansion
      PERFORM log_event('preference_expanded', p_user_id, 
        jsonb_build_object('wait_time', wait_time_seconds, 'expires_at', NOW() + INTERVAL '5 minutes', 'expansion_level', 2));
    END IF;
  END IF;
END;
$$;

-- Reset expanded preferences after match attempt or timeout
CREATE OR REPLACE FUNCTION reset_preference_expansion(
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  original_prefs RECORD;
BEGIN
  -- Get original preferences (stored when expansion was applied)
  SELECT 
    original_min_age,
    original_max_age,
    original_max_distance
  INTO original_prefs
  FROM user_preferences
  WHERE user_id = p_user_id
    AND expanded = TRUE;
  
  -- If expanded preferences exist and expired, reset to original
  IF FOUND AND original_prefs IS NOT NULL THEN
    UPDATE user_preferences
    SET 
      min_age = original_prefs.original_min_age,
      max_age = original_prefs.original_max_age,
      max_distance = original_prefs.original_max_distance,
      expanded = FALSE,
      expanded_until = NULL,
      original_min_age = NULL,
      original_max_age = NULL,
      original_max_distance = NULL
    WHERE user_id = p_user_id
      AND (expanded_until < NOW() OR expanded_until IS NULL);
  END IF;
END;
$$;

COMMENT ON FUNCTION apply_preference_expansion IS 'Applies preference expansion after 30s (first) and 60s (second) of waiting';
COMMENT ON FUNCTION reset_preference_expansion IS 'Resets expanded preferences to original values after match or timeout';

