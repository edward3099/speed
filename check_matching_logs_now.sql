-- Check recent matching logs and current queue state
SELECT 
  event_type,
  metadata,
  severity,
  timestamp
FROM debug_logs
WHERE event_type LIKE 'matching%' 
   OR event_type LIKE 'find_best_match%'
   OR event_type IN ('matching_stuck', 'users_waiting_too_long', 'background_job_inactive')
ORDER BY timestamp DESC
LIMIT 30;

-- Check current queue
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online,
  us.state,
  us.online_status,
  q.fairness_score,
  q.preference_stage,
  EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_seconds
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- Check user preferences for queue users
SELECT 
  up.user_id,
  u.name,
  u.gender,
  up.gender_preference
FROM user_preferences up
INNER JOIN profiles u ON u.id = up.user_id
WHERE up.user_id IN (SELECT user_id FROM queue);
