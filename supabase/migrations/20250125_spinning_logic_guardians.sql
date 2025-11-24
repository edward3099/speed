-- ============================================================================
-- SPINNING LOGIC GUARDIANS - Traffic Controllers & Wardens
-- ============================================================================
-- 
-- These functions act as enforcers/guardians for the spinning logic, ensuring:
-- 1. No spin fails - Every spin leads to a pairing
-- 2. No timeouts - Users stay matchable until paired
-- 3. No user left out - Everyone eventually gets matched
-- 4. Proper state transitions - spin_active → queue_waiting → vote_active
-- 5. Fairness enforcement - Long-waiting users get priority
-- 6. Rule compliance - Gender, preferences, blocked users
-- 7. No duplicates - No user can appear for more than one person
-- 8. Voting behavior - Proper yes/respin handling with priority boosts
--
-- These guardians run continuously to monitor and enforce the matching logic.
-- ============================================================================

-- ============================================================================
-- GUARDIAN 1: Spin Success Enforcer
-- ============================================================================
-- Ensures: "No spin fails. Every spin leads to a pairing."
-- Monitors: Users in spin_active/queue_waiting for >30 seconds
-- Action: Forces matching attempts, expands preferences if needed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_ensure_no_failed_spins()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  unmatched_users INTEGER := 0;
  forced_matches INTEGER := 0;
  user_record RECORD;
  wait_seconds INTEGER;
  match_id UUID;
