# How to Apply Migrations

Since Supabase REST API doesn't support direct SQL execution, here are the options:

## Option 1: Supabase Dashboard SQL Editor (Recommended)

1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse
2. Go to SQL Editor
3. Copy the entire contents of: `supabase/migrations/blueprint/ALL_MIGRATIONS_COMBINED.sql`
4. Paste into SQL Editor
5. Click "Run" or press Ctrl+Enter
6. Verify all migrations applied successfully

## Option 2: Apply Individual Migrations

If you prefer to apply one at a time (easier to debug):

1. Apply in this order:
   - 000_compatibility_check.sql
   - 001_users_table.sql
   - 002_user_status_table.sql
   - 003_queue_table.sql
   - 004_matches_table.sql
   - 005_votes_table.sql
   - 006_never_pair_again_table.sql
   - 007_debug_logs_table.sql
   - 101_create_pair_atomic.sql
   - 102_find_best_match.sql
   - 103_process_matching.sql
   - 104_preference_expansion.sql
   - 105_fairness_engine.sql
   - 106_vote_engine.sql
   - 107_cooldown_engine.sql
   - 108_blocklist_engine.sql
   - 109_queue_functions.sql
   - 110_state_machine.sql
   - 111_guardians.sql
   - 112_disconnect_handler.sql
   - 113_fix_compatibility.sql

## Option 3: Supabase CLI (if you have it)

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref jzautphzcbtqplltsfse

# Apply migrations
supabase db push
```

## Verification

After applying, verify with:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('user_status', 'queue', 'votes', 'never_pair_again', 'debug_logs');

-- Check functions
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_pair_atomic', 'process_matching', 'record_vote', 'join_queue');
```
