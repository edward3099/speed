-- ============================================================================
-- Blueprint Migration 202: Find Guaranteed Match Strict
-- ============================================================================
-- Part 2.2: Strict Guaranteed Match (No Offline Users, Correct Match History Logic)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_guaranteed_match_strict(
  p_user_id UUID
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
  
  -- Find ANY opposite gender user who is:
  -- 1. Online (STRICT)
  -- 2. In queue (spin_active or queue_waiting)
  -- 3. Not blocked
  -- 4. NOT in yes_yes_pairs (mutual yes-yes = banned forever)
  -- 5. NOT matched in last 5 minutes (unless mutual yes-yes)
  SELECT mq.user_id INTO candidate_id
  FROM matching_queue mq
  INNER JOIN profiles p ON p.id = mq.user_id
  WHERE mq.user_id != p_user_id
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND p.is_online = TRUE  -- STRICT: Must be online
    AND (
      (user_profile.gender = 'male' AND p.gender = 'female')
      OR
      (user_profile.gender = 'female' AND p.gender = 'male')
    )
    -- STRICT: Never mutually voted yes before (banned forever)
    AND NOT EXISTS (
      SELECT 1 FROM yes_yes_pairs yyp
      WHERE (
        (yyp.user1_id = p_user_id AND yyp.user2_id = mq.user_id)
        OR
        (yyp.user1_id = mq.user_id AND yyp.user2_id = p_user_id)
      )
    )
    -- Allow previous matches only if > 5 minutes ago
    AND NOT EXISTS (
      SELECT 1 FROM match_history mh
      WHERE (
        (mh.user1_id = p_user_id AND mh.user2_id = mq.user_id)
        OR
        (mh.user1_id = mq.user_id AND mh.user2_id = p_user_id)
      )
      AND mh.created_at > NOW() - INTERVAL '5 minutes'
    )
    -- Not blocked
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
         OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
    )
    -- Not already matched to someone else
    AND NOT is_user_already_matched(mq.user_id)
  ORDER BY mq.fairness_score DESC, mq.joined_at ASC
  LIMIT 1;
  
  RETURN candidate_id;
END;
$$;

COMMENT ON FUNCTION find_guaranteed_match_strict IS 'Finds guaranteed match with strict validation (online only, correct match history logic)';

