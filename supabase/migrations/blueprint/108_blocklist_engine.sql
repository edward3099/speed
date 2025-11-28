-- ============================================================================
-- Migration 108: Blocklist Engine
-- ============================================================================
-- Part 5.7: Never pair again management
-- ============================================================================

-- Add pair to never_pair_again blocklist
CREATE OR REPLACE FUNCTION add_to_blocklist(
  p_user1 UUID,
  p_user2 UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert symmetric (lowest UUID first)
  INSERT INTO never_pair_again (user1, user2, reason)
  VALUES (
    LEAST(p_user1, p_user2),
    GREATEST(p_user1, p_user2),
    p_reason
  )
  ON CONFLICT DO NOTHING;
  
  -- Log blocklist addition
  INSERT INTO debug_logs (user_id, event_type, metadata, severity)
  VALUES (
    p_user1,
    'blocklist_added',
    jsonb_build_object('blocked_user', p_user2, 'reason', p_reason),
    'info'
  );
END;
$$;

-- Check if pair is blocked
CREATE OR REPLACE FUNCTION is_blocked(p_user1 UUID, p_user2 UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM never_pair_again
    WHERE (user1 = LEAST(p_user1, p_user2) AND user2 = GREATEST(p_user1, p_user2))
  );
END;
$$;

COMMENT ON FUNCTION add_to_blocklist IS 'Adds pair to never_pair_again blocklist (symmetric storage)';
COMMENT ON FUNCTION is_blocked IS 'Checks if pair is in never_pair_again blocklist';
