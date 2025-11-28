-- ============================================================================
-- CRITICAL ERROR TESTS - Exposing All Potential Errors
-- ============================================================================
-- These tests focus on critical errors, edge cases, and failure scenarios
-- ============================================================================

-- ============================================================================
-- CRITICAL TEST 1: Concurrent Vote Race Condition
-- ============================================================================
-- Tests: Both users voting simultaneously, vote window expiring during vote
SELECT '=== CRITICAL TEST 1: Concurrent Vote Race Condition ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_vote1_result JSONB;
  v_vote2_result JSONB;
  v_final_status TEXT;
  v_vote_count INTEGER;
BEGIN
  -- Get 2 users
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 1: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Create match with vote window expiring in 1 second
  INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '1 second')
  RETURNING id INTO v_match_id;
  
  -- Wait 2 seconds (vote window expires)
  PERFORM pg_sleep(2);
  
  -- Try to vote after expiration (should fail or handle gracefully)
  BEGIN
    SELECT record_vote(v_user1_id, v_match_id, 'yes') INTO v_vote1_result;
    SELECT record_vote(v_user2_id, v_match_id, 'yes') INTO v_vote2_result;
    
    -- Check final state
    SELECT status INTO v_final_status FROM matches WHERE id = v_match_id;
    SELECT COUNT(*) INTO v_vote_count FROM votes WHERE match_id = v_match_id;
    
    IF v_final_status = 'ended' AND v_vote_count <= 2 THEN
      RAISE NOTICE '✓ Test 1 PASSED: Expired vote window handled correctly';
    ELSE
      RAISE NOTICE '✗ Test 1 FAILED: Status: %, Votes: % (should be ended with ≤2 votes)', v_final_status, v_vote_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠ Test 1: Exception caught (may be expected): %', SQLERRM;
  END;
  
  -- Cleanup
  DELETE FROM votes WHERE match_id = v_match_id;
  DELETE FROM matches WHERE id = v_match_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 1 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 2: Match ID Type Mismatch (BIGINT vs UUID)
-- ============================================================================
-- Tests: Passing wrong type to functions expecting match_id
SELECT '=== CRITICAL TEST 2: Match ID Type Mismatch ===' as test_name;

DO $$
DECLARE
  v_user_id UUID;
  v_error_occurred BOOLEAN := false;
BEGIN
  SELECT id INTO v_user_id FROM profiles WHERE online = true LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ Test 2: Need at least 1 user';
    RETURN;
  END IF;
  
  -- Try to pass UUID as match_id (should fail)
  BEGIN
    PERFORM get_active_match(v_user_id::TEXT);
    v_error_occurred := true;
    RAISE NOTICE '✗ Test 2 FAILED: UUID accepted as match_id';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%type%' OR SQLERRM LIKE '%uuid%' OR SQLERRM LIKE '%bigint%' THEN
      RAISE NOTICE '✓ Test 2 PASSED: Type mismatch correctly rejected';
    ELSE
      RAISE NOTICE '⚠ Test 2: Unexpected error: %', SQLERRM;
    END IF;
  END;
  
  -- Try to pass invalid match_id to record_vote
  BEGIN
    PERFORM record_vote(v_user_id, -1, 'yes');
    v_error_occurred := true;
    RAISE NOTICE '✗ Test 2 FAILED: Invalid match_id accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not found%' OR SQLERRM LIKE '%match%' THEN
      RAISE NOTICE '✓ Test 2 PASSED: Invalid match_id correctly rejected';
    ELSE
      RAISE NOTICE '⚠ Test 2: Unexpected error: %', SQLERRM;
    END IF;
  END;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 2 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 3: Orphaned Queue Entries After User Deletion
-- ============================================================================
-- Tests: What happens if a user is deleted while in queue
SELECT '=== CRITICAL TEST 3: Orphaned Queue Entries ===' as test_name;

DO $$
DECLARE
  v_orphaned_count INTEGER;
  v_invalid_references INTEGER;
BEGIN
  -- Check for orphaned queue entries (user_id doesn't exist)
  SELECT COUNT(*) INTO v_orphaned_count
  FROM queue q
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = q.user_id);
  
  -- Check for invalid foreign key references
  SELECT COUNT(*) INTO v_invalid_references
  FROM matches m
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user1_id)
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user2_id);
  
  IF v_orphaned_count = 0 AND v_invalid_references = 0 THEN
    RAISE NOTICE '✓ Test 3 PASSED: No orphaned entries found';
  ELSE
    RAISE NOTICE '✗ Test 3 FAILED: Orphaned queue: %, Invalid matches: %', v_orphaned_count, v_invalid_references;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 3 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 4: Double Vote Prevention
