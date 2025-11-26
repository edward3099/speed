-- ============================================================================
-- Blueprint Migration 702: Handle Reveal Timeout
-- ============================================================================
-- Part 5.6: Reveal timeout handler (if user doesn't reveal within timeout)
-- ============================================================================

-- Reveal timeout handler (if user doesn't reveal within timeout)
CREATE OR REPLACE FUNCTION handle_reveal_timeout(
  p_match_id UUID,
  p_idle_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  partner_id UUID;
BEGIN
  -- Get partner
  SELECT 
    CASE WHEN user1_id = p_idle_user_id THEN user2_id ELSE user1_id END
  INTO partner_id
  FROM matches
  WHERE id = p_match_id;
  
  -- Break match
  -- Clean up metadata (revealed_users) before deleting match
  UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
  DELETE FROM matches WHERE id = p_match_id;
  
  -- Reset both users to spin_active
  PERFORM state_machine_transition(p_idle_user_id, 'reveal_timeout', 
    jsonb_build_object('action', 'respin'));
  PERFORM state_machine_transition(partner_id, 'partner_reveal_timeout', 
    jsonb_build_object('action', 'respin'));
  
  -- Give partner fairness boost
  PERFORM apply_fairness_boost(partner_id, 10, 'partner_reveal_timeout');
  
  -- Remove from queue
  PERFORM queue_remove(p_idle_user_id, 'reveal_timeout');
END;
$$;

COMMENT ON FUNCTION handle_reveal_timeout IS 'Handles reveal timeout - breaks match and gives partner boost +10';

