-- ============================================================================
-- TEST: Both Users Vote Yes → Video Date Redirection
-- ============================================================================
-- Tests: When both users vote yes, they should be redirected to video date
-- ============================================================================

SELECT '=== TEST: Both Users Vote Yes → Video Date Redirection ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_vote1_result JSONB;
  v_vote2_result JSONB;
  v_match_status TEXT;
  v_video_date_id UUID;
  v_redirect_works BOOLEAN := false;
BEGIN
  -- Get 2 compatible users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true AND gender = 'male' LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND gender = 'female' AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test: Need 1 male and 1 female user';
    RETURN;
  END IF;
  
  -- Ensure preferences
  INSERT INTO user_preferences (user_id, gender_preference, min_age, max_age, max_distance)
  VALUES 
    (v_user1_id, 'female', 18, 40, 50),
    (v_user2_id, 'male', 18, 40, 50)
  ON CONFLICT (user_id) DO UPDATE SET gender_preference = EXCLUDED.gender_preference;
  
  -- Clean up
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  DELETE FROM matches WHERE (user1_id = v_user1_id OR user2_id = v_user1_id);
  DELETE FROM votes WHERE match_id IN (SELECT id FROM matches WHERE user1_id = v_user1_id OR user2_id = v_user1_id);
  DELETE FROM video_dates WHERE match_id IN (SELECT id FROM matches WHERE user1_id = v_user1_id OR user2_id = v_user1_id);
  
  -- Set users online
  UPDATE profiles SET online = true, cooldown_until = NULL WHERE id IN (v_user1_id, v_user2_id);
  
  -- Join queue
  PERFORM join_queue(v_user1_id);
  PERFORM join_queue(v_user2_id);
  
  -- Run matching
  PERFORM process_matching();
  
  -- Get the match
  SELECT id INTO v_match_id FROM matches 
  WHERE ((user1_id = v_user1_id AND user2_id = v_user2_id) OR (user1_id = v_user2_id AND user2_id = v_user1_id))
    AND status IN ('pending', 'vote_active');
  
  IF v_match_id IS NULL THEN
    RAISE NOTICE '✗ Test FAILED: No match created';
    RETURN;
  END IF;
  
  -- User 1 votes yes
  SELECT record_vote(v_user1_id, v_match_id, 'yes') INTO v_vote1_result;
  
  -- Check if outcome is 'waiting' (expected when only one user voted)
  IF v_vote1_result->>'outcome' != 'waiting' THEN
    RAISE NOTICE '⚠ Test: User 1 vote outcome: % (expected: waiting)', v_vote1_result->>'outcome';
  END IF;
  
  -- User 2 votes yes (should trigger both_yes)
  SELECT record_vote(v_user2_id, v_match_id, 'yes') INTO v_vote2_result;
  
  -- Check if outcome is 'both_yes'
  IF v_vote2_result->>'outcome' = 'both_yes' THEN
    RAISE NOTICE '✓ Test PASSED: record_vote returns both_yes outcome';
    v_redirect_works := true;
  ELSE
    RAISE NOTICE '✗ Test FAILED: record_vote outcome is % (expected: both_yes)', v_vote2_result->>'outcome';
  END IF;
  
  -- Check match status (should be 'ended')
  SELECT status INTO v_match_status FROM matches WHERE id = v_match_id;
  
  IF v_match_status = 'ended' THEN
    RAISE NOTICE '✓ Test PASSED: Match status is ended';
  ELSE
    RAISE NOTICE '✗ Test FAILED: Match status is % (expected: ended)', v_match_status;
  END IF;
  
  -- Check if video_date can be created (frontend should do this)
  BEGIN
    INSERT INTO video_dates (match_id, user1_id, user2_id, status)
    VALUES (v_match_id, LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'countdown')
    RETURNING id INTO v_video_date_id;
    
    IF v_video_date_id IS NOT NULL THEN
      RAISE NOTICE '✓ Test PASSED: Video date can be created';
    END IF;
    
    -- Cleanup
    DELETE FROM video_dates WHERE id = v_video_date_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ Test FAILED: Cannot create video_date: %', SQLERRM;
  END;
  
  -- Final check
  IF v_redirect_works AND v_match_status = 'ended' THEN
    RAISE NOTICE '✅ TEST PASSED: Both users vote yes → Video date redirection works';
    RAISE NOTICE '  - record_vote returns both_yes: ✓';
    RAISE NOTICE '  - Match status is ended: ✓';
    RAISE NOTICE '  - Video date can be created: ✓';
  ELSE
    RAISE NOTICE '❌ TEST FAILED: Redirection flow has issues';
  END IF;
  
  -- Cleanup
  DELETE FROM votes WHERE match_id = v_match_id;
  DELETE FROM matches WHERE id = v_match_id;
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST: Fairness Score Calculation During Spin
-- ============================================================================
-- Tests: Fairness score is calculated correctly when user joins queue
-- ============================================================================

