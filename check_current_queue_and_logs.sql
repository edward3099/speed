-- Check current queue status
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
LEFT JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- Check user preferences
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
WHERE up.user_id IN (SELECT user_id FROM queue);

-- Show recent matching logs
SELECT 
  event_type,
  metadata,
  severity,
  timestamp
FROM debug_logs
WHERE event_type LIKE 'matching%' OR event_type LIKE 'find_best_match%'
ORDER BY timestamp DESC
LIMIT 30;
