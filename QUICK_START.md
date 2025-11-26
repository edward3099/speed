# Quick Start Guide - Matching Engine Rebuild

## Step 1: Verify Existing Schema

Before applying migrations, check what tables exist:

```sql
-- Connect to your Supabase database and run:
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'user_preferences', 'matching_queue', 'matches');
```

## Step 2: Apply Migrations

Apply migrations in order:

```bash
cd /workspace/supabase/migrations/blueprint

# Option 1: Apply via Supabase CLI (if you have it)
supabase db push

# Option 2: Apply manually via SQL editor
# Copy each file's contents and run in Supabase SQL editor
# Order: 000, 001, 002, ..., 113
```

## Step 3: Verify Migrations

```sql
-- Check tables created
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('user_status', 'queue', 'votes', 'never_pair_again', 'debug_logs');

-- Check functions created
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_pair_atomic',
    'process_matching',
    'record_vote',
    'join_queue',
    'guardian_job'
  );
```

## Step 4: Test Basic Flow

### Test 1: Join Queue

```sql
-- As user (replace with actual user ID)
SELECT join_queue('user-id-here');
-- Should return TRUE

-- Check queue
SELECT * FROM queue WHERE user_id = 'user-id-here';

-- Check user_status
SELECT * FROM user_status WHERE user_id = 'user-id-here';
-- Should show state = 'spin_active'
```

### Test 2: Process Matching

```sql
-- Run matching engine
SELECT process_matching();
-- Returns number of matches created

-- Check matches
SELECT * FROM matches WHERE status = 'vote_active';
```

### Test 3: Record Vote

```sql
-- Record a vote (replace match_id and user_id)
SELECT record_vote('user-id', match_id, 'yes');
-- Returns JSONB with outcome
```

## Step 5: Test via API

```bash
# Start dev server
PORT=3000 npm run dev

# In another terminal, test API
curl -X POST http://localhost:3000/api/spin \
  -H "Cookie: sb-access-token=<your-token>"

curl -X POST http://localhost:3000/api/vote \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=<your-token>" \
  -d '{"match_id": 1, "vote_type": "yes"}'
```

## Step 6: Use Debugger

1. Open `/spin` page in browser
2. Click Bug icon (bottom-right, teal)
3. View all logs in real-time
4. Test scenarios and watch logs

## Troubleshooting

### Error: Table "users" does not exist
- ✅ Fixed: Created `users` view pointing to `profiles`
- If still error, check migration 001 was applied

### Error: Column "age" does not exist in profiles
- Check if `profiles` table has `age` column
- If not, add it: `ALTER TABLE profiles ADD COLUMN age INTEGER;`

### Error: Column "distance_km" does not exist
- The `get_user_distance()` function is a placeholder
- Implement based on your location system
- Or update function to use your distance calculation

### Error: Function "join_queue" does not exist
- Check migration 109 was applied
- Verify function was created: `SELECT * FROM pg_proc WHERE proname = 'join_queue';`

## Next Steps

1. ✅ Apply all migrations
2. ✅ Test basic scenarios
3. ✅ Update frontend to use new API routes
4. ✅ Test with multiple users
5. ✅ Schedule background jobs (guardians, matching)

## Support Files

- `TESTING_GUIDE.md` - Detailed test scenarios
- `IMPLEMENTATION_STATUS.md` - Complete status
- `MATCHING_ENGINE_REBUILD_SUMMARY.md` - Summary of changes
