-- ============================================================================
-- Blueprint Migration 902: Gender Ratio Stabilizer
-- ============================================================================
-- Part 9.2: Apply fairness boosts to underrepresented gender to balance queue
-- ============================================================================

-- Apply fairness boosts to underrepresented gender to balance queue
CREATE OR REPLACE FUNCTION apply_gender_ratio_balancing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB;
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_imbalance_score DECIMAL(10, 4);
  v_boost_applied INTEGER := 0;
  v_target_gender TEXT;
BEGIN
  -- Get current metrics
  v_metrics := collect_queue_metrics();
  
  v_male_count := (v_metrics->>'male_count')::INTEGER;
  v_female_count := (v_metrics->>'female_count')::INTEGER;
  v_imbalance_score := (v_metrics->>'gender_imbalance_score')::DECIMAL;
  
  -- Only apply balancing if imbalance is significant (>30% difference)
  IF v_imbalance_score < 0.3 THEN
    RETURN jsonb_build_object('balanced', TRUE, 'message', 'Queue is balanced');
  END IF;
  
  -- Determine which gender needs boost (underrepresented)
  IF v_male_count < v_female_count THEN
    v_target_gender := 'male';
  ELSIF v_female_count < v_male_count THEN
    v_target_gender := 'female';
  ELSE
    RETURN jsonb_build_object('balanced', TRUE, 'message', 'Equal counts');
  END IF;
  
  -- Apply fairness boost to underrepresented gender
  UPDATE matching_queue mq
  SET fairness_score = COALESCE(fairness_score, 0) + 10
  FROM profiles p
  WHERE mq.user_id = p.id
    AND p.gender = v_target_gender
    AND p.is_online = TRUE
    AND mq.status IN ('spin_active', 'queue_waiting')
    AND mq.fairness_score < 200  -- Don't boost users already in Tier 1
  LIMIT 20;  -- Limit to prevent over-boosting
  
  GET DIAGNOSTICS v_boost_applied = ROW_COUNT;
  
  -- Log balancing action
  PERFORM log_event('gender_ratio_balanced', 
    jsonb_build_object(
      'target_gender', v_target_gender,
      'male_count', v_male_count,
      'female_count', v_female_count,
      'imbalance_score', v_imbalance_score,
      'boosts_applied', v_boost_applied
    )
  );
  
  RETURN jsonb_build_object(
    'balanced', FALSE,
    'target_gender', v_target_gender,
    'boosts_applied', v_boost_applied,
    'imbalance_score', v_imbalance_score
  );
END;
$$;

COMMENT ON FUNCTION apply_gender_ratio_balancing IS 'Applies fairness boosts to underrepresented gender when imbalance >30%';

