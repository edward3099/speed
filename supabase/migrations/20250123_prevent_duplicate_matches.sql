-- Fix: Prevent users from matching with the same person multiple times
-- Excludes:
-- 1. Users who have previously matched (any status, not just pending)
-- 2. Users who have been passed on (vote_type = 'pass')

CREATE OR REPLACE FUNCTION public.find_best_match_v2(
  p_user_id UUID,
  p_tier INTEGER DEFAULT 1
) RETURNS UUID AS $$
DECLARE
  user_queue RECORD;
  user_profile RECORD;
  user_prefs RECORD;
  best_match_id UUID;
  best_priority_score DECIMAL(15, 2) := -1;
  candidate RECORD;
  tier_expansion JSONB;
  candidates_tried INTEGER := 0;
  max_candidates INTEGER := 20;
  wait_seconds INTEGER;
BEGIN
  -- Get user's queue entry with SKIP LOCKED
  SELECT * INTO user_queue
  FROM matching_queue
  WHERE user_id = p_user_id
    AND status IN ('spin_active', 'queue_waiting')
  FOR UPDATE SKIP LOCKED;
  
  IF NOT FOUND THEN
    RETURN NULL; -- User not in queue or already matched
  END IF;
  
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user preferences
  SELECT * INTO user_prefs FROM user_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Calculate wait time
  wait_seconds := EXTRACT(EPOCH FROM (NOW() - user_queue.joined_at))::INTEGER;
  
  -- Get tier expansion (if tier 2)
  IF p_tier = 2 THEN
    tier_expansion := get_tier_expansion(p_tier, user_prefs);
  END IF;
  
  -- Find best match using priority queue with SKIP LOCKED
  FOR candidate IN
    SELECT 
      mq.*,
      p.*,
      up.*,
      -- Calculate priority score
      (
        (COALESCE(mq.fairness_score, 0) * 1000) +
        (EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER * 10) +
        (COALESCE(calculate_preference_match_score(p_user_id, mq.user_id), 0) * 100) +
        (COALESCE(calculate_distance_score(user_profile, p), 0) * 10)
      ) AS priority_score
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.user_id != p_user_id
      AND mq.status IN ('spin_active', 'queue_waiting')
      -- Tier-based filtering (Tier 3 now checks wait_seconds >= 5 instead of 10)
      AND (
        (p_tier = 1 AND p.is_online = TRUE AND check_exact_preferences(p_user_id, mq.user_id))
        OR
        (p_tier = 2 AND p.is_online = TRUE AND check_expanded_preferences(p_user_id, mq.user_id, tier_expansion))
        OR
        (p_tier = 3 AND (
          -- Tier 3: Check if user OR candidate has waited 5+ seconds (reduced from 10)
          (wait_seconds >= 5 OR EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER >= 5)
          AND check_guaranteed_match(p_user_id, mq.user_id)
        ))
      )
      -- Gender compatibility (strict) - This is already enforced, but validate_match_rules will double-check
      AND (
        (user_profile.gender = 'male' AND p.gender = 'female' AND up.gender_preference = 'male')
        OR
        (user_profile.gender = 'female' AND p.gender = 'male' AND user_prefs.gender_preference = 'female')
      )
      -- Exclude blocked users
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users 
        WHERE (blocker_id = p_user_id AND blocked_user_id = mq.user_id)
           OR (blocker_id = mq.user_id AND blocked_user_id = p_user_id)
      )
      -- CRITICAL: Exclude users who have previously matched (any status)
      -- This prevents matching with the same person multiple times
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (
          (m.user1_id = p_user_id AND m.user2_id = mq.user_id)
          OR
          (m.user1_id = mq.user_id AND m.user2_id = p_user_id)
        )
        -- Exclude if there's ANY previous match (regardless of status)
        -- This ensures users don't keep matching with the same person
      )
      -- CRITICAL: Exclude users who have been passed on (vote_type = 'pass')
      -- This prevents showing users who were already rejected
      AND NOT EXISTS (
        SELECT 1 FROM votes v
        WHERE v.voter_id = p_user_id
          AND v.profile_id = mq.user_id
          AND v.vote_type = 'pass'
      )
    ORDER BY priority_score DESC
    FOR UPDATE SKIP LOCKED
    LIMIT max_candidates
  LOOP
    candidates_tried := candidates_tried + 1;
    
    IF candidate.status IN ('spin_active', 'queue_waiting') THEN
      -- CRITICAL: Validate rules before considering this candidate
      IF validate_match_rules(p_user_id, candidate.user_id, p_tier) THEN
        -- This candidate is valid - check if it's better than current best
        IF candidate.priority_score > best_priority_score THEN
          best_match_id := candidate.user_id;
          best_priority_score := candidate.priority_score;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN best_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.find_best_match_v2 IS 'Finds best match with rule validation. Updated to exclude previously matched users and users who have been passed on to prevent duplicate matches.';


