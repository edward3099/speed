-- Check matching system status
-- 1. Check if background job is scheduled
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
  q.preference_stage,
  q.spin_started_at
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- 3. Check user preferences for compatibility
SELECT 
  q1.user_id as user1_id,
  u1.name as user1_name,
  u1.gender as user1_gender,
  up1.gender_preference as user1_wants,
  q2.user_id as user2_id,
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
LEFT JOIN user_preferences up1 ON up1.user_id = q1.user_id
LEFT JOIN user_preferences up2 ON up2.user_id = q2.user_id;

-- 4. Manually test process_matching
SELECT process_matching() as matched_count;

-- 5. Check recent matches
SELECT 
  id,
  status,
  user1_id,
  user2_id,
  vote_started_at,
  vote_expires_at
FROM matches
ORDER BY matched_at DESC NULLS LAST
LIMIT 5;
