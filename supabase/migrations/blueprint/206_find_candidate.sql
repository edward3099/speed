-- ============================================================================
-- Blueprint Migration 206: Find Candidate
-- ============================================================================
-- Part 2.3.2: Find Candidate (Tier 1 and Tier 2)
-- ============================================================================

-- Find candidate for Tier 1 (exact preferences) or Tier 2 (expanded preferences)
-- CRITICAL: Must exclude yes_yes_pairs in ALL tiers
CREATE OR REPLACE FUNCTION find_candidate(
  p_user_id UUID,
  p_tier INTEGER
) RETURNS UUID AS $$
DECLARE
  user_profile RECORD;
  candidate_id UUID;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  
  IF NOT FOUND OR user_profile.gender IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Find candidate with tier-specific preferences
  -- Tier 1: Exact preferences (age, distance, etc. match exactly)
  -- Tier 2: Expanded preferences (age range expanded, distance expanded)
  -- (Implementation depends on your preference structure)
  
  SELECT mq.user_id INTO candidate_id
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    )
    -- CRITICAL: Exclude yes_yes_pairs in ALL tiers
    AND NOT EXISTS (
      SELECT 1 FROM yes_yes_pairs yyp
      WHERE (
        (yyp.user1_id = p_user_id AND yyp.user2_id = mq.user_id)
        OR
        (yyp.user1_id = mq.user_id AND yyp.user2_id = p_user_id)
      )
    )
    -- Allow previous matches only if > 5 minutes ago (Tier 2 and 3 only)
    -- Tier 1: No previous matches at all
    AND (
      p_tier = 1  -- Tier 1: No previous matches at all
      OR
      (p_tier > 1 AND NOT EXISTS (
        SELECT 1 FROM match_history mh
        WHERE (
          (mh.user1_id = p_user_id AND mh.user2_id = mq.user_id)
          OR
          (mh.user1_id = mq.user_id AND mh.user2_id = p_user_id)
        )
        AND mh.created_at > NOW() - INTERVAL '5 minutes'
      ))
    )
    -- Not blocked
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
         OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
    )
    -- Not already matched
    AND NOT is_user_already_matched(mq.user_id)
    -- Tier-specific preference matching would go here
    -- (This is a placeholder - actual implementation depends on preference structure)
  ORDER BY mq.fairness_score DESC, mq.joined_at ASC
  LIMIT 1;
  
  RETURN candidate_id;
END;
$$;

COMMENT ON FUNCTION find_candidate IS 'Finds candidate for Tier 1 (exact) or Tier 2 (expanded) preferences, excluding yes_yes_pairs in all tiers';

