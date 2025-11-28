-- Diagnose why users are filtered out
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online as profile_online,
  u.cooldown_until,
  CASE WHEN u.cooldown_until IS NOT NULL AND u.cooldown_until > NOW() THEN 'IN_COOLDOWN' ELSE 'NOT_IN_COOLDOWN' END as cooldown_status,
  us.user_id as has_user_status,
  us.state as user_status_state,
  us.online_status as user_status_online,
  CASE 
    WHEN us.user_id IS NULL THEN '❌ MISSING user_status'
    WHEN u.online = FALSE THEN '❌ profile.online = FALSE'
    WHEN u.cooldown_until IS NOT NULL AND u.cooldown_until > NOW() THEN '❌ IN COOLDOWN'
    WHEN us.state NOT IN ('spin_active', 'queue_waiting') THEN '❌ WRONG STATE: ' || us.state
    WHEN us.online_status = FALSE THEN '❌ user_status.online = FALSE'
    ELSE '✅ PASSES ALL FILTERS'
  END as filter_status,
  EXTRACT(EPOCH FROM (NOW() - q.spin_started_at))::INTEGER as wait_seconds
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;
