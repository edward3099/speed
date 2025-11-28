-- Fix existing matches that have vote_started_at but missing vote_expires_at
UPDATE matches
SET vote_expires_at = vote_started_at + INTERVAL '30 seconds',
    vote_window_expires_at = vote_started_at + INTERVAL '30 seconds'
WHERE status = 'vote_active'
  AND vote_started_at IS NOT NULL
  AND (vote_expires_at IS NULL OR vote_window_expires_at IS NULL);

-- Show updated matches
SELECT 
  id,
  status,
  vote_started_at,
  vote_expires_at,
  vote_window_expires_at,
  EXTRACT(EPOCH FROM (vote_expires_at - NOW()))::INTEGER as remaining_seconds
FROM matches
WHERE status = 'vote_active'
ORDER BY vote_started_at DESC
LIMIT 5;
