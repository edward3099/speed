-- Quick diagnostic to check why matching isn't working

-- 1. Check if background job is scheduled and active
SELECT 
  jobid, 
  jobname, 
  schedule, 
  command, 
  active,
  nodename
FROM cron.job 
WHERE jobname = 'matching-processor';

-- 2. Check users currently in queue
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online,
  us.state,
  us.online_status,
  q.fairness_score,
  q.preference_stage
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- 3. Check user preferences for compatibility
SELECT 
  up1.user_id as user1_id,
  u1.name as user1_name,
  u1.gender as user1_gender,
  up1.gender_preference as user1_wants,
  up2.user_id as user2_id,
  u2.name as user2_name,
  u2.gender as user2_gender,
  up2.gender_preference as user2_wants,
  CASE 
    WHEN u1.gender != u2.gender 
      AND up1.gender_preference = u2.gender 
      AND up2.gender_preference = u1.gender 
    THEN 'COMPATIBLE'
    ELSE 'NOT COMPATIBLE'
  END as compatibility
FROM queue q1
INNER JOIN queue q2 ON q1.user_id < q2.user_id
INNER JOIN profiles u1 ON u1.id = q1.user_id
INNER JOIN profiles u2 ON u2.id = q2.user_id
INNER JOIN user_preferences up1 ON up1.user_id = q1.user_id
INNER JOIN user_preferences up2 ON up2.user_id = q2.user_id;

-- 4. Test find_best_match for first user in queue
DO $$
DECLARE
  test_user_id UUID;
  candidate_id UUID;
  result_text TEXT;
BEGIN
  SELECT user_id INTO test_user_id FROM queue LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE 'No users in queue';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing find_best_match for user: %', test_user_id;
  
  candidate_id := find_best_match(test_user_id, 0);
  
  IF candidate_id IS NULL THEN
    RAISE NOTICE 'find_best_match returned NULL';
  ELSE
    RAISE NOTICE 'find_best_match found candidate: %', candidate_id;
  END IF;
END $$;

-- 5. Manually test process_matching
SELECT process_matching() as matched_count;

-- 6. Check if any matches exist
SELECT COUNT(*) as total_matches FROM matches WHERE status IN ('pending', 'vote_active');
