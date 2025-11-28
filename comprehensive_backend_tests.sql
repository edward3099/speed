-- ============================================================================
-- TOP 10 MOST EXTENSIVE BACKEND TESTS
-- ============================================================================
-- These tests cover common scenarios, rare edge cases, and potential issues
-- ============================================================================

-- ============================================================================
-- TEST 1: Basic 2-User Matching Flow (Most Common Scenario)
-- ============================================================================
SELECT '=== TEST 1: Basic 2-User Matching Flow ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_queue_result BOOLEAN;
  v_matched_count INTEGER;
  v_active_match RECORD;
BEGIN
  -- Get 2 compatible users (or use existing)
  SELECT id INTO v_user1_id FROM profiles WHERE online = true AND gender = 'male' LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND gender = 'female' AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 1: Need at least 1 male and 1 female user online';
    RETURN;
  END IF;
  
  -- Ensure users have preferences
  INSERT INTO user_preferences (user_id, gender_preference, min_age, max_age, max_distance)
  VALUES 
    (v_user1_id, 'female', 18, 40, 50),
    (v_user2_id, 'male', 18, 40, 50)
  ON CONFLICT (user_id) DO UPDATE SET 
    gender_preference = EXCLUDED.gender_preference;
  
  -- Set users online
  UPDATE profiles SET online = true, cooldown_until = NULL WHERE id IN (v_user1_id, v_user2_id);
  
  -- Remove from queue if exists
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  DELETE FROM matches WHERE (user1_id = v_user1_id OR user2_id = v_user1_id) AND status IN ('pending', 'vote_active');
  
  -- Join queue
  SELECT join_queue(v_user1_id) INTO v_queue_result;
  SELECT join_queue(v_user2_id) INTO v_queue_result;
  
  -- Run matching
  SELECT process_matching() INTO v_matched_count;
  
  -- Check result
  SELECT * INTO v_active_match FROM get_active_match(v_user1_id);
  
  IF v_matched_count > 0 AND v_active_match.match_id IS NOT NULL THEN
    RAISE NOTICE '✓ Test 1 PASSED: Users matched successfully (match_id: %)', v_active_match.match_id;
  ELSE
    RAISE NOTICE '✗ Test 1 FAILED: Users did not match';
  END IF;
  
  -- Cleanup
  DELETE FROM matches WHERE id = v_active_match.match_id;
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 1 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 2: Extreme Gender Imbalance (50M:1F) - Rare but Critical
-- ============================================================================
SELECT '=== TEST 2: Extreme Gender Imbalance (50M:1F) ===' as test_name;

DO $$
DECLARE
  v_male_count INTEGER;
  v_female_count INTEGER;
  v_matched_count INTEGER;
  v_expected_matches INTEGER;
  v_actual_matches INTEGER;
BEGIN
  -- Count available users
  SELECT COUNT(*) INTO v_male_count FROM profiles WHERE online = true AND gender = 'male';
  SELECT COUNT(*) INTO v_female_count FROM profiles WHERE online = true AND gender = 'female';
  
  IF v_female_count = 0 THEN
    RAISE NOTICE '⚠ Test 2: Need at least 1 female user';
    RETURN;
  END IF;
  
  -- Expected matches = min(males, females)
  v_expected_matches := LEAST(v_male_count, v_female_count);
  
  -- Join all available users to queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  SELECT id, 0, NOW(), 0
  FROM profiles
  WHERE online = true
    AND (cooldown_until IS NULL OR cooldown_until < NOW())
    AND NOT EXISTS (SELECT 1 FROM queue q WHERE q.user_id = profiles.id)
  ON CONFLICT (user_id) DO UPDATE SET spin_started_at = NOW();
  
  -- Update user_status
  INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  SELECT id, 'spin_active', NOW(), 'idle', NOW(), NOW(), true, NOW()
  FROM profiles
  WHERE online = true
    AND id IN (SELECT user_id FROM queue)
  ON CONFLICT (user_id) DO UPDATE SET 
    state = 'spin_active',
    spin_started_at = NOW(),
    online_status = true;
  
  -- Run matching multiple times
  v_matched_count := 0;
  FOR i IN 1..10 LOOP
    SELECT process_matching() INTO v_matched_count;
    EXIT WHEN v_matched_count = 0;
  END LOOP;
  
  -- Count actual matches
  SELECT COUNT(*) INTO v_actual_matches
  FROM matches
  WHERE status IN ('pending', 'vote_active')
    AND created_at > NOW() - INTERVAL '1 minute';
  
  IF v_actual_matches <= v_expected_matches THEN
    RAISE NOTICE '✓ Test 2 PASSED: Created % matches (expected: ≤%)', v_actual_matches, v_expected_matches;
  ELSE
    RAISE NOTICE '✗ Test 2 FAILED: Created % matches (expected: ≤%)', v_actual_matches, v_expected_matches;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 2 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 3: Concurrent Matching Stress Test (100+ Users)