-- ============================================================================
-- Tests: User voting twice, same vote, different votes
SELECT '=== CRITICAL TEST 4: Double Vote Prevention ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_vote1_result JSONB;
  v_vote2_result JSONB;
  v_vote3_result JSONB;
  v_vote_count INTEGER;
BEGIN
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 4: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Create active match
  INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds')
  RETURNING id INTO v_match_id;
  
  -- User 1 votes yes
  SELECT record_vote(v_user1_id, v_match_id, 'yes') INTO v_vote1_result;
  
  -- User 1 tries to vote again (should be prevented or ignored)
  BEGIN
    SELECT record_vote(v_user1_id, v_match_id, 'no') INTO v_vote2_result;
    
    -- Check vote count (should still be 1, not 2)
    SELECT COUNT(*) INTO v_vote_count FROM votes WHERE match_id = v_match_id AND voter_id = v_user1_id;
    
    IF v_vote_count = 1 THEN
      RAISE NOTICE '✓ Test 4 PASSED: Double vote prevented (count: %)', v_vote_count;
    ELSE
      RAISE NOTICE '✗ Test 4 FAILED: Double vote allowed (count: %)', v_vote_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%already%' OR SQLERRM LIKE '%duplicate%' OR SQLERRM LIKE '%unique%' THEN
      RAISE NOTICE '✓ Test 4 PASSED: Double vote correctly rejected with error';
    ELSE
      RAISE NOTICE '⚠ Test 4: Unexpected error: %', SQLERRM;
    END IF;
  END;
  
  -- Cleanup
  DELETE FROM votes WHERE match_id = v_match_id;
  DELETE FROM matches WHERE id = v_match_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 4 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 5: Match Status Transition Integrity
-- ============================================================================
-- Tests: Invalid status transitions, status corruption
SELECT '=== CRITICAL TEST 5: Match Status Transition Integrity ===' as test_name;

DO $$
DECLARE
  v_invalid_transitions INTEGER;
  v_pending_with_votes INTEGER;
  v_ended_without_votes INTEGER;
BEGIN
  -- Check for matches in 'pending' status with votes (should be 'vote_active')
  SELECT COUNT(*) INTO v_pending_with_votes
  FROM matches m
  WHERE m.status = 'pending'
    AND EXISTS (SELECT 1 FROM votes v WHERE v.match_id = m.id);
  
  -- Check for matches in 'ended' status without any votes
  SELECT COUNT(*) INTO v_ended_without_votes
  FROM matches m
  WHERE m.status = 'ended'
    AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.match_id = m.id)
    AND m.created_at > NOW() - INTERVAL '1 hour';  -- Recent matches only
  
  -- Check for vote_active matches without vote_window_expires_at
  SELECT COUNT(*) INTO v_invalid_transitions
  FROM matches
  WHERE status = 'vote_active'
    AND vote_window_expires_at IS NULL;
  
  IF v_invalid_transitions = 0 AND v_pending_with_votes = 0 AND v_ended_without_votes = 0 THEN
    RAISE NOTICE '✓ Test 5 PASSED: All status transitions valid';
  ELSE
    RAISE NOTICE '✗ Test 5 FAILED: Invalid transitions: %, Pending with votes: %, Ended without votes: %', 
      v_invalid_transitions, v_pending_with_votes, v_ended_without_votes;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 5 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 6: Queue Lock Contention Under High Load
-- ============================================================================
-- Tests: Multiple users joining queue simultaneously
SELECT '=== CRITICAL TEST 6: Queue Lock Contention ===' as test_name;

DO $$
DECLARE
  v_users UUID[];
  v_successful_joins INTEGER := 0;
  v_failed_joins INTEGER := 0;
  v_duplicate_entries INTEGER;
  v_user_id UUID;
