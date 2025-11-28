-- Check if critical error detection is working
SELECT 
  event_type,
  metadata,
  severity,
  timestamp
FROM debug_logs
WHERE event_type IN ('matching_stuck', 'users_waiting_too_long', 'background_job_inactive')
ORDER BY timestamp DESC
LIMIT 10;

-- Check if the background job is scheduled
SELECT 
  jobid, 
  jobname, 
  schedule, 
  active
FROM cron.job 
WHERE jobname IN ('matching-processor', 'critical-error-detector');