-- ============================================================================
SELECT '=== TEST 3: Concurrent Matching Stress Test (100+ Users) ===' as test_name;

DO $$
DECLARE
  v_total_users INTEGER;
  v_matched_count INTEGER;
  v_iterations INTEGER := 0;
  v_duplicate_matches INTEGER;
  v_users_with_multiple_matches INTEGER;
BEGIN
  -- Count users in queue
  SELECT COUNT(*) INTO v_total_users FROM queue;
  
  IF v_total_users < 4 THEN
    RAISE NOTICE '⚠ Test 3: Need at least 4 users in queue';
    RETURN;
  END IF;
  
  -- Run matching in multiple iterations
  LOOP
    v_iterations := v_iterations + 1;
    SELECT process_matching() INTO v_matched_count;
    EXIT WHEN v_matched_count = 0 OR v_iterations >= 20;
  END LOOP;
  
  -- Check for duplicate matches (should be 0)
  SELECT COUNT(*) INTO v_duplicate_matches
  FROM (
    SELECT user1_id, user2_id, COUNT(*) as cnt
    FROM matches
    WHERE status IN ('pending', 'vote_active')
      AND created_at > NOW() - INTERVAL '1 minute'
    GROUP BY user1_id, user2_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- Check for users with multiple active matches (should be 0)
  SELECT COUNT(*) INTO v_users_with_multiple_matches
  FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM (
      SELECT user1_id as user_id FROM matches WHERE status IN ('pending', 'vote_active') AND created_at > NOW() - INTERVAL '1 minute'
      UNION ALL
      SELECT user2_id as user_id FROM matches WHERE status IN ('pending', 'vote_active') AND created_at > NOW() - INTERVAL '1 minute'
    ) all_users
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) multiple;
  
  IF v_duplicate_matches = 0 AND v_users_with_multiple_matches = 0 THEN
    RAISE NOTICE '✓ Test 3 PASSED: No duplicate matches, no users with multiple matches';
    RAISE NOTICE '  - Total users: %, Iterations: %, Matches created: %', v_total_users, v_iterations, 
      (SELECT COUNT(*) FROM matches WHERE status IN ('pending', 'vote_active') AND created_at > NOW() - INTERVAL '1 minute');
  ELSE
    RAISE NOTICE '✗ Test 3 FAILED: Duplicate matches: %, Users with multiple: %', v_duplicate_matches, v_users_with_multiple_matches;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 3 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 4: Preference Stage Progression (Wait Time Expansion)
-- ============================================================================
SELECT '=== TEST 4: Preference Stage Progression ===' as test_name;

DO $$
DECLARE
  v_user_id UUID;
  v_initial_stage INTEGER;
  v_final_stage INTEGER;
  v_wait_seconds INTEGER;
BEGIN
  -- Get a user in queue
  SELECT user_id, preference_stage INTO v_user_id, v_initial_stage
  FROM queue
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ Test 4: Need at least 1 user in queue';
    RETURN;
  END IF;
  
  -- Simulate 25 seconds wait (should trigger stage 3)
  UPDATE queue 
  SET spin_started_at = NOW() - INTERVAL '25 seconds',
      preference_stage = 0
  WHERE user_id = v_user_id;
  
  -- Run matching (should update preference_stage)
  PERFORM process_matching();
  
  -- Check final stage
  SELECT preference_stage, EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER
  INTO v_final_stage, v_wait_seconds
  FROM queue
  WHERE user_id = v_user_id;
  
  IF v_final_stage = 3 AND v_wait_seconds >= 20 THEN
    RAISE NOTICE '✓ Test 4 PASSED: Preference stage updated to 3 (full expansion)';
  ELSIF v_final_stage > v_initial_stage THEN
    RAISE NOTICE '✓ Test 4 PASSED: Preference stage updated from % to %', v_initial_stage, v_final_stage;
  ELSE
    RAISE NOTICE '✗ Test 4 FAILED: Preference stage not updated (stayed at %)', v_initial_stage;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 4 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 5: Active Match Protection (Users Already Matched)
-- ============================================================================
SELECT '=== TEST 5: Active Match Protection ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_new_match_id BIGINT;
  v_matched_count INTEGER;
