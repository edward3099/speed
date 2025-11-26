-- Check recent matching activity
SELECT event_type, metadata, severity, timestamp
FROM debug_logs
WHERE timestamp > NOW() - INTERVAL '2 minutes'
  AND (event_type LIKE 'matching%' OR event_type LIKE 'find_best_match%' OR event_type IN ('matching_stuck', 'users_waiting_too_long'))
ORDER BY timestamp DESC
LIMIT 30;
