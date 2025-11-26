-- ============================================================================
-- Blueprint Migration 203: Is User Already Matched
-- ============================================================================
-- Part 2.3: Duplicate Match Prevention
-- ============================================================================

-- Check if user is already in a match
CREATE OR REPLACE FUNCTION is_user_already_matched(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM matches
    WHERE (user1_id = p_user_id OR user2_id = p_user_id)
      AND status = 'pending'
  );
END;
$$;

COMMENT ON FUNCTION is_user_already_matched IS 'Checks if user is already matched to prevent duplicate matches';