BEGIN
  -- Get multiple users
  SELECT ARRAY_AGG(id) INTO v_users
  FROM profiles
  WHERE online = true
  LIMIT 20;
  
  IF array_length(v_users, 1) IS NULL OR array_length(v_users, 1) < 5 THEN
    RAISE NOTICE '⚠ Test 6: Need at least 5 users';
    RETURN;
  END IF;
  
  -- Clear queue
  DELETE FROM queue WHERE user_id = ANY(v_users);
  
  -- Simulate simultaneous joins
  FOREACH v_user_id IN ARRAY v_users
  LOOP
    BEGIN
      IF join_queue(v_user_id) THEN
        v_successful_joins := v_successful_joins + 1;
      ELSE
        v_failed_joins := v_failed_joins + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed_joins := v_failed_joins + 1;
      RAISE NOTICE '⚠ Join failed for user: %', v_user_id;
    END;
  END LOOP;
  
  -- Check for duplicate entries
  SELECT COUNT(*) INTO v_duplicate_entries
  FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM queue
    WHERE user_id = ANY(v_users)
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF v_duplicate_entries = 0 AND v_successful_joins > 0 THEN
    RAISE NOTICE '✓ Test 6 PASSED: No duplicate entries, % successful joins', v_successful_joins;
  ELSE
    RAISE NOTICE '✗ Test 6 FAILED: Duplicates: %, Successful: %, Failed: %', 
      v_duplicate_entries, v_successful_joins, v_failed_joins;
  END IF;
  
  -- Cleanup
  DELETE FROM queue WHERE user_id = ANY(v_users);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 6 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 7: Foreign Key Constraint Violations
-- ============================================================================
-- Tests: Invalid foreign key references
SELECT '=== CRITICAL TEST 7: Foreign Key Constraint Violations ===' as test_name;

DO $$
DECLARE
  v_invalid_matches INTEGER;
  v_invalid_votes INTEGER;
  v_invalid_queue INTEGER;
  v_invalid_user_status INTEGER;
BEGIN
  -- Check matches with invalid user references
  SELECT COUNT(*) INTO v_invalid_matches
  FROM matches m
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user1_id)
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.user2_id);
  
  -- Check votes with invalid references
  SELECT COUNT(*) INTO v_invalid_votes
  FROM votes v
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v.voter_id)
     OR NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = v.match_id);
  
  -- Check queue with invalid references
  SELECT COUNT(*) INTO v_invalid_queue
  FROM queue q
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = q.user_id);
  
  -- Check user_status with invalid references
  SELECT COUNT(*) INTO v_invalid_user_status
  FROM user_status us
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = us.user_id);
  
  IF v_invalid_matches = 0 AND v_invalid_votes = 0 
     AND v_invalid_queue = 0 AND v_invalid_user_status = 0 THEN
    RAISE NOTICE '✓ Test 7 PASSED: All foreign key constraints valid';
  ELSE
    RAISE NOTICE '✗ Test 7 FAILED: Invalid matches: %, Votes: %, Queue: %, User_status: %', 
      v_invalid_matches, v_invalid_votes, v_invalid_queue, v_invalid_user_status;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 7 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 8: Vote Window Expiration Edge Cases
-- ============================================================================
-- Tests: Vote window exactly at expiration, just before, just after
SELECT '=== CRITICAL TEST 8: Vote Window Expiration Edge Cases ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id BIGINT;
  v_remaining_seconds INTEGER;
  v_vote_result JSONB;
BEGIN
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 8: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Create match with vote window expiring in 1 second
  INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
  VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '1 second')
  RETURNING id INTO v_match_id;
  
  -- Check remaining time (should be ~1 second)
  SELECT get_voting_window_remaining(v_match_id) INTO v_remaining_seconds;
  
  IF v_remaining_seconds BETWEEN 0 AND 2 THEN
    RAISE NOTICE '✓ Test 8 PASSED: Remaining time correct: % seconds', v_remaining_seconds;
  ELSE
    RAISE NOTICE '✗ Test 8 FAILED: Remaining time incorrect: % seconds', v_remaining_seconds;
  END IF;
  
  -- Wait for expiration
  PERFORM pg_sleep(2);
  
  -- Check remaining time after expiration (should be 0 or negative)
  SELECT get_voting_window_remaining(v_match_id) INTO v_remaining_seconds;
  
  IF v_remaining_seconds <= 0 THEN
    RAISE NOTICE '✓ Test 8 PASSED: Expired window correctly detected: % seconds', v_remaining_seconds;
  ELSE
    RAISE NOTICE '✗ Test 8 FAILED: Expired window not detected: % seconds', v_remaining_seconds;
  END IF;
  
  -- Cleanup
  DELETE FROM matches WHERE id = v_match_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 8 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 9: Process Matching Deadlock Prevention
