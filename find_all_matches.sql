-- Find ALL matches (including cancelled/ended ones)
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

-- Check if there's a unique constraint on matches table
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'matches'::regclass
  AND contype = 'u';
