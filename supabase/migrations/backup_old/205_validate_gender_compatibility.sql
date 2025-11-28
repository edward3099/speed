-- ============================================================================
-- Blueprint Migration 205: Validate Gender Compatibility
-- ============================================================================
-- Part 2.3.1: Gender Preference Validation
-- ============================================================================

-- Validate gender compatibility before matching
CREATE OR REPLACE FUNCTION validate_gender_compatibility(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  user1_gender TEXT;
  user2_gender TEXT;
BEGIN
  SELECT gender INTO user1_gender FROM profiles WHERE id = p_user1_id;
  SELECT gender INTO user2_gender FROM profiles WHERE id = p_user2_id;
  
  -- Must be opposite genders
  IF (user1_gender = 'male' AND user2_gender = 'female') OR
     (user1_gender = 'female' AND user2_gender = 'male') THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Helper function to check if user is online
CREATE OR REPLACE FUNCTION is_user_online(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND is_online = TRUE
  );
END;
$$;

COMMENT ON FUNCTION validate_gender_compatibility IS 'Validates that two users have opposite genders before matching';
COMMENT ON FUNCTION is_user_online IS 'Checks if a user is currently online';

