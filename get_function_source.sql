-- Get the actual function source code from the database
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_pair_atomic'
  AND n.nspname = 'public';
