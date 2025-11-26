-- ============================================================================
-- Blueprint Migration 602: Handle Idle Voter
-- ============================================================================
-- Part 5.5.2: Handle idle voters (force revote or auto-drop)
-- ============================================================================

-- Handle idle voters (force revote or auto-drop)
CREATE OR REPLACE FUNCTION handle_idle_voter(
  p_match_id UUID,
  p_idle_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_user_id UUID;
  active_user_vote TEXT;
BEGIN
  -- Get the active (non-idle) user
  SELECT 
    CASE WHEN user1_id = p_idle_user_id THEN user2_id ELSE user1_id END,
    vote_type
  INTO active_user_id, active_user_vote
  FROM matches m
  LEFT JOIN votes v ON v.match_id = m.id AND v.user_id != p_idle_user_id
  WHERE m.id = p_match_id;
  
  IF active_user_vote = 'yes' THEN
    -- Active user voted yes → give them boost +10 and respin
    PERFORM apply_fairness_boost(active_user_id, 10, 'partner_idle_during_vote');
    PERFORM state_machine_transition(active_user_id, 'partner_idle', jsonb_build_object('action', 'respin'));
  END IF;
  
  -- Break match and remove idle user
  -- Clean up metadata (revealed_users) before deleting match
  UPDATE matches SET metadata = metadata - 'revealed_users' WHERE id = p_match_id;
  DELETE FROM matches WHERE id = p_match_id;
  DELETE FROM votes WHERE match_id = p_match_id;
  PERFORM queue_remove(p_idle_user_id, 'idle_during_vote');
END;
$$;

COMMENT ON FUNCTION handle_idle_voter IS 'Handles idle voters during voting phase - gives active user boost +10 and respin';

