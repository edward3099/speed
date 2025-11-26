-- ============================================================================
-- Helper Function: Execute SQL (for migration application)
-- ============================================================================
-- This is a temporary helper to apply migrations
-- WARNING: Only use with service role key, remove after migrations are applied
-- ============================================================================

-- Create a function that can execute SQL (for migration purposes only)
CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Execute the SQL
  EXECUTE sql_text;
  RETURN 'Success';
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$;

COMMENT ON FUNCTION exec_sql IS 'TEMPORARY: Helper function to execute SQL for migrations - REMOVE AFTER MIGRATIONS ARE APPLIED';
