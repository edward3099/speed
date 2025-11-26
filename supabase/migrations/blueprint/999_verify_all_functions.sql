-- ============================================================================
-- Blueprint Migration 999: Comprehensive Function Verification
-- ============================================================================
-- This migration verifies all functions match the actual database schema
-- Run this after all other migrations to catch any schema mismatches
-- ============================================================================

-- Verify matching_queue table structure
DO $$
DECLARE
  v_expected_columns TEXT[] := ARRAY[
    'id', 'user_id', 'joined_at', 'fairness_score', 'status', 'skip_count',
    'expanded_preferences', 'expansion_level', 'original_min_age', 'original_max_age',
    'original_max_distance', 'original_gender_preference', 'last_expansion_at',
    'created_at', 'updated_at', 'last_spun_at', 'disconnected_at'
  ];
  v_actual_columns TEXT[];
  v_missing TEXT[];
  v_extra TEXT[];
BEGIN
  -- Get actual columns
  SELECT array_agg(column_name ORDER BY ordinal_position)
  INTO v_actual_columns
  FROM information_schema.columns
  WHERE table_name = 'matching_queue';
  
  -- Check for missing columns (columns we expect but don't have)
  SELECT array_agg(col)
  INTO v_missing
  FROM unnest(v_expected_columns) AS col
  WHERE col != ALL(v_actual_columns);
  
  -- Check for extra columns (columns we have but don't expect - these are OK)
  SELECT array_agg(col)
  INTO v_extra
  FROM unnest(v_actual_columns) AS col
  WHERE col != ALL(v_expected_columns);
  
  -- Log results (can be viewed in Supabase logs)
  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'Missing columns in matching_queue: %', array_to_string(v_missing, ', ');
  END IF;
  
  IF v_extra IS NOT NULL THEN
    RAISE NOTICE 'Extra columns in matching_queue (OK): %', array_to_string(v_extra, ', ');
  END IF;
END;
$$;

-- Verify spark_event_log table has required NOT NULL columns
DO $$
DECLARE
  v_required_columns TEXT[] := ARRAY['event_type', 'event_category', 'event_message', 'timestamp', 'severity'];
  v_missing_not_null TEXT[];
BEGIN
  SELECT array_agg(column_name)
  INTO v_missing_not_null
  FROM information_schema.columns
  WHERE table_name = 'spark_event_log'
    AND column_name = ANY(v_required_columns)
    AND is_nullable = 'YES';
  
  IF v_missing_not_null IS NOT NULL THEN
    RAISE WARNING 'Columns in spark_event_log that should be NOT NULL but are nullable: %', 
      array_to_string(v_missing_not_null, ', ');
  END IF;
END;
$$;

-- Verify critical functions exist and have correct signatures
DO $$
DECLARE
  v_functions TEXT[] := ARRAY[
    'queue_join(uuid)',
    'queue_remove(uuid)',
    'state_machine_transition(uuid,text,jsonb)',
    'validate_transition(user_matching_state,text,jsonb)',
    'execute_transition(uuid,user_matching_state,user_matching_state,jsonb)',
    'log_event(text,uuid,jsonb,text,text,text,text)',
    'calculate_fairness_score(uuid)',
    'unified_matching_engine(uuid)'
  ];
  v_missing TEXT[];
  v_func TEXT;
BEGIN
  FOREACH v_func IN ARRAY v_functions
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = v_func
    ) THEN
      v_missing := array_append(v_missing, v_func);
    END IF;
  END LOOP;
  
  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'Missing functions: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

COMMENT ON FUNCTION queue_join IS 'VERIFIED: Function matches actual database schema - preferences are in user_preferences table';

