-- Check if match exists for these users
SELECT 
  id,
  status,
  user1_id,
  user2_id
FROM matches
WHERE user1_id = LEAST('21b22057-35c0-45ba-91d4-9a86bec61372'::UUID, '644e5494-f7e4-4d69-94b3-5f05a4bf8d87'::UUID)
  AND user2_id = GREATEST('21b22057-35c0-45ba-91d4-9a86bec61372'::UUID, '644e5494-f7e4-4d69-94b3-5f05a4bf8d87'::UUID);

-- Check all matches
SELECT 
  id,
  status,
  user1_id,
  user2_id
FROM matches
ORDER BY matched_at DESC NULLS LAST
LIMIT 10;
