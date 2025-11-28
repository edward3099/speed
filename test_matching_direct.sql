-- Test matching directly to see the actual error
DO $$
DECLARE
  test_user UUID;
  test_candidate UUID;
  result BIGINT;
BEGIN
  -- Get first user in queue
  SELECT user_id INTO test_user FROM queue LIMIT 1;
  
  IF test_user IS NULL THEN
    RAISE NOTICE 'No users in queue';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing with user: %', test_user;
  
  -- Get a candidate
  SELECT find_best_match(test_user, 0) INTO test_candidate;
  
  IF test_candidate IS NULL THEN
    RAISE NOTICE 'No candidate found';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found candidate: %', test_candidate;
  
  -- Try to create pair
  SELECT create_pair_atomic(test_user, test_candidate) INTO result;
  
  IF result IS NULL THEN
    RAISE NOTICE 'create_pair_atomic returned NULL';
  ELSE
    RAISE NOTICE 'create_pair_atomic returned: % (type: %)', result, pg_typeof(result);
  END IF;
END $$;