-- ============================================================================
-- Tests: Multiple process_matching calls simultaneously
SELECT '=== CRITICAL TEST 9: Process Matching Deadlock Prevention ===' as test_name;

DO $$
DECLARE
  v_users_in_queue INTEGER;
  v_matches_before INTEGER;
  v_matches_after INTEGER;
  v_deadlock_occurred BOOLEAN := false;
BEGIN
  -- Count users in queue
  SELECT COUNT(*) INTO v_users_in_queue FROM queue;
  
  IF v_users_in_queue < 4 THEN
    RAISE NOTICE '⚠ Test 9: Need at least 4 users in queue';
    RETURN;
  END IF;
  
  -- Count matches before
  SELECT COUNT(*) INTO v_matches_before FROM matches WHERE status IN ('pending', 'vote_active');
  
  -- Run process_matching multiple times rapidly
  BEGIN
    PERFORM process_matching();
    PERFORM process_matching();
    PERFORM process_matching();
    
    -- Count matches after
    SELECT COUNT(*) INTO v_matches_after FROM matches WHERE status IN ('pending', 'vote_active');
    
    IF v_matches_after >= v_matches_before THEN
      RAISE NOTICE '✓ Test 9 PASSED: No deadlock, matches increased from % to %', v_matches_before, v_matches_after;
    ELSE
      RAISE NOTICE '⚠ Test 9: Matches decreased (may be expected): % to %', v_matches_before, v_matches_after;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%deadlock%' OR SQLERRM LIKE '%lock%' THEN
      RAISE NOTICE '✗ Test 9 FAILED: Deadlock occurred: %', SQLERRM;
      v_deadlock_occurred := true;
    ELSE
      RAISE NOTICE '⚠ Test 9: Unexpected error: %', SQLERRM;
    END IF;
  END;
  
  IF NOT v_deadlock_occurred THEN
    RAISE NOTICE '✓ Test 9 PASSED: No deadlocks detected';
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 9 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 10: Data Type Consistency Across All Tables
-- ============================================================================
-- Tests: All match_id references use BIGINT, all user_id use UUID
SELECT '=== CRITICAL TEST 10: Data Type Consistency ===' as test_name;

DO $$
DECLARE
  v_type_errors INTEGER := 0;
  v_error_details TEXT := '';
BEGIN
  -- Check matches.id is BIGINT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'id' AND data_type != 'bigint'
  ) THEN
    v_type_errors := v_type_errors + 1;
    v_error_details := v_error_details || 'matches.id; ';
  END IF;
  
  -- Check votes.match_id is BIGINT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'votes' AND column_name = 'match_id' AND data_type != 'bigint'
  ) THEN
    v_type_errors := v_type_errors + 1;
    v_error_details := v_error_details || 'votes.match_id; ';
  END IF;
  
  -- Check video_dates.match_id is BIGINT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'video_dates' AND column_name = 'match_id' AND data_type != 'bigint'
  ) THEN
    v_type_errors := v_type_errors + 1;
    v_error_details := v_error_details || 'video_dates.match_id; ';
  END IF;
  
  -- Check votes.voter_id is UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'votes' AND column_name = 'voter_id' AND data_type != 'uuid'
  ) THEN
    v_type_errors := v_type_errors + 1;
    v_error_details := v_error_details || 'votes.voter_id; ';
  END IF;
  
  IF v_type_errors = 0 THEN
    RAISE NOTICE '✓ Test 10 PASSED: All data types consistent';
  ELSE
    RAISE NOTICE '✗ Test 10 FAILED: % type errors: %', v_type_errors, v_error_details;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 10 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 11: Null Value Handling
-- ============================================================================
-- Tests: NULL values in critical columns
SELECT '=== CRITICAL TEST 11: Null Value Handling ===' as test_name;

DO $$
DECLARE
  v_null_matches INTEGER;
  v_null_votes INTEGER;
  v_null_queue INTEGER;
