-- Diagnostic query to test matching logic
-- Run this to see why matches aren't being created

-- 1. Check if users are in queue
SELECT 
  q.user_id,
  u.name,
  u.gender,
  u.online,
  u.cooldown_until,
  us.state,
  us.online_status,
  q.fairness_score,
  q.preference_stage
FROM queue q
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id
ORDER BY q.fairness_score DESC;

-- 2. Check user preferences
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

-- 3. Test find_best_match for first user in queue
DO $$
DECLARE
  test_user_id UUID;
  candidate_id UUID;
BEGIN
  SELECT user_id INTO test_user_id FROM queue LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE 'No users in queue';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing find_best_match for user: %', test_user_id;
  
  candidate_id := find_best_match(test_user_id, 0);
  
  IF candidate_id IS NULL THEN
    RAISE NOTICE 'find_best_match returned NULL - no candidate found';
  ELSE
    RAISE NOTICE 'find_best_match found candidate: %', candidate_id;
  END IF;
END $$;

-- 4. Test process_matching
SELECT process_matching() as matched_count;

-- 5. Check if matches were created
SELECT 
  m.id,
  m.user1_id,
  m.user2_id,
  m.status,
  u1.name as user1_name,
  u2.name as user2_name
FROM matches m
INNER JOIN profiles u1 ON u1.id = m.user1_id
INNER JOIN profiles u2 ON u2.id = m.user2_id
WHERE m.status IN ('pending', 'vote_active')
ORDER BY m.id DESC
LIMIT 10;
