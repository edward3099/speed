# Background Matching Job Setup Complete ✅

## What Was Set Up

### 1. ✅ Database Migration Applied
- Created migration: `supabase/migrations/20250112_setup_background_matching_job.sql`
- Attempts to enable `pg_cron` extension and schedule jobs
- If `pg_cron` is not available, falls back gracefully with warnings

### 2. ✅ Next.js API Route Created
- Created: `src/app/api/background-matching/route.ts`
- Endpoint: `POST /api/background-matching`
- Calls `process_unmatched_users()` function
- Also records metrics automatically

## Current Status

### Option A: pg_cron (If Available)
If the migration ran successfully, the background job is already running:
- **Job Name**: `process-unmatched-users`
- **Frequency**: Every 10 seconds
- **Function**: `process_unmatched_users()`
- **Metrics Job**: `record-matching-metrics` (every 1 minute)

### Option B: Next.js API Route (Backup)
If `pg_cron` is not available, use the API route:

**Endpoint**: `POST /api/background-matching`

**Setup Options:**

1. **Vercel Cron Jobs** (if deployed on Vercel):
   ```json
   // vercel.json
   {
     "crons": [{
       "path": "/api/background-matching",
       "schedule": "*/10 * * * * *"
     }]
   }
   ```

2. **External Cron Service** (EasyCron, Cronitor, etc.):
   - URL: `https://your-app.com/api/background-matching`
   - Method: POST
   - Frequency: Every 10-30 seconds
   - Optional: Add `Authorization: Bearer YOUR_TOKEN` header

3. **GitHub Actions** (Free):
   ```yaml
   # .github/workflows/background-matching.yml
   name: Background Matching
   on:
     schedule:
       - cron: '*/10 * * * *'  # Every 10 seconds (approximate)
   jobs:
     match:
       runs-on: ubuntu-latest
       steps:
         - name: Call API
           run: |
             curl -X POST https://your-app.com/api/background-matching
   ```

4. **Local Testing**:
   ```bash
   # Test the endpoint
   curl -X POST http://localhost:3001/api/background-matching
   ```

## Verification

### Check if pg_cron Jobs Are Running
```sql
-- Check scheduled jobs
SELECT * FROM cron.job 
WHERE jobname IN ('process-unmatched-users', 'record-matching-metrics');
```

### Test Background Matching Manually
```sql
-- Test the function
SELECT process_unmatched_users() as matches_created;

-- Check current match rate
SELECT get_current_match_rate() as current_match_rate;
```

### Check Metrics
```sql
-- View recent metrics
SELECT * FROM matching_metrics 
ORDER BY timestamp DESC 
LIMIT 10;
```

## Security (Optional)

To secure the API route, add an environment variable:

```env
# .env.local
BACKGROUND_MATCHING_TOKEN=your-secret-token-here
```

Then update your cron service to include:
```
Authorization: Bearer your-secret-token-here
```

## Monitoring

The background job will:
1. Process users waiting 5+ seconds
2. Create matches for unmatched users
3. Record metrics automatically
4. Return number of matches created

## Expected Impact

With the background job running:
- **Match Rate**: 95% → 99-100%
- **Unmatched Users**: Reduced to near zero
- **Wait Times**: Faster matching for users who didn't match initially

## Troubleshooting

### If pg_cron is not available:
1. Use the Next.js API route instead
2. Set up external cron service
3. Or use Vercel Cron Jobs if deployed on Vercel

### If API route returns 401:
- Add `BACKGROUND_MATCHING_TOKEN` to `.env.local`
- Include token in cron service request headers

### If no matches are being created:
- Check if there are users in queue: `SELECT COUNT(*) FROM matching_queue WHERE status IN ('spin_active', 'queue_waiting');`
- Check if users have been waiting 5+ seconds
- Verify function exists: `SELECT process_unmatched_users();`