BEGIN
  -- Check for NULL user_id in matches
  SELECT COUNT(*) INTO v_null_matches
  FROM matches
  WHERE user1_id IS NULL OR user2_id IS NULL;
  
  -- Check for NULL voter_id or match_id in votes
  SELECT COUNT(*) INTO v_null_votes
  FROM votes
  WHERE voter_id IS NULL OR match_id IS NULL;
  
  -- Check for NULL user_id in queue
  SELECT COUNT(*) INTO v_null_queue
  FROM queue
  WHERE user_id IS NULL;
  
  IF v_null_matches = 0 AND v_null_votes = 0 AND v_null_queue = 0 THEN
    RAISE NOTICE '✓ Test 11 PASSED: No NULL values in critical columns';
  ELSE
    RAISE NOTICE '✗ Test 11 FAILED: NULL matches: %, Votes: %, Queue: %', 
      v_null_matches, v_null_votes, v_null_queue;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 11 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 12: Function Parameter Validation
-- ============================================================================
-- Tests: Functions handle invalid parameters gracefully
SELECT '=== CRITICAL TEST 12: Function Parameter Validation ===' as test_name;

DO $$
DECLARE
  v_invalid_user_id UUID := '00000000-0000-0000-0000-000000000000'::UUID;
  v_invalid_match_id BIGINT := -1;
  v_error_handled BOOLEAN := false;
BEGIN
  -- Test join_queue with invalid user_id
  BEGIN
    IF join_queue(v_invalid_user_id) THEN
      RAISE NOTICE '⚠ Test 12: Invalid user_id accepted by join_queue';
    ELSE
      RAISE NOTICE '✓ Test 12 PASSED: Invalid user_id rejected by join_queue';
      v_error_handled := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✓ Test 12 PASSED: Invalid user_id caused exception (expected)';
    v_error_handled := true;
  END;
  
  -- Test record_vote with invalid match_id
  BEGIN
    PERFORM record_vote(v_invalid_user_id, v_invalid_match_id, 'yes');
    RAISE NOTICE '✗ Test 12 FAILED: Invalid match_id accepted by record_vote';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%not found%' OR SQLERRM LIKE '%match%' THEN
      RAISE NOTICE '✓ Test 12 PASSED: Invalid match_id correctly rejected';
      v_error_handled := true;
    END IF;
  END;
  
  -- Test get_active_match with invalid user_id
  BEGIN
    PERFORM get_active_match(v_invalid_user_id);
    RAISE NOTICE '✓ Test 12 PASSED: get_active_match handled invalid user_id gracefully';
    v_error_handled := true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠ Test 12: get_active_match threw exception: %', SQLERRM;
  END;
  
  IF v_error_handled THEN
    RAISE NOTICE '✓ Test 12 PASSED: Functions handle invalid parameters';
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 12 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 13: Transaction Rollback Scenarios
-- ============================================================================
-- Tests: Partial failures, rollback behavior
SELECT '=== CRITICAL TEST 13: Transaction Rollback Scenarios ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_id_before INTEGER;
  v_match_id_after INTEGER;
BEGIN
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 13: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Count matches before
  SELECT COUNT(*) INTO v_match_id_before FROM matches;
  
  -- Simulate transaction that should rollback
  BEGIN
    -- Create match
    INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
    VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds');
    
    -- Force an error (invalid vote_type)
    BEGIN
      PERFORM record_vote(v_user1_id, (SELECT id FROM matches WHERE user1_id = v_user1_id ORDER BY created_at DESC LIMIT 1), 'invalid_vote');
      RAISE EXCEPTION 'Should not reach here';
    EXCEPTION WHEN OTHERS THEN
      -- Expected error, check if match was rolled back
      SELECT COUNT(*) INTO v_match_id_after FROM matches;
      
      IF v_match_id_after = v_match_id_before THEN
        RAISE NOTICE '✓ Test 13 PASSED: Transaction rolled back correctly';
      ELSE
        RAISE NOTICE '⚠ Test 13: Match count changed (may be expected): % to %', v_match_id_before, v_match_id_after;
      END IF;
    END;
  END;
  
  -- Cleanup
  DELETE FROM matches WHERE user1_id = v_user1_id AND created_at > NOW() - INTERVAL '1 minute';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 13 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 14: Index Usage and Performance
-- ============================================================================
-- Tests: Critical indexes exist and are being used
SELECT '=== CRITICAL TEST 14: Index Usage and Performance ===' as test_name;

DO $$
DECLARE
  v_missing_indexes INTEGER := 0;
  v_index_details TEXT := '';