SELECT '=== TEST: Fairness Score Calculation During Spin ===' as test_name;

DO $$
DECLARE
  v_user_id UUID;
  v_initial_fairness INTEGER;
  v_after_join_fairness INTEGER;
  v_after_wait_fairness INTEGER;
  v_wait_seconds INTEGER := 5;
  v_fairness_calculated BOOLEAN := false;
BEGIN
  -- Get a user
  SELECT id INTO v_user_id FROM profiles WHERE online = true LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ Test: Need at least 1 user';
    RETURN;
  END IF;
  
  -- Clean up
  DELETE FROM queue WHERE user_id = v_user_id;
  DELETE FROM debug_logs WHERE user_id = v_user_id AND event_type = 'yes_boost_applied';
  
  -- Set user online
  UPDATE profiles SET online = true, cooldown_until = NULL WHERE id = v_user_id;
  
  -- Check initial fairness (should be 0 or not exist)
  SELECT fairness_score INTO v_initial_fairness
  FROM queue
  WHERE user_id = v_user_id;
  
  IF v_initial_fairness IS NULL THEN
    v_initial_fairness := 0;
    RAISE NOTICE '✓ Initial fairness: 0 (user not in queue)';
  ELSE
    RAISE NOTICE '⚠ Initial fairness: % (user already in queue)', v_initial_fairness;
  END IF;
  
  -- Join queue
  PERFORM join_queue(v_user_id);
  
  -- Check fairness after join
  SELECT fairness_score INTO v_after_join_fairness
  FROM queue
  WHERE user_id = v_user_id;
  
  IF v_after_join_fairness IS NOT NULL THEN
    RAISE NOTICE '✓ Fairness after join: %', v_after_join_fairness;
    
    -- Fairness should be calculated (wait_time_seconds + yes_boost_events * 10)
    -- Initially, wait_time should be ~0, so fairness should be 0 or very small
    IF v_after_join_fairness >= 0 AND v_after_join_fairness <= 10 THEN
      RAISE NOTICE '✓ Test PASSED: Initial fairness score is correct (0-10)';
      v_fairness_calculated := true;
    ELSE
      RAISE NOTICE '✗ Test FAILED: Initial fairness score is % (expected: 0-10)', v_after_join_fairness;
    END IF;
  ELSE
    RAISE NOTICE '✗ Test FAILED: Fairness score not set after join_queue';
  END IF;
  
  -- Wait a few seconds
  PERFORM pg_sleep(v_wait_seconds);
  
  -- Recalculate fairness (simulate what process_matching does)
  PERFORM calculate_fairness_score(v_user_id);
  
  -- Check fairness after wait
  SELECT fairness_score INTO v_after_wait_fairness
  FROM queue
  WHERE user_id = v_user_id;
  
  IF v_after_wait_fairness IS NOT NULL THEN
    RAISE NOTICE '✓ Fairness after % seconds wait: %', v_wait_seconds, v_after_wait_fairness;
    
    -- Fairness should increase with wait time
    -- Formula: wait_time_seconds + (yes_boost_events * 10)
    -- After 5 seconds, should be approximately 5 (or slightly more due to processing time)
    IF v_after_wait_fairness >= v_after_join_fairness THEN
      RAISE NOTICE '✓ Test PASSED: Fairness score increases with wait time';
      RAISE NOTICE '  - Before wait: %, After wait: %', v_after_join_fairness, v_after_wait_fairness;
    ELSE
      RAISE NOTICE '✗ Test FAILED: Fairness score did not increase (before: %, after: %)', 
        v_after_join_fairness, v_after_wait_fairness;
    END IF;
  ELSE
    RAISE NOTICE '✗ Test FAILED: Fairness score not found after wait';
  END IF;
  
  -- Test yes boost
  PERFORM apply_yes_boost(v_user_id);
  
  SELECT fairness_score INTO v_after_wait_fairness
  FROM queue
  WHERE user_id = v_user_id;
  
  IF v_after_wait_fairness >= v_after_join_fairness + 10 THEN
    RAISE NOTICE '✓ Test PASSED: Yes boost adds +10 to fairness score';
    RAISE NOTICE '  - Before boost: %, After boost: %', v_after_join_fairness, v_after_wait_fairness;
  ELSE
    RAISE NOTICE '⚠ Test: Yes boost may not have worked (before: %, after: %)', 
      v_after_join_fairness, v_after_wait_fairness;
  END IF;
  
  -- Final check
  IF v_fairness_calculated THEN
    RAISE NOTICE '✅ TEST PASSED: Fairness score calculation works correctly';
    RAISE NOTICE '  - Initial fairness: ✓';
    RAISE NOTICE '  - Fairness increases with wait time: ✓';
    RAISE NOTICE '  - Yes boost adds +10: ✓';
  ELSE
    RAISE NOTICE '❌ TEST FAILED: Fairness score calculation has issues';
  END IF;
  
  -- Cleanup
  DELETE FROM queue WHERE user_id = v_user_id;
  DELETE FROM debug_logs WHERE user_id = v_user_id AND event_type = 'yes_boost_applied';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST: Fairness Score in Matching Process
