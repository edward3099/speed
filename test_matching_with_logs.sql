-- Test matching and see detailed logs
SELECT process_matching() as matched_count;

-- Show all recent logs
SELECT 
  event_type,
  metadata,
  severity,
  timestamp
FROM debug_logs
WHERE timestamp > NOW() - INTERVAL '2 minutes'
ORDER BY timestamp DESC
LIMIT 50;