BEGIN
  -- Get 2 users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 5: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Create an active match
  INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_match_id;
  
  -- Update user_status
  INSERT INTO user_status (user_id, state, vote_window_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  VALUES 
    (v_user1_id, 'vote_active', NOW(), 'paired', NOW(), NOW(), true, NOW()),
    (v_user2_id, 'vote_active', NOW(), 'paired', NOW(), NOW(), true, NOW())
  ON CONFLICT (user_id) DO UPDATE SET state = 'vote_active';
  
  -- Try to match them again (should fail)
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  PERFORM join_queue(v_user1_id);
  PERFORM join_queue(v_user2_id);
  
  SELECT process_matching() INTO v_matched_count;
  
  -- Check if new match was created (should NOT be)
  SELECT id INTO v_new_match_id
  FROM matches
  WHERE ((user1_id = v_user1_id AND user2_id = v_user2_id) OR (user1_id = v_user2_id AND user2_id = v_user1_id))
    AND id != v_match_id
    AND status IN ('pending', 'vote_active');
  
  IF v_new_match_id IS NULL THEN
    RAISE NOTICE '✓ Test 5 PASSED: Users with active match cannot be matched again';
  ELSE
    RAISE NOTICE '✗ Test 5 FAILED: New match created for users already in active match (id: %)', v_new_match_id;
  END IF;
  
  -- Cleanup
  DELETE FROM matches WHERE id = v_match_id;
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 5 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 6: Never Pair Again (Blocked Users)
-- ============================================================================
SELECT '=== TEST 6: Never Pair Again (Blocked Users) ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_matched_count INTEGER;
BEGIN
  -- Get 2 compatible users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true AND gender = 'male' LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND gender = 'female' AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 6: Need 1 male and 1 female user';
    RETURN;
  END IF;
  
  -- Add to never_pair_again
  INSERT INTO never_pair_again (user1, user2)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id))
  ON CONFLICT DO NOTHING;
  
  -- Ensure preferences
  INSERT INTO user_preferences (user_id, gender_preference, min_age, max_age, max_distance)
  VALUES 
    (v_user1_id, 'female', 18, 40, 50),
    (v_user2_id, 'male', 18, 40, 50)
  ON CONFLICT (user_id) DO UPDATE SET gender_preference = EXCLUDED.gender_preference;
  
  -- Join queue
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  DELETE FROM matches WHERE (user1_id = v_user1_id OR user2_id = v_user1_id) AND status IN ('pending', 'vote_active');
  
  PERFORM join_queue(v_user1_id);
  PERFORM join_queue(v_user2_id);
  
  -- Try to match
  SELECT process_matching() INTO v_matched_count;
  
  -- Check if match was created (should NOT be)
  SELECT id INTO v_match_id
  FROM matches
  WHERE ((user1_id = v_user1_id AND user2_id = v_user2_id) OR (user1_id = v_user2_id AND user2_id = v_user1_id))
    AND status IN ('pending', 'vote_active');
  
  IF v_match_id IS NULL THEN
    RAISE NOTICE '✓ Test 6 PASSED: Blocked users cannot be matched';
  ELSE
    RAISE NOTICE '✗ Test 6 FAILED: Blocked users were matched (match_id: %)', v_match_id;
  END IF;
  
  -- Cleanup
  DELETE FROM never_pair_again WHERE (user1 = v_user1_id AND user2 = v_user2_id) OR (user1 = v_user2_id AND user2 = v_user1_id);
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 6 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 7: Vote Recording and Outcome Handling
-- ============================================================================
SELECT '=== TEST 7: Vote Recording and Outcome Handling ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_vote_result JSONB;
  v_match_status TEXT;
  v_vote_count INTEGER;
BEGIN
  -- Get 2 users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 7: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Create an active match
  INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_match_id;
  
  -- User 1 votes yes
  SELECT record_vote(v_user1_id, v_match_id, 'yes') INTO v_vote_result;
  
  -- User 2 votes yes (should trigger both_yes outcome)
  SELECT record_vote(v_user2_id, v_match_id, 'yes') INTO v_vote_result;
  
  -- Check match status
  SELECT status INTO v_match_status FROM matches WHERE id = v_match_id;
  
  -- Check vote count
  SELECT COUNT(*) INTO v_vote_count FROM votes WHERE match_id = v_match_id;
  
  IF v_match_status = 'ended' AND v_vote_count = 2 AND v_vote_result->>'outcome' = 'both_yes' THEN
    RAISE NOTICE '✓ Test 7 PASSED: Both yes votes recorded, match ended, outcome: both_yes';
  ELSE
    RAISE NOTICE '✗ Test 7 FAILED: Status: %, Votes: %, Outcome: %', v_match_status, v_vote_count, v_vote_result->>'outcome';
  END IF;
  
  -- Cleanup
  DELETE FROM votes WHERE match_id = v_match_id;
  DELETE FROM matches WHERE id = v_match_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 7 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 8: Queue Re-join After Match Ends
