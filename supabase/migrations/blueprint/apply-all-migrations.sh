#!/bin/bash
# Apply all blueprint migrations in sequential order
# This script applies ONLY matching system migrations

set -e  # Exit on error

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

echo "=========================================="
echo "Applying Blueprint Migrations (Matching System Only)"
echo "=========================================="
echo "Database: $DB_URL"
echo ""

# Define migrations in EXACT order (from IMPLEMENTATION_GUIDE.md)
MIGRATIONS=(
  # Phase 0: Schema Foundation
  "001_schema_match_history_tables.sql"
  "002_schema_queue_columns.sql"
  "003_schema_logging_table.sql"
  "004_schema_queue_metrics_table.sql"
  
  # Phase 13: Logging Helper (apply early so other phases can use it)
  "1301_log_event_helper.sql"
  
  # Phase 1: State Machine
  "101_state_machine_enum.sql"
  "102_state_machine_transition.sql"
  "103_validate_transition.sql"
  "104_determine_reconnect_state.sql"
  "105_execute_transition.sql"
  
  # Phase 4: Fairness System (apply before Phase 2 - matching uses fairness)
  "401_calculate_fairness_score.sql"
  "402_apply_fairness_boost.sql"
  "403_preference_expansion.sql"
  
  # Phase 2: Matching Engine (helpers first, then validators, then finders, finally main engine)
  "203_is_user_already_matched.sql"
  "205_validate_gender_compatibility.sql"
  "207_is_matchable.sql"
  "204_create_match_atomic.sql"
  "202_find_guaranteed_match_strict.sql"
  "206_find_candidate.sql"
  "201_unified_matching_engine.sql"
  
  # Phase 3: Queue Management
  "301_queue_join.sql"
  "302_queue_remove.sql"
  
  # Phase 5: Heartbeat & Offline
  "501_heartbeat_update.sql"
  "502_handle_user_offline.sql"
  "503_finalize_user_offline.sql"
  "504_cleanup_expired_soft_offline.sql"
  
  # Phase 6: Voting Engine
  "601_submit_vote.sql"
  "602_handle_idle_voter.sql"
  
  # Phase 7: Reveal Engine
  "701_complete_reveal.sql"
  "702_handle_reveal_timeout.sql"
  
  # Phase 8: Concurrency Control
  "801_matching_lock.sql"
  "802_matching_orchestrator.sql"
  
  # Phase 9: Queue Monitoring
  "901_collect_queue_metrics.sql"
  "902_gender_ratio_balancing.sql"
  "903_monitor_queue_size.sql"
  
  # Phase 10: Timeout Detection
  "1001_detect_spin_timeout.sql"
  "1002_detect_reveal_timeout.sql"
  "1003_detect_vote_timeout.sql"
  "1004_check_user_timeouts.sql"
  
  # Phase 11: Schedulers
  "1101_check_vote_timeouts.sql"
  "1102_check_reveal_timeouts.sql"
  "1103_scheduler_setup.sql"
  "1104_scheduler_health_check.sql"
  
  # Phase 12: Guardians
  "1201_guardian_queue_consistency.sql"
)

MIGRATION_DIR="supabase/migrations/blueprint"
TOTAL=${#MIGRATIONS[@]}
CURRENT=0

for file in "${MIGRATIONS[@]}"; do
  CURRENT=$((CURRENT + 1))
  echo "[$CURRENT/$TOTAL] Applying: $file"
  
  if [ ! -f "$MIGRATION_DIR/$file" ]; then
    echo "ERROR: File not found: $MIGRATION_DIR/$file"
    exit 1
  fi
  
  psql "$DB_URL" -f "$MIGRATION_DIR/$file" || {
    echo "ERROR: Failed to apply $file"
    exit 1
  }
  
  echo "✓ Applied: $file"
  echo ""
done

echo "=========================================="
echo "✅ All $TOTAL migrations applied successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify functions exist: SELECT proname FROM pg_proc WHERE proname LIKE '%matching%' OR proname LIKE '%queue%' OR proname LIKE '%vote%';"
echo "2. Test individual functions"
echo "3. Set up schedulers (see 1103_scheduler_setup.sql)"
echo "4. Update frontend to use new API routes"