BEGIN
  -- Find users waiting >30 seconds (should have been matched by now)
  FOR user_record IN
    SELECT 
      mq.user_id,
      mq.joined_at,
      EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER AS wait_time,
      mq.status,
      p.gender,
      up.gender_preference
    FROM matching_queue mq
    INNER JOIN profiles p ON p.id = mq.user_id
    INNER JOIN user_preferences up ON up.user_id = mq.user_id
    WHERE mq.status IN ('spin_active', 'queue_waiting')
      AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER > 30
    ORDER BY mq.joined_at ASC
    LIMIT 50 -- Process 50 at a time to avoid overload
  LOOP
    unmatched_users := unmatched_users + 1;
    wait_seconds := user_record.wait_time;
    
    -- Try to force a match using process_matching_v2 with Tier 3 (guaranteed match)
    BEGIN
      SELECT spark_process_matching(user_record.user_id) INTO match_id;
      
      IF match_id IS NOT NULL THEN
        forced_matches := forced_matches + 1;
        
        -- Log successful forced match
        PERFORM spark_log_event(
          'guardian_action',
          'forced_match',
          'Guardian forced match for long-waiting user',
          jsonb_build_object(
            'user_id', user_record.user_id,
            'wait_seconds', wait_seconds,
            'match_id', match_id,
            'guardian', 'ensure_no_failed_spins'
          ),
          user_record.user_id,
          NULL,
          'matches',
          'GUARDIAN',
          'INFO'
        );
      ELSE
        -- Log that we tried but couldn't force a match (might need preference expansion)
        PERFORM spark_log_event(
          'guardian_warning',
          'failed_forced_match',
          'Guardian attempted forced match but failed',
          jsonb_build_object(
            'user_id', user_record.user_id,
            'wait_seconds', wait_seconds,
            'guardian', 'ensure_no_failed_spins'
          ),
          user_record.user_id,
          NULL,
          'matching_queue',
          'GUARDIAN',
          'WARNING'
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue
        PERFORM spark_log_error(
          'function',
          SQLERRM,
          SQLSTATE,
          jsonb_build_object(
            'function', 'guardian_ensure_no_failed_spins',
            'user_id', user_record.user_id,
            'wait_seconds', wait_seconds
          ),
          'guardian_ensure_no_failed_spins',
          user_record.user_id,
          0,
          'ERROR'
        );
    END;
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'ensure_no_failed_spins',
    'unmatched_users_checked', unmatched_users,
    'forced_matches', forced_matches,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_ensure_no_failed_spins IS 'GUARDIAN: Ensures no spin fails. Monitors users waiting >30 seconds and forces matching attempts.';

-- ============================================================================
-- GUARDIAN 2: State Transition Enforcer
-- ============================================================================
-- Ensures: Proper state transitions (spin_active → queue_waiting → vote_active)
-- Monitors: Invalid state transitions, stuck states
-- Action: Corrects invalid states, ensures proper transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_state_transitions()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  corrections INTEGER := 0;
  issue_record RECORD;
BEGIN
  -- 1. Find users in vote_active without a pending match (invalid state)
  FOR issue_record IN
    SELECT mq.user_id, mq.status
    FROM matching_queue mq
    WHERE mq.status = 'vote_active'
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = mq.user_id OR m.user2_id = mq.user_id)
          AND m.status = 'pending'
      )
  LOOP
    -- Correct: Move back to spin_active (they should be matchable again)
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id = issue_record.user_id;
    
    corrections := corrections + 1;
    
    PERFORM spark_log_event(
      'guardian_action',
      'state_correction',
      'Guardian corrected invalid vote_active state (no match)',
      jsonb_build_object(
        'user_id', issue_record.user_id,
        'old_status', issue_record.status,
        'new_status', 'spin_active',
        'guardian', 'enforce_state_transitions'
      ),
      issue_record.user_id,
      NULL,
      'matching_queue',
      'GUARDIAN',
      'WARNING'
    );
  END LOOP;
  
  -- 2. Find users with pending matches but not in vote_active (should be locked)
  FOR issue_record IN
    SELECT DISTINCT mq.user_id, mq.status
    FROM matching_queue mq
    INNER JOIN matches m ON (
      (m.user1_id = mq.user_id OR m.user2_id = mq.user_id)
      AND m.status = 'pending'
    )
    WHERE mq.status != 'vote_active'
  LOOP
    -- Correct: Move to vote_active (they have a pending match)
    UPDATE matching_queue
    SET status = 'vote_active',
        updated_at = NOW()
    WHERE user_id = issue_record.user_id;
    
    corrections := corrections + 1;
    
    PERFORM spark_log_event(
      'guardian_action',
      'state_correction',
      'Guardian corrected state: user has match but not in vote_active',
      jsonb_build_object(
        'user_id', issue_record.user_id,
        'old_status', issue_record.status,
        'new_status', 'vote_active',
        'guardian', 'enforce_state_transitions'
      ),
      issue_record.user_id,
      NULL,
      'matching_queue',
      'GUARDIAN',
      'WARNING'
    );
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_state_transitions',
    'corrections', corrections,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_state_transitions IS 'GUARDIAN: Enforces proper state transitions. Corrects invalid states (vote_active without match, match without vote_active).';

-- ============================================================================
-- GUARDIAN 3: Fairness Enforcer
-- ============================================================================
-- Ensures: "Fair matching for all users. Everyone eventually reaches front of queue."
-- Monitors: Fairness scores, wait times, skip counts
-- Action: Boosts fairness scores for long-waiting users, resets skip counts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_fairness()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  boosted_users INTEGER := 0;
  reset_skips INTEGER := 0;
  user_record RECORD;
  avg_wait_time INTEGER;
  fairness_boost DECIMAL;