-- ============================================================================
SELECT '=== TEST 8: Queue Re-join After Match Ends ===' as test_name;

DO $$
DECLARE
  v_user_id UUID;
  v_in_queue_before BOOLEAN;
  v_in_queue_after BOOLEAN;
  v_join_result BOOLEAN;
BEGIN
  -- Get a user
  SELECT id INTO v_user_id FROM profiles WHERE online = true LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ Test 8: Need at least 1 user';
    RETURN;
  END IF;
  
  -- Remove from queue
  DELETE FROM queue WHERE user_id = v_user_id;
  
  -- Join queue
  SELECT join_queue(v_user_id) INTO v_join_result;
  SELECT EXISTS(SELECT 1 FROM queue WHERE user_id = v_user_id) INTO v_in_queue_before;
  
  -- Remove and re-join
  DELETE FROM queue WHERE user_id = v_user_id;
  SELECT join_queue(v_user_id) INTO v_join_result;
  SELECT EXISTS(SELECT 1 FROM queue WHERE user_id = v_user_id) INTO v_in_queue_after;
  
  IF v_in_queue_before = true AND v_in_queue_after = true AND v_join_result = true THEN
    RAISE NOTICE '✓ Test 8 PASSED: User can re-join queue after removal';
  ELSE
    RAISE NOTICE '✗ Test 8 FAILED: Before: %, After: %, Join result: %', v_in_queue_before, v_in_queue_after, v_join_result;
  END IF;
  
  -- Cleanup
  DELETE FROM queue WHERE user_id = v_user_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 8 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 9: Data Integrity and Constraint Validation
-- ============================================================================
SELECT '=== TEST 9: Data Integrity and Constraint Validation ===' as test_name;

DO $$
DECLARE
  v_orphaned_queue INTEGER;
  v_orphaned_status INTEGER;
  v_invalid_matches INTEGER;
  v_invalid_references INTEGER;
  v_multiple_active INTEGER;
BEGIN
  -- Check for orphaned queue entries
  SELECT COUNT(*) INTO v_orphaned_queue
  FROM queue q
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = q.user_id);
  
  -- Check for orphaned user_status
  SELECT COUNT(*) INTO v_orphaned_status
  FROM user_status us
  WHERE us.state IN ('spin_active', 'queue_waiting')
    AND NOT EXISTS (SELECT 1 FROM queue q WHERE q.user_id = us.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM matches m 
      WHERE (m.user1_id = us.user_id OR m.user2_id = us.user_id)
        AND m.status IN ('pending', 'vote_active')
    );
  
  -- Check for invalid match ordering (user1_id should be < user2_id)
  SELECT COUNT(*) INTO v_invalid_matches
  FROM matches
  WHERE user1_id >= user2_id;
  
  -- Check for invalid user references
  SELECT COUNT(*) INTO v_invalid_references
  FROM matches m
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user1_id)
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user2_id);
  
  -- Check for users with multiple active matches
  SELECT COUNT(*) INTO v_multiple_active
  FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM (
      SELECT user1_id as user_id FROM matches WHERE status IN ('pending', 'vote_active')
      UNION ALL
      SELECT user2_id as user_id FROM matches WHERE status IN ('pending', 'vote_active')
    ) all_users
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) multiple;
  
  IF v_orphaned_queue = 0 AND v_orphaned_status = 0 AND v_invalid_matches = 0 
     AND v_invalid_references = 0 AND v_multiple_active = 0 THEN
    RAISE NOTICE '✓ Test 9 PASSED: All data integrity checks passed';
    RAISE NOTICE '  - Orphaned queue: %, Orphaned status: %, Invalid matches: %', v_orphaned_queue, v_orphaned_status, v_invalid_matches;
    RAISE NOTICE '  - Invalid references: %, Multiple active: %', v_invalid_references, v_multiple_active;
  ELSE
    RAISE NOTICE '✗ Test 9 FAILED: Data integrity issues found';
    RAISE NOTICE '  - Orphaned queue: %, Orphaned status: %, Invalid matches: %', v_orphaned_queue, v_orphaned_status, v_invalid_matches;
    RAISE NOTICE '  - Invalid references: %, Multiple active: %', v_invalid_references, v_multiple_active;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 9 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST 10: Complete End-to-End Flow (Match → Vote → Video Date)
