-- Check queue status
SELECT 
  q.user_id,
  u.name,
  us.state
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id;

-- Check if there are other users who can be matched
SELECT COUNT(*) as users_in_queue FROM queue;