BEGIN
  -- Calculate average wait time for context
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER), 0)::INTEGER
  INTO avg_wait_time
  FROM matching_queue
  WHERE status IN ('spin_active', 'queue_waiting');
  
  -- Boost fairness for users waiting longer than average
  FOR user_record IN
    SELECT 
      mq.user_id,
      mq.joined_at,
      mq.fairness_score,
      mq.skip_count,
      EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER AS wait_seconds
    FROM matching_queue mq
    WHERE mq.status IN ('spin_active', 'queue_waiting')
      AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER > GREATEST(avg_wait_time, 20)
    ORDER BY mq.joined_at ASC
    LIMIT 100
  LOOP
    -- Calculate fairness boost based on wait time
    -- Formula: (wait_seconds - avg_wait_time) / 10, minimum 1.0
    fairness_boost := GREATEST(1.0, (user_record.wait_seconds - avg_wait_time) / 10.0);
    
    -- Update fairness score
    UPDATE matching_queue
    SET fairness_score = COALESCE(fairness_score, 0) + fairness_boost,
        updated_at = NOW()
    WHERE user_id = user_record.user_id;
    
    boosted_users := boosted_users + 1;
    
    -- Reset skip_count if user has been skipped too many times (>5) and waited long
    IF user_record.skip_count > 5 AND user_record.wait_seconds > 30 THEN
      UPDATE matching_queue
      SET skip_count = 0,
          updated_at = NOW()
      WHERE user_id = user_record.user_id;
      
      reset_skips := reset_skips + 1;
    END IF;
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_fairness',
    'boosted_users', boosted_users,
    'reset_skips', reset_skips,
    'avg_wait_time_seconds', avg_wait_time,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_fairness IS 'GUARDIAN: Enforces fairness. Boosts fairness scores for long-waiting users, resets skip counts.';

-- ============================================================================
-- GUARDIAN 4: Duplicate Prevention Enforcer
-- ============================================================================
-- Ensures: "No user can appear for more than one person at the same time."
-- Monitors: Users in multiple matches, users in queue with multiple pending matches
-- Action: Resolves conflicts, ensures one match per user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_prevent_duplicates()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  conflicts_found INTEGER := 0;
  conflicts_resolved INTEGER := 0;
  conflict_record RECORD;
  match_to_keep UUID;
  match_to_remove UUID;
BEGIN
  -- Find users with multiple pending matches (should only have one)
  FOR conflict_record IN
    SELECT 
      user_id,
      COUNT(*) as match_count,
      array_agg(match_id) as match_ids
    FROM (
      SELECT m.user1_id as user_id, m.id as match_id
      FROM matches m
      WHERE m.status = 'pending'
      UNION ALL
      SELECT m.user2_id as user_id, m.id as match_id
      FROM matches m
      WHERE m.status = 'pending'
    ) all_matches
    GROUP BY user_id
    HAVING COUNT(*) > 1
  LOOP
    conflicts_found := conflicts_found + 1;
    
    -- Keep the most recent match, remove others
    SELECT id INTO match_to_keep
    FROM matches
    WHERE id = ANY(conflict_record.match_ids)
      AND status = 'pending'
    ORDER BY matched_at DESC
    LIMIT 1;
    
    -- Remove other matches for this user
    FOR match_to_remove IN
      SELECT id
      FROM matches
      WHERE id = ANY(conflict_record.match_ids)
        AND id != match_to_keep
        AND status = 'pending'
    LOOP
      -- Delete the duplicate match
      DELETE FROM matches WHERE id = match_to_remove;
      
      -- Reset users back to spin_active if they were in vote_active
      UPDATE matching_queue
      SET status = 'spin_active',
          updated_at = NOW()
      WHERE user_id IN (
        SELECT user1_id FROM matches WHERE id = match_to_remove
        UNION
        SELECT user2_id FROM matches WHERE id = match_to_remove
      )
        AND status = 'vote_active';
      
      conflicts_resolved := conflicts_resolved + 1;
      
      PERFORM spark_log_event(
        'guardian_action',
        'duplicate_resolved',
        'Guardian removed duplicate match',
        jsonb_build_object(
          'user_id', conflict_record.user_id,
          'match_removed', match_to_remove,
          'match_kept', match_to_keep,
          'guardian', 'prevent_duplicates'
        ),
        conflict_record.user_id,
        NULL,
        'matches',
        'GUARDIAN',
        'WARNING'
      );
    END LOOP;
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'prevent_duplicates',
    'conflicts_found', conflicts_found,
    'conflicts_resolved', conflicts_resolved,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_prevent_duplicates IS 'GUARDIAN: Prevents duplicates. Ensures no user appears for more than one person at the same time.';

