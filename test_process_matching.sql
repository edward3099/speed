-- Test process_matching and see what happens
DO $$
DECLARE
  result INTEGER;
BEGIN
  result := process_matching();
  RAISE NOTICE 'process_matching returned: %', result;
END $$;

-- Check queue after
SELECT 
  q.user_id,
  u.name,
  us.state
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
LEFT JOIN user_status us ON us.user_id = q.user_id;

-- Check matches
SELECT 
  id,
  status,
  user1_id,
  user2_id
FROM matches
WHERE status IN ('pending', 'vote_active')
ORDER BY matched_at DESC NULLS LAST;
