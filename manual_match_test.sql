-- Manually trigger matching and see detailed logs
SELECT process_matching() as matched_count;

-- Immediately check what happened
SELECT 
  event_type,
  metadata,
  severity,
  timestamp
FROM debug_logs
WHERE timestamp > NOW() - INTERVAL '10 seconds'
ORDER BY timestamp DESC
LIMIT 20;