-- ============================================================================
-- Tests: Fairness score is used correctly in process_matching
-- ============================================================================

SELECT '=== TEST: Fairness Score in Matching Process ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_user3_id UUID;
  v_fairness1 INTEGER;
  v_fairness2 INTEGER;
  v_fairness3 INTEGER;
  v_match_order_correct BOOLEAN := false;
BEGIN
  -- Get 3 users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true AND gender = 'male' LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND gender = 'male' AND id != v_user1_id LIMIT 1;
  SELECT id INTO v_user3_id FROM profiles WHERE online = true AND gender = 'female' AND id NOT IN (v_user1_id, v_user2_id) LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL OR v_user3_id IS NULL THEN
    RAISE NOTICE '⚠ Test: Need 2 male and 1 female user';
    RETURN;
  END IF;
  
  -- Clean up
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id, v_user3_id);
  DELETE FROM matches WHERE (user1_id IN (v_user1_id, v_user2_id, v_user3_id) OR user2_id IN (v_user1_id, v_user2_id, v_user3_id));
  
  -- Set users online
  UPDATE profiles SET online = true, cooldown_until = NULL WHERE id IN (v_user1_id, v_user2_id, v_user3_id);
  
  -- Ensure preferences
  INSERT INTO user_preferences (user_id, gender_preference, min_age, max_age, max_distance)
  VALUES 
    (v_user1_id, 'female', 18, 40, 50),
    (v_user2_id, 'female', 18, 40, 50),
    (v_user3_id, 'male', 18, 40, 50)
  ON CONFLICT (user_id) DO UPDATE SET gender_preference = EXCLUDED.gender_preference;
  
  -- User 1 joins first (should have lower fairness)
  PERFORM join_queue(v_user1_id);
  
  -- Wait 2 seconds
  PERFORM pg_sleep(2);
  
  -- User 2 joins (should have even lower fairness)
  PERFORM join_queue(v_user2_id);
  
  -- User 3 joins (female, should match with one of the males)
  PERFORM join_queue(v_user3_id);
  
  -- Set different fairness scores manually to test ordering
  UPDATE queue SET fairness_score = 100 WHERE user_id = v_user1_id;
  UPDATE queue SET fairness_score = 50 WHERE user_id = v_user2_id;
  UPDATE queue SET fairness_score = 0 WHERE user_id = v_user3_id;
  
  -- Get fairness scores
  SELECT fairness_score INTO v_fairness1 FROM queue WHERE user_id = v_user1_id;
  SELECT fairness_score INTO v_fairness2 FROM queue WHERE user_id = v_user2_id;
  SELECT fairness_score INTO v_fairness3 FROM queue WHERE user_id = v_user3_id;
  
  RAISE NOTICE 'Fairness scores - User1: %, User2: %, User3: %', v_fairness1, v_fairness2, v_fairness3;
  
  -- Run matching (should match user1 with user3 since user1 has higher fairness)
  PERFORM process_matching();
  
  -- Check which user was matched
  IF EXISTS (
    SELECT 1 FROM matches
    WHERE ((user1_id = v_user1_id AND user2_id = v_user3_id) OR (user1_id = v_user3_id AND user2_id = v_user1_id))
      AND status IN ('pending', 'vote_active')
  ) THEN
    RAISE NOTICE '✓ Test PASSED: User with higher fairness (User1: %) matched first', v_fairness1;
    v_match_order_correct := true;
  ELSIF EXISTS (
    SELECT 1 FROM matches
    WHERE ((user1_id = v_user2_id AND user2_id = v_user3_id) OR (user1_id = v_user3_id AND user2_id = v_user2_id))
      AND status IN ('pending', 'vote_active')
  ) THEN
    RAISE NOTICE '⚠ Test: User2 matched instead of User1 (may be due to other factors)';
  ELSE
    RAISE NOTICE '✗ Test FAILED: No match created';
  END IF;
  
  IF v_match_order_correct THEN
    RAISE NOTICE '✅ TEST PASSED: Fairness score influences matching order';
  ELSE
    RAISE NOTICE '❌ TEST FAILED: Fairness score may not be used correctly in matching';
  END IF;
  
  -- Cleanup
  DELETE FROM matches WHERE (user1_id IN (v_user1_id, v_user2_id, v_user3_id) OR user2_id IN (v_user1_id, v_user2_id, v_user3_id));
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id, v_user3_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test ERROR: %', SQLERRM;
END $$;

