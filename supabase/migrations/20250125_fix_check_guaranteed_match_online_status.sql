-- ============================================================================
-- Fix check_guaranteed_match to enforce online status
-- ============================================================================
-- 
-- This migration fixes check_guaranteed_match to ensure BOTH users are online
-- before allowing a match. This prevents matches with offline users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_guaranteed_match(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  user1_profile RECORD;
  user2_profile RECORD;
  user1_prefs RECORD;
  user2_prefs RECORD;
BEGIN
  -- Get profiles
  SELECT * INTO user1_profile FROM profiles WHERE id = p_user1_id;
  SELECT * INTO user2_profile FROM profiles WHERE id = p_user2_id;
  
  IF NOT FOUND OR user1_profile IS NULL OR user2_profile IS NULL THEN
    RETURN FALSE; -- One or both profiles don't exist
  END IF;
  
  -- Get preferences
  SELECT * INTO user1_prefs FROM user_preferences WHERE user_id = p_user1_id;
  SELECT * INTO user2_prefs FROM user_preferences WHERE user_id = p_user2_id;
  
  IF NOT FOUND OR user1_prefs IS NULL OR user2_prefs IS NULL THEN
    RETURN FALSE; -- One or both preferences don't exist
  END IF;
  
  -- Tier 3: Check gender compatibility, blocked users, AND ONLINE STATUS
  -- CRITICAL: Both users MUST be online
  RETURN (
    -- Gender compatibility
    (
      (user1_profile.gender = 'male' AND user2_profile.gender = 'female' AND user2_prefs.gender_preference = 'male')
      OR
      (user1_profile.gender = 'female' AND user2_profile.gender = 'male' AND user1_prefs.gender_preference = 'female')
    )
    -- Exclude blocked users
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users 
      WHERE (blocker_id = p_user1_id AND blocked_user_id = p_user2_id)
         OR (blocker_id = p_user2_id AND blocked_user_id = p_user1_id)
    )
    -- CRITICAL: Both users must be online
    AND user1_profile.is_online = TRUE
    AND user2_profile.is_online = TRUE
    -- CRITICAL: Both users must be in the queue and in a matchable status
    AND EXISTS (
      SELECT 1 FROM matching_queue 
      WHERE user_id = p_user1_id 
        AND status IN ('spin_active', 'queue_waiting')
    )
    AND EXISTS (
      SELECT 1 FROM matching_queue 
      WHERE user_id = p_user2_id 
        AND status IN ('spin_active', 'queue_waiting')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.check_guaranteed_match IS 'Tier 3 matching - checks gender compatibility, blocked users, online status, and queue status. All other constraints (age, distance) are relaxed.';

GRANT EXECUTE ON FUNCTION public.check_guaranteed_match(UUID, UUID) TO authenticated;

