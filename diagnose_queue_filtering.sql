-- Diagnose why process_matching sees 0 users but frontend sees users
-- 1. Check ALL users in queue (no filters)
SELECT 
  'ALL queue entries' as check_type,
  COUNT(*) as count
FROM queue;

-- 2. Check queue entries with profiles
SELECT 
  'Queue with profiles' as check_type,
  COUNT(*) as count
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id;

-- 3. Check queue entries with user_status
SELECT 
  'Queue with user_status' as check_type,
  COUNT(*) as count
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id;

-- 4. Check queue entries that pass ALL filters in process_matching
SELECT 
  'Queue passing ALL filters' as check_type,
  COUNT(*) as count
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id
WHERE u.online = TRUE
  AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
  AND us.state IN ('spin_active', 'queue_waiting');

-- 5. Show detailed breakdown
SELECT 
  q.user_id,
  u.name,
  u.online as profile_online,
  u.cooldown_until,
  us.state as user_status_state,
  us.online_status as user_status_online,
  CASE 
    WHEN u.online = FALSE THEN 'profile.online = FALSE'
    WHEN u.cooldown_until IS NOT NULL AND u.cooldown_until > NOW() THEN 'in cooldown'
    WHEN us.state NOT IN ('spin_active', 'queue_waiting') THEN 'wrong state: ' || us.state
    WHEN us.online_status = FALSE THEN 'user_status.online = FALSE'
    ELSE 'PASSES FILTERS'
  END as filter_status
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id;
