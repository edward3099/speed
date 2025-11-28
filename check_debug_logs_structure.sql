-- Check debug_logs table structure
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'debug_logs'
ORDER BY ordinal_position;
