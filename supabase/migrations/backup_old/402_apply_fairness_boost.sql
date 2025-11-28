-- ============================================================================
-- Blueprint Migration 402: Apply Fairness Boost
-- ============================================================================
-- Part 4.2: THE ONLY FUNCTION THAT APPLIES FAIRNESS BOOSTS
-- ============================================================================

-- THE ONLY FUNCTION THAT APPLIES FAIRNESS BOOSTS
CREATE OR REPLACE FUNCTION apply_fairness_boost(
  p_user_id UUID,
  p_boost_amount DECIMAL(10, 2),
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update fairness score
  UPDATE matching_queue
  SET fairness_score = fairness_score + p_boost_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log boost
  PERFORM log_event('fairness_boost_applied', p_user_id, 
    jsonb_build_object('boost_amount', p_boost_amount, 'reason', p_reason),
    'INFO',
    'apply_fairness_boost'
  );
END;
$$;

COMMENT ON FUNCTION apply_fairness_boost IS 'THE ONLY FUNCTION THAT APPLIES FAIRNESS BOOSTS - All boosts are +10 (not 50, 100, or 150)';

