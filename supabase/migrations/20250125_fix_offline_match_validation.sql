-- ============================================================================
-- Fix offline match validation - CRITICAL BUG FIX
-- ============================================================================
-- 
-- This migration fixes TWO critical bugs:
-- 1. validate_match_rules was allowing Tier 3 to match offline users
-- 2. guardian_enforce_online_status had incorrect spark_log_event call
-- ============================================================================

-- ============================================================================
-- FIX 1: validate_match_rules - Enforce online status for ALL tiers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_match_rules(
  p_user1_id UUID,
  p_user2_id UUID,
  p_tier INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  user1_profile RECORD;
  user2_profile RECORD;
  user1_prefs RECORD;
  user2_prefs RECORD;
  distance_km DECIMAL;
BEGIN
  -- Get both profiles
  SELECT * INTO user1_profile FROM profiles WHERE id = p_user1_id;
  SELECT * INTO user2_profile FROM profiles WHERE id = p_user2_id;
  
  IF user1_profile IS NULL OR user2_profile IS NULL THEN
    RETURN FALSE; -- One or both profiles don't exist
  END IF;
  
  -- Get both preferences
  SELECT * INTO user1_prefs FROM user_preferences WHERE user_id = p_user1_id;
  SELECT * INTO user2_prefs FROM user_preferences WHERE user_id = p_user2_id;
  
  IF user1_prefs IS NULL OR user2_prefs IS NULL THEN
    RETURN FALSE; -- One or both preferences don't exist
  END IF;
  
  -- RULE 1: Gender Compatibility (STRICT - Males only with Females)
  -- This is ALWAYS enforced, regardless of tier
  IF NOT (
    (user1_profile.gender = 'male' AND user2_profile.gender = 'female' AND user2_prefs.gender_preference = 'male')
    OR
    (user1_profile.gender = 'female' AND user2_profile.gender = 'male' AND user1_prefs.gender_preference = 'female')
  ) THEN
    RETURN FALSE; -- Gender mismatch - REJECT
  END IF;
  
  -- RULE 2: Blocked Users (Both Directions) - ALWAYS enforced
  IF EXISTS (
    SELECT 1 FROM blocked_users 
    WHERE (blocker_id = p_user1_id AND blocked_user_id = p_user2_id)
       OR (blocker_id = p_user2_id AND blocked_user_id = p_user1_id)
  ) THEN
    RETURN FALSE; -- One user blocked the other - REJECT
  END IF;
  
  -- CRITICAL FIX: Online Status - ALWAYS enforced for ALL tiers
  -- Users can ONLY match with online users, regardless of tier
  IF NOT user1_profile.is_online OR NOT user2_profile.is_online THEN
    RETURN FALSE; -- Both must be online - REJECT
  END IF;
  
  -- RULE 6: Queue Status (Both must be matchable) - ALWAYS enforced
  IF NOT EXISTS (
    SELECT 1 FROM matching_queue 
    WHERE user_id = p_user1_id 
      AND status IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN FALSE; -- User1 not in valid queue state
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM matching_queue 
    WHERE user_id = p_user2_id 
      AND status IN ('spin_active', 'queue_waiting')
  ) THEN
    RETURN FALSE; -- User2 not in valid queue state
  END IF;
  
  -- For Tier 3, we relax age and distance constraints
  -- But still enforce gender, blocked status, online status, and queue status (already done above)
  IF p_tier = 3 THEN
    -- Tier 3: Only check gender, blocked status, online status, and queue status (all done above)
    -- Age and distance are relaxed
    RETURN TRUE;
  END IF;
  
  -- RULE 3: Age Preferences (Bidirectional) - Tier 1 & 2 only
  IF user1_profile.age < user2_prefs.min_age OR user1_profile.age > user2_prefs.max_age THEN
    RETURN FALSE; -- User1's age not in User2's preference range
  END IF;
  
  IF user2_profile.age < user1_prefs.min_age OR user2_profile.age > user1_prefs.max_age THEN
    RETURN FALSE; -- User2's age not in User1's preference range
  END IF;
  
  -- RULE 4: Distance Preferences (Bidirectional) - Tier 1 & 2 only
  -- Calculate distance using Haversine formula
  IF user1_profile.latitude IS NOT NULL AND user1_profile.longitude IS NOT NULL
     AND user2_profile.latitude IS NOT NULL AND user2_profile.longitude IS NOT NULL THEN
    
    -- Use existing calculate_distance function if it exists, otherwise inline calculation
    BEGIN
      SELECT calculate_distance(
        user1_profile.latitude, user1_profile.longitude,
        user2_profile.latitude, user2_profile.longitude
      ) INTO distance_km;
    EXCEPTION
      WHEN OTHERS THEN
        -- Fallback: Inline Haversine calculation
        DECLARE
          earth_radius DECIMAL := 6371;
          dlat DECIMAL;
          dlon DECIMAL;
          a DECIMAL;
          c DECIMAL;
        BEGIN
          dlat := radians(user2_profile.latitude - user1_profile.latitude);
          dlon := radians(user2_profile.longitude - user1_profile.longitude);
          
          a := sin(dlat/2) * sin(dlat/2) + 
               cos(radians(user1_profile.latitude)) * cos(radians(user2_profile.latitude)) * 
               sin(dlon/2) * sin(dlon/2);
          
          c := 2 * atan2(sqrt(a), sqrt(1-a));
          distance_km := earth_radius * c;
        END;
    END;
    
    IF distance_km > user1_prefs.max_distance THEN
      RETURN FALSE; -- Too far for User1
    END IF;
    
    IF distance_km > user2_prefs.max_distance THEN
      RETURN FALSE; -- Too far for User2
    END IF;
  END IF;
  
  -- All rules passed
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.validate_match_rules IS 'CRITICAL: Validates all matching rules before creating a match. Enforces gender, blocked users, online status (ALL tiers), age/distance (Tier 1/2 only), and queue status. Returns TRUE if all rules pass, FALSE otherwise.';

-- ============================================================================
-- FIX 2: guardian_enforce_online_status - Fix spark_log_event call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_online_status()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  invalid_matches INTEGER := 0;
  broken_matches INTEGER := 0;
  match_record RECORD;
  user1_online BOOLEAN;
  user2_online BOOLEAN;
BEGIN
  -- Find pending matches where one or both users are offline
  FOR match_record IN
    SELECT 
      m.id as match_id,
      m.user1_id,
      m.user2_id,
      m.status,
      p1.is_online as user1_online,
      p2.is_online as user2_online
    FROM matches m
    INNER JOIN profiles p1 ON p1.id = m.user1_id
    INNER JOIN profiles p2 ON p2.id = m.user2_id
    WHERE m.status = 'pending'
      AND (p1.is_online = FALSE OR p2.is_online = FALSE)
    ORDER BY m.matched_at DESC
    LIMIT 100
  LOOP
    invalid_matches := invalid_matches + 1;
    
    -- Break the invalid match by deleting it
    DELETE FROM matches WHERE id = match_record.match_id;
    
    -- Reset both users back to spin_active if they're in vote_active
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id IN (match_record.user1_id, match_record.user2_id)
      AND status = 'vote_active';
    
    broken_matches := broken_matches + 1;
    
    -- Log the action with correct function signature
    PERFORM spark_log_event(
      p_event_type := 'guardian_action',
      p_event_category := 'broken_offline_match',
      p_event_message := 'Guardian broke match with offline user(s)',
      p_event_data := jsonb_build_object(
        'match_id', match_record.match_id,
        'user1_id', match_record.user1_id,
        'user2_id', match_record.user2_id,
        'user1_online', match_record.user1_online,
        'user2_online', match_record.user2_online,
        'guardian', 'enforce_online_status'
      ),
      p_user_id := match_record.user1_id,
      p_related_user_id := match_record.user2_id,
      p_related_table := 'matches',
      p_source := 'GUARDIAN',
      p_severity := 'WARNING'
    );
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_online_status',
    'invalid_matches_found', invalid_matches,
    'broken_matches', broken_matches,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_online_status IS 'GUARDIAN: Enforces online status. Breaks matches where one or both users are offline.';

GRANT EXECUTE ON FUNCTION public.validate_match_rules(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_online_status() TO authenticated;

