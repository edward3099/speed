-- ============================================================================
-- Migration 116: Fix handle_idle_voter - Remove Permanent Blocking for Idle Timeout
-- ============================================================================
-- Issue: handle_idle_voter was incorrectly adding idle_timeout to never_pair_again
-- According to MATCHING_ENGINE_REBUILD_SUMMARY.md, never_pair_again should only
-- be applied for: mutual yes, mutual pass, preference incompatible
-- Idle timeout should NOT create permanent blocks - it's temporary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_idle_voter(p_match_id uuid, p_idle_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_match RECORD;
  v_partner_id UUID;
  v_partner_vote TEXT;
BEGIN
  -- Get match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id AND status = 'vote_active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Determine partner
  IF v_match.user1_id = p_idle_user_id THEN
    v_partner_id := v_match.user2_id;
  ELSE
    v_partner_id := v_match.user1_id;
  END IF;
  
  -- Check partner's vote
  SELECT vote INTO v_partner_vote FROM votes WHERE match_id = p_match_id AND voter_id = v_partner_id;
  
  -- End match
  UPDATE matches SET status = 'ended', updated_at = NOW() WHERE id = p_match_id;
  
  -- Idle user goes idle
  UPDATE user_status SET state = 'idle', updated_at = NOW() WHERE user_id = p_idle_user_id;
  
  IF v_partner_vote = 'yes' THEN
    -- Partner voted yes, idle user didn't vote -> partner gets boost and respins
    -- Use apply_yes_boost_with_queue to ensure they're re-added to queue
    PERFORM apply_yes_boost_with_queue(v_partner_id);
    -- DO NOT add to never_pair_again - idle timeout is temporary, not permanent
    RETURN jsonb_build_object('success', true, 'outcome', 'yes_idle', 'partner_respins', true);
  ELSE
    -- Both idle or partner passed - both go idle
    UPDATE user_status SET state = 'idle', updated_at = NOW() WHERE user_id = v_partner_id;
    -- DO NOT add to never_pair_again - idle timeout is temporary, not permanent
    RETURN jsonb_build_object('success', true, 'outcome', 'idle_timeout');
  END IF;
END;
$function$;

COMMENT ON FUNCTION handle_idle_voter IS 'Handles idle voters - does NOT create permanent never_pair_again blocks for idle_timeout (only temporary cooldown)';

-- Clean up any existing incorrect idle_timeout blocks
DELETE FROM never_pair_again WHERE reason = 'idle_timeout';


