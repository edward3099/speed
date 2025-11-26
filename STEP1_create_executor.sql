-- STEP 1: Create SQL executor function (apply this first)
-- This small SQL file creates a helper function that allows executing SQL via RPC

CREATE OR REPLACE FUNCTION exec_sql(p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'SQL executed successfully';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error: ' || SQLERRM;
END;
$$;

COMMENT ON FUNCTION exec_sql IS 'Helper function to execute SQL dynamically (for migrations)';
