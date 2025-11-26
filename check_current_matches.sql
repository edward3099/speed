-- Check current matches and user statuses
SELECT 
  m.id as match_id,
  m.status as match_status,
  m.user1_id,
  m.user2_id,
  u1.name as user1_name,
  u2.name as user2_name,
  us1.state as user1_state,
  us2.state as user2_state,
  us1.online_status as user1_online,
  us2.online_status as user2_online,
  q1.user_id IS NOT NULL as user1_in_queue,
  q2.user_id IS NOT NULL as user2_in_queue
FROM matches m
LEFT JOIN profiles u1 ON u1.id = m.user1_id
LEFT JOIN profiles u2 ON u2.id = m.user2_id
LEFT JOIN user_status us1 ON us1.user_id = m.user1_id
LEFT JOIN user_status us2 ON us2.user_id = m.user2_id
LEFT JOIN queue q1 ON q1.user_id = m.user1_id
LEFT JOIN queue q2 ON q2.user_id = m.user2_id
WHERE m.status IN ('pending', 'vote_active')
ORDER BY m.matched_at DESC NULLS LAST
LIMIT 10;
