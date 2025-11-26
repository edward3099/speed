-- Diagnostic queries to check why matching isn't working

-- 1. Check if background jobs are scheduled
SELECT 
  jobid, 
  jobname, 
  schedule, 
  command, 
  active,
  nodename,
  nodeport
FROM cron.job 
WHERE jobname IN ('guardian-job', 'matching-processor')
ORDER BY jobname;

-- 2. Check users in queue
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online,
  u.cooldown_until,
  us.state,
  us.online_status,
  q.fairness_score,
  q.preference_stage,
  q.spin_started_at
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- 3. Check user preferences for users in queue
SELECT 
  up.user_id,
  u.name,
  u.gender,
  up.gender_preference,
  up.min_age,
  up.max_age,
  up.max_distance
FROM user_preferences up
INNER JOIN profiles u ON u.id = up.user_id
WHERE up.user_id IN (SELECT user_id FROM queue)
ORDER BY up.user_id;

-- 4. Test find_best_match for first user in queue
DO $$
DECLARE
  test_user_id UUID;
  candidate_id UUID;
  user_gender TEXT;
BEGIN
  SELECT q.user_id INTO test_user_id FROM queue q LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE 'No users in queue';
    RETURN;
  END IF;
  
  SELECT gender INTO user_gender FROM profiles WHERE id = test_user_id;
  
  RAISE NOTICE 'Testing find_best_match for user: % (gender: %)', test_user_id, user_gender;
  
  candidate_id := find_best_match(test_user_id, 0);
  
  IF candidate_id IS NULL THEN
    RAISE NOTICE 'find_best_match returned NULL - no candidate found';
    RAISE NOTICE 'Possible reasons:';
    RAISE NOTICE '  - No compatible users in queue';
    RAISE NOTICE '  - Gender preferences mismatch';
    RAISE NOTICE '  - Age/distance preferences too strict';
    RAISE NOTICE '  - Users already matched';
  ELSE
    RAISE NOTICE 'find_best_match found candidate: %', candidate_id;
  END IF;
END $$;

-- 5. Test process_matching manually
SELECT process_matching() as matched_count;

-- 6. Check if any matches were created
SELECT 
  m.id,
  m.user1_id,
  m.user2_id,
  m.status,
  m.created_at,
  u1.name as user1_name,
  u1.gender as user1_gender,
  u2.name as user2_name,
  u2.gender as user2_gender
FROM matches m
INNER JOIN profiles u1 ON u1.id = m.user1_id
INNER JOIN profiles u2 ON u2.id = m.user2_id
WHERE m.status IN ('pending', 'vote_active')
ORDER BY m.id DESC
LIMIT 10;

-- 7. Check for any errors in recent cron job runs
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'matching-processor')
ORDER BY start_time DESC
LIMIT 5;
