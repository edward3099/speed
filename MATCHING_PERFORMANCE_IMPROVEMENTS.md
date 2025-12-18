# Matching Performance Improvements for High Load

## Overview

This document describes the improvements made to handle high-load scenarios based on the 100-user stress test analysis.

## Changes Implemented

### 1. Extended Matching Window (30s → 90s)

**Problem:** Users who didn't match within 30 seconds became ineligible, causing many users to get stuck in "waiting" state during high load.

**Solution:** Extended the matching window from 30 seconds to 90 seconds, and activity window from 5 seconds to 10 seconds.

**Files Changed:**
- `supabase/migrations/20250114_improve_matching_performance_high_load.sql`
  - Updated `try_match_user()` function to use 90-second window
  - Increased activity window from 5s to 10s

**Impact:** Users now have 3x longer to get matched, significantly reducing stuck users in high-load scenarios.

### 2. Background Job for Stuck Users

**Problem:** Users stuck in waiting state (>30s) weren't being retried, leading to permanent stuck states.

**Solution:** Created `retry_matching_stuck_users()` function that specifically targets users waiting >30 seconds but still active.

**Files Changed:**
- `supabase/migrations/20250114_improve_matching_performance_high_load.sql`
  - New function: `retry_matching_stuck_users()`
- `src/app/api/cron/retry-matching/route.ts`
  - Updated to use new stuck user retry function
  - Now retries both stuck users and regular waiting users
- `src/lib/cron/matching-scheduler.ts`
  - Updated to use improved retry logic

**Impact:** Users stuck due to race conditions or high load are automatically retried, improving match rate.

### 3. Monitoring for Stuck Users

**Problem:** No visibility into how many users are stuck or how long they've been waiting.

**Solution:** Created monitoring function and API endpoint to track stuck users.

**Files Changed:**
- `supabase/migrations/20250114_improve_matching_performance_high_load.sql`
  - New function: `monitor_stuck_users()`
  - New index: `idx_users_state_stuck_waiting` for performance
- `src/app/api/cron/monitor-stuck-users/route.ts`
  - New monitoring endpoint

**Impact:** Provides visibility into matching performance issues for debugging and alerting.

### 4. Improved State Synchronization

**Problem:** Some users ended up on unexpected pages, indicating state synchronization issues.

**Solution:** 
- Extended activity window from 5s to 10s (more forgiving)
- Added better handling for users with recent activity
- Improved index for stuck user queries

**Impact:** Better state consistency and fewer users on unexpected pages.

## Database Migration

Run the migration to apply all improvements:

```bash
# Apply the migration
supabase migration up 20250114_improve_matching_performance_high_load
```

Or if using Supabase CLI:

```bash
supabase db push
```

## Vercel Cron Configuration

To enable the background jobs, add these cron jobs to your Vercel project:

### Option 1: Using Vercel Dashboard

1. Go to your Vercel project settings
2. Navigate to "Cron Jobs"
3. Add the following cron jobs:

**Retry Matching (every 5 seconds):**
- Path: `/api/cron/retry-matching`
- Schedule: `*/5 * * * * *`
- Method: GET

**Monitor Stuck Users (every 60 seconds):**
- Path: `/api/cron/monitor-stuck-users`
- Schedule: `*/60 * * * * *`
- Method: GET

### Option 2: Using vercel.json

Create or update `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/retry-matching",
      "schedule": "*/5 * * * * *"
    },
    {
      "path": "/api/cron/monitor-stuck-users",
      "schedule": "*/60 * * * * *"
    }
  ]
}
```

### Option 3: Using External Scheduler

If you prefer external scheduling (e.g., GitHub Actions, external cron service):

1. **Retry Matching:** Call `GET /api/cron/retry-matching` every 5 seconds
2. **Monitor Stuck Users:** Call `GET /api/cron/monitor-stuck-users` every 60 seconds

**Note:** If using `CRON_SECRET`, include it in the Authorization header:
```
Authorization: Bearer YOUR_CRON_SECRET
```

## Expected Performance Improvements

Based on the 100-user stress test:

### Before:
- 206 users still spinning after 90s
- 99 users on unexpected pages
- Many users stuck due to 30s window expiration

### After:
- Extended 90s window allows more time for matching
- Stuck users automatically retried
- Better monitoring for debugging
- Improved state synchronization

## Monitoring

Check the monitoring endpoint to see current stuck user metrics:

```bash
curl https://your-app.vercel.app/api/cron/monitor-stuck-users
```

Response includes:
- `stuckWaitingCount`: Users waiting >60s
- `stuckSpinningCount`: Users on /spinning but stuck
- `avgWaitingTimeSeconds`: Average wait time for stuck users
- `maxWaitingTimeSeconds`: Maximum wait time

## Testing

After applying the migration, run the 100-user stress test again:

```bash
cd /Users/bb/Desktop/speed && \
TEST_BASE_URL=https://speed-silk.vercel.app \
npx playwright test tests/100-users-stress.spec.ts \
  --config playwright.vercel.config.ts \
  --reporter=list \
  --timeout=1800000
```

Expected improvements:
- Fewer users stuck in spinning state
- More matches created
- Better state consistency
- Improved overall matching rate

## Rollback

If needed, you can rollback the migration:

```bash
supabase migration down 20250114_improve_matching_performance_high_load
```

However, note that this will revert:
- Matching window back to 30s
- Remove stuck user retry function
- Remove monitoring function

## Next Steps

1. Apply the migration to your database
2. Set up Vercel cron jobs (or external scheduler)
3. Monitor the metrics endpoint to track improvements
4. Run stress tests to validate improvements
5. Adjust cron frequency if needed based on load

## Related Files

- Migration: `supabase/migrations/20250114_improve_matching_performance_high_load.sql`
- Retry Endpoint: `src/app/api/cron/retry-matching/route.ts`
- Monitor Endpoint: `src/app/api/cron/monitor-stuck-users/route.ts`
- Scheduler: `src/lib/cron/matching-scheduler.ts`
- Test: `tests/100-users-stress.spec.ts`