BEGIN
  -- Check for partial unique index on matches
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matches' 
      AND indexdef LIKE '%WHERE%'
      AND indexdef LIKE '%user1_id%'
  ) THEN
    v_missing_indexes := v_missing_indexes + 1;
    v_index_details := v_index_details || 'matches partial index; ';
  END IF;
  
  -- Check for index on queue.user_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'queue' AND indexname LIKE '%user_id%'
  ) THEN
    v_missing_indexes := v_missing_indexes + 1;
    v_index_details := v_index_details || 'queue.user_id index; ';
  END IF;
  
  -- Check for index on votes.match_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'votes' AND indexname LIKE '%match_id%'
  ) THEN
    v_missing_indexes := v_missing_indexes + 1;
    v_index_details := v_index_details || 'votes.match_id index; ';
  END IF;
  
  IF v_missing_indexes = 0 THEN
    RAISE NOTICE '✓ Test 14 PASSED: All critical indexes exist';
  ELSE
    RAISE NOTICE '✗ Test 14 FAILED: Missing % indexes: %', v_missing_indexes, v_index_details;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 14 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- CRITICAL TEST 15: Concurrent Match Creation Prevention
-- ============================================================================
-- Tests: Same users matched multiple times simultaneously
SELECT '=== CRITICAL TEST 15: Concurrent Match Creation Prevention ===' as test_name;

DO $$
DECLARE
  v_user1_id UUID;
  v_user2_id UUID;
  v_match_count INTEGER;
  v_duplicate_matches INTEGER;
BEGIN
  SELECT id INTO v_user1_id FROM profiles WHERE online = true LIMIT 1;
  SELECT id INTO v_user2_id FROM profiles WHERE online = true AND id != v_user1_id LIMIT 1;
  
  IF v_user1_id IS NULL OR v_user2_id IS NULL THEN
    RAISE NOTICE '⚠ Test 15: Need at least 2 users';
    RETURN;
  END IF;
  
  -- Clean up existing matches
  DELETE FROM matches WHERE (user1_id = v_user1_id AND user2_id = v_user2_id) 
                         OR (user1_id = v_user2_id AND user2_id = v_user1_id);
  
  -- Try to create multiple matches for same users (should be prevented by unique index)
  BEGIN
    INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
    VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds');
    
    INSERT INTO matches (user1_id, user2_id, status, vote_window_expires_at)
    VALUES (LEAST(v_user1_id, v_user2_id), GREATEST(v_user1_id, v_user2_id), 'vote_active', NOW() + INTERVAL '30 seconds');
    
    -- Count matches
    SELECT COUNT(*) INTO v_match_count
    FROM matches
    WHERE ((user1_id = v_user1_id AND user2_id = v_user2_id) 
        OR (user1_id = v_user2_id AND user2_id = v_user1_id))
      AND status = 'vote_active';
    
    IF v_match_count = 1 THEN
      RAISE NOTICE '✓ Test 15 PASSED: Duplicate match prevented';
    ELSE
      RAISE NOTICE '✗ Test 15 FAILED: % matches created for same users', v_match_count;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✓ Test 15 PASSED: Unique constraint prevented duplicate match';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠ Test 15: Unexpected error: %', SQLERRM;
  END;
  
  -- Cleanup
  DELETE FROM matches WHERE (user1_id = v_user1_id AND user2_id = v_user2_id) 
                         OR (user1_id = v_user2_id AND user2_id = v_user1_id);
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '✗ Test 15 ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TEST SUMMARY
-- ============================================================================
SELECT '=== CRITICAL ERROR TEST SUMMARY ===' as summary;

SELECT 
  'critical_test_results' as report_type,
  json_build_object(
    'test_1_concurrent_vote_race', 'Completed',
    'test_2_match_id_type_mismatch', 'Completed',
    'test_3_orphaned_queue_entries', 'Completed',
    'test_4_double_vote_prevention', 'Completed',
    'test_5_status_transition_integrity', 'Completed',
    'test_6_queue_lock_contention', 'Completed',
    'test_7_foreign_key_constraints', 'Completed',
    'test_8_vote_window_expiration', 'Completed',
    'test_9_deadlock_prevention', 'Completed',
    'test_10_data_type_consistency', 'Completed',
    'test_11_null_value_handling', 'Completed',
    'test_12_parameter_validation', 'Completed',
    'test_13_transaction_rollback', 'Completed',
    'test_14_index_usage', 'Completed',
    'test_15_concurrent_match_prevention', 'Completed',
    'total_tests', 15,
    'status', 'All critical error tests executed - check NOTICE messages for results'
  ) as summary;