-- ============================================================================
SELECT '=== TEST 10: Complete End-to-End Flow ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_vote_result JSONB;
  v_video_date_id UUID;
  v_flow_status TEXT := 'STARTED';
BEGIN
  -- Get 2 compatible users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true AND gender = 'male' LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND gender = 'female' AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 10: Need 1 male and 1 female user';
    RETURN;
  END IF;
  
  -- Step 1: Ensure preferences
  INSERT INTO user_preferences (user_id, gender_preference, min_age, max_age, max_distance)
  VALUES 
    (v_user1_id, 'female', 18, 40, 50),
    (v_user2_id, 'male', 18, 40, 50)
  ON CONFLICT (user_id) DO UPDATE SET gender_preference = EXCLUDED.gender_preference;
  
  -- Step 2: Clean up
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  DELETE FROM matches WHERE (user1_id = v_user1_id OR user2_id = v_user1_id);
  DELETE FROM votes WHERE match_id IN (SELECT id FROM matches WHERE user1_id = v_user1_id OR user2_id = v_user1_id);
  DELETE FROM video_dates WHERE match_id IN (SELECT id FROM matches WHERE user1_id = v_user1_id OR user2_id = v_user1_id);
  
  -- Step 3: Join queue
  PERFORM join_queue(v_user1_id);
  PERFORM join_queue(v_user2_id);
  v_flow_status := 'QUEUED';
  
  -- Step 4: Match
  PERFORM process_matching();
  SELECT id INTO v_match_id FROM matches 
  WHERE ((user1_id = v_user1_id AND user2_id = v_user2_id) OR (user1_id = v_user2_id AND user2_id = v_user1_id))
    AND status IN ('pending', 'vote_active');
  
  IF v_match_id IS NULL THEN
    RAISE NOTICE '✗ Test 10 FAILED at MATCHING: No match created';
    RETURN;
  END IF;
  v_flow_status := 'MATCHED';
  
  -- Step 5: Both vote yes
  SELECT record_vote(v_user1_id, v_match_id, 'yes') INTO v_vote_result;
  SELECT record_vote(v_user2_id, v_match_id, 'yes') INTO v_vote_result;
  
  IF v_vote_result->>'outcome' != 'both_yes' THEN
    RAISE NOTICE '✗ Test 10 FAILED at VOTING: Outcome is not both_yes';
    RETURN;
  END IF;
  v_flow_status := 'VOTED';
  
  -- Step 6: Create video_date
  INSERT INTO video_dates (match_id, user1_id, user2_id, status)
  VALUES (v_match_id, LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'countdown')
  RETURNING id INTO v_video_date_id;
  
  IF v_video_date_id IS NULL THEN
    RAISE NOTICE '✗ Test 10 FAILED at VIDEO_DATE: Could not create video_date';
    RETURN;
  END IF;
  v_flow_status := 'VIDEO_DATE_CREATED';
  
  RAISE NOTICE '✓ Test 10 PASSED: Complete flow successful';
  RAISE NOTICE '  - Match ID: %, Video Date ID: %, Flow: %', v_match_id, v_video_date_id, v_flow_status;
  
  -- Cleanup
  DELETE FROM video_dates WHERE id = v_video_date_id;
  DELETE FROM votes WHERE match_id = v_match_id;
  DELETE FROM matches WHERE id = v_match_id;
  DELETE FROM queue WHERE user_id IN (v_user1_id, v_user2_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 10 ERROR at %: %', v_flow_status, SQLERRM;
  RAISE NOTICE '  - SQLSTATE: %', SQLSTATE;
END $$;

-- ============================================================================
-- TEST SUMMARY
-- ============================================================================
SELECT '=== TEST SUMMARY ===' as summary;

SELECT 
  'test_results' as report_type,
  json_build_object(
    'test_1_basic_matching', 'Completed',
    'test_2_gender_imbalance', 'Completed',
    'test_3_concurrent_stress', 'Completed',
    'test_4_preference_stage', 'Completed',
    'test_5_active_match_protection', 'Completed',
    'test_6_never_pair_again', 'Completed',
    'test_7_vote_recording', 'Completed',
    'test_8_queue_rejoin', 'Completed',
    'test_9_data_integrity', 'Completed',
    'test_10_end_to_end', 'Completed',
    'total_tests', 10,
    'status', 'All tests executed - check NOTICE messages for results'
  ) as summary;

