# How to Apply Migrations

Since Supabase REST API doesn't support direct SQL execution, here are your options:

## Option 1: SQL Editor (Easiest - No Password Needed)

1. **Open SQL Editor:**
   https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql

2. **Copy the entire file:**
   `supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql`
   (1,687 lines, ~55 KB)

3. **Paste into SQL Editor and click "Run"**

## Option 2: psql Script (Requires Database Password)

If you have your database password:

```bash
./apply-with-password.sh 'your-database-password'
```

To get your database password:
1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/settings/database
2. Copy the database password
3. Run the script above

## Option 3: Supabase CLI (Requires Access Token)

If you have Supabase CLI access token:

```bash
export SUPABASE_ACCESS_TOKEN="your-access-token"
npx supabase link --project-ref jzautphzcbtqplltsfse
npx supabase db push
```

## Current Status

✅ **Migration file is ready:** `supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql`
✅ **All compatibility fixes applied** (handles existing tables)
✅ **psql client installed** (ready for Option 2)

## What's Fixed

- ✅ `matches.vote_window_expires_at` column handling
- ✅ `votes.match_id` column handling  
- ✅ All indexes created conditionally
- ✅ Handles existing tables gracefully

## After Applying

Verify migrations with:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('user_status', 'queue', 'matches', 'votes', 'never_pair_again', 'debug_logs');

-- Check functions
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_pair_atomic', 'process_matching', 'record_vote', 'join_queue');
```
