#!/bin/bash

# Apply migrations to Supabase
# This script uses the Supabase REST API to apply migrations

SUPABASE_URL="https://jzautphzcbtqplltsfse.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6YXV0cGh6Y2J0cXBsbHRzZnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQ5NTc2NCwiZXhwIjoyMDc5MDcxNzY0fQ.3u57IsBUeJlHZ5IEbIFDtI9l3TSSeo_nDUBXYSiXh5k"

MIGRATIONS_DIR="supabase/migrations/blueprint"

echo "🚀 Applying migrations to Supabase..."
echo "⚠️  Note: Supabase REST API doesn't support direct SQL execution"
echo "📋 Please use one of these methods:"
echo ""
echo "Method 1: Supabase Dashboard SQL Editor"
echo "  1. Open: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql"
echo "  2. Copy contents of: $MIGRATIONS_DIR/ALL_MIGRATIONS_COMBINED.sql"
echo "  3. Paste and execute"
echo ""
echo "Method 2: Apply individual files in order:"
for file in 000_compatibility_check.sql 001_users_table.sql 002_user_status_table.sql 003_queue_table.sql 004_matches_table.sql 005_votes_table.sql 006_never_pair_again_table.sql 007_debug_logs_table.sql 101_create_pair_atomic.sql 102_find_best_match.sql 103_process_matching.sql 104_preference_expansion.sql 105_fairness_engine.sql 106_vote_engine.sql 107_cooldown_engine.sql 108_blocklist_engine.sql 109_queue_functions.sql 110_state_machine.sql 111_guardians.sql 112_disconnect_handler.sql 113_fix_compatibility.sql; do
  echo "  - $file"
done

echo ""
echo "✅ Combined SQL file ready: $MIGRATIONS_DIR/ALL_MIGRATIONS_COMBINED.sql"
echo "📊 File size: $(wc -l < $MIGRATIONS_DIR/ALL_MIGRATIONS_COMBINED.sql) lines"
