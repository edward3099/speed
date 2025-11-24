# How to Apply the Migration

The migration file is ready at:
```
supabase/migrations/20250112_improvements_to_reach_100_percent.sql
```

## Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20250112_improvements_to_reach_100_percent.sql`
5. Paste into the SQL Editor
6. Click **Run** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)

## Option 2: Supabase CLI

If you have Supabase CLI installed and linked:

```bash
cd speed-date
supabase db push
```

This will apply all pending migrations including the new one.

## Option 3: Manual SQL Execution

You can also execute the SQL directly via:
- Supabase Dashboard SQL Editor
- psql command line
- Any PostgreSQL client

## Verification

After applying, verify the migration worked:

```sql
-- Check if functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('create_pair_atomic', 'process_unmatched_users', 'get_current_match_rate');

-- Check if table exists
SELECT * FROM matching_metrics LIMIT 1;

-- Check if indexes exist
SELECT indexname FROM pg_indexes 
WHERE indexname LIKE 'idx_matching%' OR indexname LIKE 'idx_profiles%' OR indexname LIKE 'idx_user_preferences%';
```

## Next Steps After Migration

1. **Set up background matching job** - See `IMPLEMENTATION_GUIDE.md`
2. **Set up monitoring** - See `IMPLEMENTATION_GUIDE.md`
3. **Test the improvements** - Run your test suite

## Expected Results

- ✅ `create_pair_atomic` now has 10 retries (was 5)
- ✅ `find_best_match_v2` uses Tier 3 at 5 seconds (was 10)
- ✅ `process_unmatched_users` function created
- ✅ `matching_metrics` table created
- ✅ 5 new indexes created
- ✅ All functions have proper permissions

