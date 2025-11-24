-- ============================================================================
-- Fix RLS Policy for Matches Table - Allow INSERT via SECURITY DEFINER
-- ============================================================================
-- Problem: handle_vote_insert trigger cannot insert into matches table
-- because there's no INSERT policy and the function isn't SECURITY DEFINER
-- Solution: Make handle_vote_insert SECURITY DEFINER to bypass RLS
-- ============================================================================

-- Make handle_vote_insert SECURITY DEFINER so it can bypass RLS when inserting matches
CREATE OR REPLACE FUNCTION public.handle_vote_insert()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER -- Run with creator's privileges to bypass RLS
AS $$
DECLARE
  mutual_match BOOLEAN;
  v_user1_id UUID; -- Renamed to avoid ambiguity
  v_user2_id UUID; -- Renamed to avoid ambiguity
BEGIN
  -- Only process 'yes' votes
  IF NEW.vote_type != 'yes' THEN
    RETURN NEW;
  END IF;

  -- Check for mutual match
  mutual_match := check_mutual_match(NEW.voter_id, NEW.profile_id);

  IF mutual_match THEN
    -- Ensure consistent ordering (v_user1_id < v_user2_id)
    v_user1_id := LEAST(NEW.voter_id, NEW.profile_id);
    v_user2_id := GREATEST(NEW.voter_id, NEW.profile_id);

    -- Create match (with error handling for duplicates)
    -- SECURITY DEFINER allows this to bypass RLS
    INSERT INTO matches (user1_id, user2_id, status)
    VALUES (v_user1_id, v_user2_id, 'pending')
    ON CONFLICT (user1_id, user2_id) DO NOTHING;

    -- Notify both users via Supabase Realtime
    PERFORM pg_notify('match_created', json_build_object(
      'user1_id', v_user1_id,
      'user2_id', v_user2_id,
      'matched_at', NOW()
    )::text);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_vote_insert IS 'Trigger function to create matches when mutual votes occur. Uses SECURITY DEFINER to bypass RLS when inserting matches.';

-- ============================================================================
-- Also ensure check_mutual_match is SECURITY DEFINER if it needs to bypass RLS
-- ============================================================================

-- Check if check_mutual_match exists and update it if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_mutual_match'
  ) THEN
    -- Recreate with SECURITY DEFINER to ensure it can read votes table
    EXECUTE '
    CREATE OR REPLACE FUNCTION public.check_mutual_match(
      p_user1_id UUID,
      p_user2_id UUID
    ) RETURNS BOOLEAN 
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $func$
    BEGIN
      RETURN EXISTS (
        SELECT 1
        FROM votes v1
        INNER JOIN votes v2
          ON v1.voter_id = v2.profile_id
          AND v1.profile_id = v2.voter_id
        WHERE v1.voter_id = p_user1_id
          AND v1.profile_id = p_user2_id
          AND v2.voter_id = p_user2_id
          AND v2.profile_id = p_user1_id
          AND v1.vote_type = ''yes''
          AND v2.vote_type = ''yes''
          AND v1.created_at > NOW() - INTERVAL ''2 minutes''
          AND v2.created_at > NOW() - INTERVAL ''2 minutes''
      );
    END;
    $func$';
  END IF;
END $$;

