-- Comprehensive diagnosis of matching system

-- 1. Check background job
SELECT 
  jobid, 
  jobname, 
  schedule, 
  command, 
  active,
  nodename
FROM cron.job 
WHERE jobname = 'matching-processor';

-- 2. Check ALL queue entries with full details
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online as profile_online,
  u.cooldown_until,
  us.user_id as has_user_status,
  us.state,
  us.online_status,
  q.fairness_score,
  q.preference_stage,
  q.spin_started_at,
  CASE 
    WHEN us.user_id IS NULL THEN 'MISSING user_status'
    WHEN u.online = FALSE THEN 'profile.online = FALSE'
    WHEN u.cooldown_until IS NOT NULL AND u.cooldown_until > NOW() THEN 'IN COOLDOWN'
    WHEN us.state NOT IN ('spin_active', 'queue_waiting') THEN 'WRONG STATE: ' || us.state
    WHEN us.online_status = FALSE THEN 'user_status.online = FALSE'
    ELSE '✅ PASSES ALL FILTERS'
  END as status
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- 3. Check for existing matches that might block matching
SELECT 
  id,
  status,
  user1_id,
  user2_id,
  matched_at
FROM matches
WHERE status IN ('pending', 'vote_active')
ORDER BY matched_at DESC NULLS LAST
LIMIT 5;

-- 4. Check user preferences for queue users
SELECT 
  up.user_id,
  u.name,
  u.gender,
  up.gender_preference
FROM user_preferences up
INNER JOIN profiles u ON u.id = up.user_id
WHERE up.user_id IN (SELECT user_id FROM queue);