-- ============================================================================
-- GUARDIAN 5: Voting Behavior Enforcer
-- ============================================================================
-- Ensures: Proper voting behavior with priority boosts for yes voters
-- Monitors: Vote outcomes, priority boosts, respin handling
-- Action: Applies priority boosts, ensures proper queue re-entry
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_voting_behavior()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  processed_votes INTEGER := 0;
  boosts_applied INTEGER := 0;
  vote_record RECORD;
  match_record RECORD;
  yes_voter_id UUID;
  respin_voter_id UUID;
BEGIN
  -- Find completed matches (status != 'pending') that need voting behavior enforcement
  -- This handles cases where voting completed but boosts weren't applied
  FOR match_record IN
    SELECT m.id, m.user1_id, m.user2_id, m.status
    FROM matches m
    WHERE m.status IN ('both_yes', 'one_yes_one_pass', 'both_pass')
      AND m.status != 'pending'
      AND NOT EXISTS (
        -- Check if boosts were already applied (via fairness_score increase or log)
        SELECT 1 FROM spark_event_log sel
        WHERE sel.event_type = 'guardian_action'
          AND sel.event_category = 'voting_boost_applied'
          AND sel.related_table = 'matches'
          AND (sel.event_data->>'match_id')::uuid = m.id
      )
    ORDER BY m.matched_at DESC
    LIMIT 50
  LOOP
    -- Get votes for this match
    SELECT 
      MAX(CASE WHEN vote_type = 'yes' THEN voter_id END) as yes_voter,
      MAX(CASE WHEN vote_type = 'pass' THEN voter_id END) as respin_voter
    INTO yes_voter_id, respin_voter_id
    FROM votes
    WHERE match_id = match_record.id;
    
    -- Apply priority boost to yes voter (if one voted yes and other voted respin)
    IF yes_voter_id IS NOT NULL AND respin_voter_id IS NOT NULL THEN
      -- Boost fairness score for yes voter
      UPDATE matching_queue
      SET fairness_score = COALESCE(fairness_score, 0) + 10.0, -- Priority boost
          updated_at = NOW()
      WHERE user_id = yes_voter_id
        AND status IN ('spin_active', 'queue_waiting');
      
      boosts_applied := boosts_applied + 1;
      
      PERFORM spark_log_event(
        'guardian_action',
        'voting_boost_applied',
        'Guardian applied priority boost to yes voter',
        jsonb_build_object(
          'match_id', match_record.id,
          'yes_voter_id', yes_voter_id,
          'respin_voter_id', respin_voter_id,
          'boost_amount', 10.0,
          'guardian', 'enforce_voting_behavior'
        ),
        yes_voter_id,
        respin_voter_id,
        'matches',
        'GUARDIAN',
        'INFO'
      );
    END IF;
    
    processed_votes := processed_votes + 1;
  END LOOP;
  
  -- Ensure users who voted respin are back in queue (not stuck)
  FOR vote_record IN
    SELECT DISTINCT v.voter_id, v.match_id
    FROM votes v
    INNER JOIN matches m ON m.id = v.match_id
    WHERE v.vote_type = 'pass'
      AND m.status != 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM matching_queue mq
        WHERE mq.user_id = v.voter_id
          AND mq.status IN ('spin_active', 'queue_waiting')
      )
  LOOP
    -- Re-enter user into queue if they voted respin but aren't in queue
    INSERT INTO matching_queue (user_id, status, joined_at, updated_at, fairness_score, skip_count)
    VALUES (vote_record.voter_id, 'spin_active', NOW(), NOW(), 0, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET status = 'spin_active',
        joined_at = NOW(),
        updated_at = NOW();
    
    PERFORM spark_log_event(
      'guardian_action',
      'queue_reentry',
      'Guardian re-entered user into queue after respin',
      jsonb_build_object(
        'user_id', vote_record.voter_id,
        'match_id', vote_record.match_id,
        'guardian', 'enforce_voting_behavior'
      ),
      vote_record.voter_id,
      NULL,
      'matching_queue',
      'GUARDIAN',
      'INFO'
    );
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_voting_behavior',
    'processed_votes', processed_votes,
    'boosts_applied', boosts_applied,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_voting_behavior IS 'GUARDIAN: Enforces voting behavior. Applies priority boosts to yes voters, ensures proper queue re-entry after respin.';

-- ============================================================================
-- GUARDIAN 6: Online Status Enforcer (CRITICAL)
-- ============================================================================
-- Ensures: Users can only match with online users
-- Monitors: Pending matches where one or both users are offline
-- Action: Breaks invalid matches, resets users back to spin_active
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_online_status()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  invalid_matches INTEGER := 0;
  broken_matches INTEGER := 0;
  match_record RECORD;
  user1_online BOOLEAN;
  user2_online BOOLEAN;
BEGIN
  -- Find pending matches where one or both users are offline
  FOR match_record IN
    SELECT 
      m.id as match_id,
      m.user1_id,
      m.user2_id,
      m.status,
      p1.is_online as user1_online,
      p2.is_online as user2_online
    FROM matches m
    INNER JOIN profiles p1 ON p1.id = m.user1_id
    INNER JOIN profiles p2 ON p2.id = m.user2_id
    WHERE m.status = 'pending'
      AND (p1.is_online = FALSE OR p2.is_online = FALSE)
    ORDER BY m.matched_at DESC
    LIMIT 100
  LOOP
    invalid_matches := invalid_matches + 1;
    
    -- Break the invalid match by deleting it
    DELETE FROM matches WHERE id = match_record.match_id;
    
    -- Reset both users back to spin_active if they're in vote_active
    UPDATE matching_queue
    SET status = 'spin_active',
        updated_at = NOW()
    WHERE user_id IN (match_record.user1_id, match_record.user2_id)
      AND status = 'vote_active';
    
    broken_matches := broken_matches + 1;
    
    -- Log the action
    PERFORM spark_log_event(
      'guardian_action',
      'broken_offline_match',
      'Guardian broke match with offline user(s)',
      jsonb_build_object(
        'match_id', match_record.match_id,
        'user1_id', match_record.user1_id,
        'user2_id', match_record.user2_id,
        'user1_online', match_record.user1_online,
        'user2_online', match_record.user2_online,
        'guardian', 'enforce_online_status'
      ),
      match_record.user1_id,
      match_record.user2_id,
      'matches',
      'GUARDIAN',
      'WARNING'
    );
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_online_status',
    'invalid_matches_found', invalid_matches,
    'broken_matches', broken_matches,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_online_status IS 'GUARDIAN: Enforces online status. Breaks matches where one or both users are offline.';

-- ============================================================================
-- GUARDIAN 7: Preference Expansion Enforcer
-- ============================================================================
-- Ensures: "Preferences expand only when needed and in small steps."
-- Monitors: Users waiting >60 seconds with no match
-- Action: Triggers preference expansion via tier system
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_enforce_preference_expansion()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  expanded_users INTEGER := 0;
  user_record RECORD;
BEGIN
  -- Find users waiting >60 seconds (should trigger Tier 3 expansion)
  FOR user_record IN
    SELECT 
      mq.user_id,
      mq.joined_at,
      EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER AS wait_seconds
    FROM matching_queue mq
    WHERE mq.status IN ('spin_active', 'queue_waiting')
      AND EXTRACT(EPOCH FROM (NOW() - mq.joined_at))::INTEGER > 60
    ORDER BY mq.joined_at ASC
    LIMIT 50
  LOOP
    -- Force matching attempt with Tier 3 (guaranteed match with expanded preferences)
    -- The process_matching_v2 function already handles tier expansion, but we ensure it's called
    BEGIN
      PERFORM spark_process_matching(user_record.user_id);
      
      expanded_users := expanded_users + 1;
      
      PERFORM spark_log_event(
        'guardian_action',
        'preference_expansion',
        'Guardian triggered preference expansion for long-waiting user',
        jsonb_build_object(
          'user_id', user_record.user_id,
          'wait_seconds', user_record.wait_seconds,
          'guardian', 'enforce_preference_expansion'
        ),
        user_record.user_id,
        NULL,
        'matching_queue',
        'GUARDIAN',
        'INFO'
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue
        PERFORM spark_log_error(
          'function',
          SQLERRM,
          SQLSTATE,
          jsonb_build_object(
            'function', 'guardian_enforce_preference_expansion',
            'user_id', user_record.user_id,
            'wait_seconds', user_record.wait_seconds
          ),
          'guardian_enforce_preference_expansion',
          user_record.user_id,
          0,
          'ERROR'
        );
    END;
  END LOOP;
  
  result := jsonb_build_object(
    'guardian', 'enforce_preference_expansion',
    'expanded_users', expanded_users,
    'timestamp', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_enforce_preference_expansion IS 'GUARDIAN: Enforces preference expansion. Triggers expansion for users waiting >60 seconds.';

-- ============================================================================
-- GUARDIAN 8: Master Guardian Orchestrator
-- ============================================================================
-- Runs all guardians in optimal order to ensure spinning logic compliance
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardian_orchestrator()
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  guardian_results JSONB := '{}'::JSONB;
BEGIN
  -- Run all guardians in optimal order
  -- 1. Enforce online status FIRST (CRITICAL - prevents invalid matches)
  SELECT guardian_enforce_online_status() INTO guardian_results;
  result := jsonb_insert(result, '{enforce_online_status}', guardian_results);
  
  -- 2. Prevent duplicates (critical for data integrity)
  SELECT guardian_prevent_duplicates() INTO guardian_results;
  result := jsonb_insert(result, '{prevent_duplicates}', guardian_results);
  
  -- 3. Enforce state transitions (fix invalid states)
  SELECT guardian_enforce_state_transitions() INTO guardian_results;
  result := jsonb_insert(result, '{enforce_state_transitions}', guardian_results);
  
  -- 4. Enforce fairness (boost long-waiting users)
  SELECT guardian_enforce_fairness() INTO guardian_results;
  result := jsonb_insert(result, '{enforce_fairness}', guardian_results);
  
  -- 5. Enforce preference expansion (for long-waiting users)
  SELECT guardian_enforce_preference_expansion() INTO guardian_results;
  result := jsonb_insert(result, '{enforce_preference_expansion}', guardian_results);
  
  -- 6. Ensure no failed spins (force matches for long-waiting users)
  SELECT guardian_ensure_no_failed_spins() INTO guardian_results;
  result := jsonb_insert(result, '{ensure_no_failed_spins}', guardian_results);
  
  -- 7. Enforce voting behavior (apply boosts, re-enter users)
  SELECT guardian_enforce_voting_behavior() INTO guardian_results;
  result := jsonb_insert(result, '{enforce_voting_behavior}', guardian_results);
  
  -- Add summary
  result := jsonb_insert(result, '{summary}', jsonb_build_object(
    'timestamp', NOW(),
    'guardians_run', 7,
    'status', 'complete'
  ));
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.guardian_orchestrator IS 'MASTER GUARDIAN: Orchestrates all guardians to ensure spinning logic compliance. Runs all guardians in optimal order.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.guardian_ensure_no_failed_spins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_state_transitions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_fairness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_prevent_duplicates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_voting_behavior() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_preference_expansion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_enforce_online_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_orchestrator() TO authenticated;

-- ============================================================================
-- SCHEDULE GUARDIANS (via pg_cron)
-- ============================================================================

DO $$
BEGIN
  -- Schedule master guardian orchestrator to run every 10 seconds
  -- This ensures continuous monitoring and enforcement
  PERFORM cron.schedule(
    'guardian-orchestrator',
    '*/10 * * * * *', -- Every 10 seconds
    'SELECT guardian_orchestrator();'
  );
  
  RAISE NOTICE 'Guardian orchestrator scheduled successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'pg_cron extension not available. Use alternative method (Next.js API route or external cron).';
    RAISE WARNING 'Error: %', SQLERRM;
END $$;

