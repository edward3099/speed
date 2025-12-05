# Simple Matching System - Setup Guide

This is the **simplest possible matching system** designed for easy debugging.

## Architecture

### Flow
```
User presses "Start Spin"
  ↓
/spin → calls /api/spin → join_queue() SQL function
  ↓
Redirects to /spinning
  ↓
/spinning polls /api/match/status every 2 seconds
  ↓
When matched → redirects to /voting-window?matchId=xxx
  ↓
/voting-window acknowledges match → transitions to vote_window
  ↓
User votes → /api/vote → record_vote_and_resolve()
  ↓
Outcome resolved → redirects to /video-date or /spinning
```

## Database Functions

### 1. `join_queue(p_user_id UUID)`
- Adds user to queue
- Updates state to 'waiting'
- Idempotent (safe to call multiple times)

### 2. `process_matching()`
- **This is the core matching function**
- Finds pairs, creates matches, removes from queue
- Should be called every 5 seconds
- Returns number of matches created

### 3. `acknowledge_match(p_user_id UUID, p_match_id UUID)`
- User acknowledges match
- When both users acknowledge → transitions to 'vote_window'
- Returns vote window expiration time

### 4. `get_user_match_status(p_user_id UUID)`
- Returns current match status for polling
- Returns state and match info

## Setup Instructions

### 1. Apply Migration
```bash
# Apply the migration
supabase migration up
# Or if using Supabase dashboard, run the SQL from:
# supabase/migrations/20250111_simple_matching_system.sql
```

### 2. Set Up Scheduled Function

You need to call `process_matching()` every 5 seconds. Options:

#### Option A: Supabase Cron (Recommended)
```sql
-- Create a cron job to run every 5 seconds
SELECT cron.schedule(
  'process-matching',
  '*/5 * * * * *', -- Every 5 seconds
  $$
  SELECT process_matching();
  $$
);
```

#### Option B: API Route + External Scheduler
Create an API route that calls the function, then use a service like:
- Vercel Cron Jobs
- GitHub Actions (scheduled)
- External cron service

#### Option C: Manual Testing
```sql
-- Test the function manually
SELECT process_matching();
```

### 3. Verify Setup

```sql
-- Check queue
SELECT * FROM queue ORDER BY waiting_since;

-- Check matches
SELECT * FROM matches ORDER BY created_at DESC LIMIT 10;

-- Check user states
SELECT * FROM users_state WHERE state = 'waiting';
```

## Debugging

### Easy Debug Queries

```sql
-- See who's waiting
SELECT 
  q.user_id,
  q.waiting_since,
  q.fairness,
  us.state,
  us.last_active
FROM queue q
INNER JOIN users_state us ON q.user_id = us.user_id
ORDER BY q.waiting_since;

-- See recent matches
SELECT 
  m.match_id,
  m.user1_id,
  m.user2_id,
  m.status,
  m.created_at
FROM matches m
ORDER BY m.created_at DESC
LIMIT 10;

-- Check if matching function is running
SELECT * FROM matching_log 
ORDER BY created_at DESC 
LIMIT 10;

-- Test matching function manually
SELECT process_matching();
```

### Common Issues

1. **No matches being created**
   - Check if `process_matching()` is being called
   - Check queue: `SELECT * FROM queue;`
   - Check user states: `SELECT * FROM users_state WHERE state = 'waiting';`

2. **Users stuck in queue**
   - Check if matching function is running
   - Check if users are online: `last_active > NOW() - INTERVAL '30 seconds'`
   - Check match history (users might have matched before)

3. **Race conditions**
   - This system is designed to avoid race conditions
   - If issues occur, check the matching function logic

## API Routes

- `POST /api/spin` - Join queue
- `GET /api/match/status` - Get match status (for polling)
- `POST /api/match/acknowledge` - Acknowledge match
- `POST /api/vote` - Record vote

## Frontend Pages

- `/spin` - Entry point, "Start Spin" button
- `/spinning` - Spinning animation, polls status
- `/voting-window` - Shows partner, voting buttons

## Key Features

✅ **Simple**: No triggers, no complex locks
✅ **Easy to debug**: Everything in database, clear queries
✅ **Predictable**: Runs every 5 seconds
✅ **Observable**: Can see exactly what's happening
✅ **Reliable**: Fewer edge cases

## Next Steps

1. Apply migration
2. Set up scheduled function (cron job)
3. Test with 2 users
4. Monitor queue and matches
5. Debug any issues using the queries above

