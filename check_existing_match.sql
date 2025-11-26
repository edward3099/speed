-- Check existing matches for these users
SELECT 
  id,
  status,
  user1_id,
  user2_id,
  vote_started_at,
  vote_expires_at,
  matched_at
FROM matches
WHERE (user1_id = '21b22057-35c0-45ba-91d4-9a86bec61372' OR user2_id = '21b22057-35c0-45ba-91d4-9a86bec61372')
  OR (user1_id = '644e5494-f7e4-4d69-94b3-5f05a4bf8d87' OR user2_id = '644e5494-f7e4-4d69-94b3-5f05a4bf8d87')
ORDER BY matched_at DESC NULLS LAST;

-- Check users in queue
SELECT 
  q.user_id,
  u.name,
  u.gender,
  us.state
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id;
