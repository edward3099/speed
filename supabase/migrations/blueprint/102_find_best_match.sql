-- ============================================================================
-- Migration 102: Find Best Match
-- ============================================================================
-- Part 5.3: Priority scoring and candidate selection
-- ============================================================================

-- Find best match for a user based on priority scoring
CREATE OR REPLACE FUNCTION find_best_match(
  p_user_id UUID,
  p_preference_stage INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  candidate_id UUID;
  user_gender TEXT;
  user_prefs RECORD;
  best_candidate UUID;
  best_score DECIMAL(10, 2) := -1;
  candidate_score DECIMAL(10, 2);
  candidate_record RECORD;
BEGIN
  -- Get user gender (from profiles table)
  SELECT gender INTO user_gender FROM profiles WHERE id = p_user_id;
  
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find candidates based on preference stage
  FOR candidate_record IN
    SELECT 
      q.user_id,
      q.fairness_score,
      EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_time_seconds,
      u.gender,
      up.min_age,
      up.max_age,
      up.max_distance,
      -- Calculate compatibility score based on preference stage
      CASE
        WHEN p_preference_stage = 0 THEN
          -- Stage 0: exact preferences only
          -- Check age compatibility (partner's age vs user's preferences)
          CASE 
            WHEN (up.min_age <= get_user_age(q.user_id) AND 
                  up.max_age >= get_user_age(q.user_id)) THEN 50
            ELSE 0
          END +
          -- Check distance compatibility (simplified - implement based on your location system)
          CASE
            WHEN up.max_distance >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 50
            ELSE 0
          END
        WHEN p_preference_stage = 1 THEN
          -- Stage 1: age expanded ±2 years
          CASE 
            WHEN (up.min_age - 2 <= get_user_age(q.user_id) AND 
                  up.max_age + 2 >= get_user_age(q.user_id)) THEN 20
            ELSE 0
          END +
          CASE
            WHEN up.max_distance >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 50
            ELSE 0
          END
        WHEN p_preference_stage = 2 THEN
          -- Stage 2: age ±4 years, distance × 1.5
          CASE 
            WHEN (up.min_age - 4 <= get_user_age(q.user_id) AND 
                  up.max_age + 4 >= get_user_age(q.user_id)) THEN 20
            ELSE 0
          END +
          CASE
            WHEN (up.max_distance * 1.5) >= COALESCE(get_user_distance(p_user_id, q.user_id), 999) THEN 20
            ELSE 0
          END
        ELSE
          -- Stage 3: full expansion (age and distance relaxed, but gender still strict)
          0
      END as compatibility_score
    FROM queue q
    INNER JOIN profiles u ON u.id = q.user_id
    INNER JOIN user_status us ON us.user_id = q.user_id
    INNER JOIN user_preferences up ON up.user_id = q.user_id
    WHERE q.user_id != p_user_id
      AND u.online = TRUE
      AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
      AND us.state IN ('spin_active', 'queue_waiting')
      AND u.gender != user_gender -- Opposite gender only
      AND up.gender_preference = user_gender -- Candidate must want user's gender
      AND user_prefs.gender_preference = u.gender -- User must want candidate's gender
      AND NOT EXISTS (
        SELECT 1 FROM never_pair_again npa
        WHERE (npa.user1 = p_user_id AND npa.user2 = q.user_id)
           OR (npa.user1 = q.user_id AND npa.user2 = p_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = q.user_id OR m.user2_id = q.user_id)
          AND m.status IN ('pending', 'vote_active')
      )
  LOOP
    -- Calculate priority score
    -- Formula: fairness_weight * fairness_score + wait_weight * wait_time + compatibility_weight * compatibility_score + random_jitter
    candidate_score := 
      (1000.0 * candidate_record.fairness_score) +
      (10.0 * candidate_record.wait_time_seconds) +
      (1.0 * candidate_record.compatibility_score) +
      (RANDOM() * 5.0); -- Random jitter 0-5
    
    -- Track best candidate
    IF candidate_score > best_score THEN
      best_score := candidate_score;
      best_candidate := candidate_record.user_id;
    END IF;
  END LOOP;
  
  RETURN best_candidate;
END;
$$;

COMMENT ON FUNCTION find_best_match IS 'Finds best match based on priority scoring: fairness (1000x) + wait_time (10x) + compatibility (1x) + random jitter';
