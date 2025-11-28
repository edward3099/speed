-- Remove users from queue if they already have active matches
DELETE FROM queue
WHERE user_id IN (
  SELECT DISTINCT user1_id FROM matches WHERE status IN ('pending', 'vote_active')
  UNION
  SELECT DISTINCT user2_id FROM matches WHERE status IN ('pending', 'vote_active')
);

-- Show remaining queue entries
SELECT 
  q.user_id,
  u.name,
  us.state
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id;
