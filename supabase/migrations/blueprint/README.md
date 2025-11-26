# Blueprint Atomic Migration Files

This directory contains the atomic migration files for the Backend Rewrite Blueprint, broken down into individual, testable components.

## Migration Order

Migrations must be applied in numerical order due to dependencies:

### Phase 0: Schema Foundation (4 files)
- `001_schema_match_history_tables.sql` - Match history and yes_yes_pairs tables
- `002_schema_queue_columns.sql` - Queue and preference expansion columns
- `003_schema_logging_table.sql` - Event logging table with indexes
- `004_schema_queue_metrics_table.sql` - Queue metrics table

### Phase 1: State Machine (Core) (5 files)
- `101_state_machine_enum.sql` - State enum definition
- `102_state_machine_transition.sql` - Centralized state transition engine
- `103_validate_transition.sql` - Validate transition rules
- `104_determine_reconnect_state.sql` - Reconnection state logic
- `105_execute_transition.sql` - Execute transition with state-specific logic

### Phase 2: Matching Engine (7 files)
- `201_unified_matching_engine.sql` - Single matching function (THE ONLY FUNCTION THAT CREATES MATCHES)
- `202_find_guaranteed_match_strict.sql` - Strict guaranteed match logic
- `203_is_user_already_matched.sql` - Duplicate match prevention
- `204_create_match_atomic.sql` - Atomic match creation with strict ordering
- `205_validate_gender_compatibility.sql` - Gender validation and is_user_online helper
- `206_find_candidate.sql` - Candidate finding for Tier 1/2
- `207_is_matchable.sql` - Matchable state check

### Phase 3: Queue Management (2 files)
- `301_queue_join.sql` - Unified queue join (THE ONLY FUNCTION THAT ADDS USERS TO QUEUE)
- `302_queue_remove.sql` - Unified queue removal (THE ONLY FUNCTION THAT REMOVES USERS FROM QUEUE)

### Phase 4: Fairness System (3 files)
- `401_calculate_fairness_score.sql` - Centralized fairness calculation (THE ONLY FUNCTION THAT CALCULATES FAIRNESS)
- `402_apply_fairness_boost.sql` - Fairness boost application (THE ONLY FUNCTION THAT APPLIES FAIRNESS BOOSTS)
- `403_preference_expansion.sql` - Preference expansion and reset functions

### Phase 5: Heartbeat & Offline (4 files)
- `501_heartbeat_update.sql` - Unified heartbeat handler (THE ONLY FUNCTION THAT HANDLES HEARTBEAT)
- `502_handle_user_offline.sql` - Offline detection with grace period
- `503_finalize_user_offline.sql` - Finalize offline after grace period
- `504_cleanup_expired_soft_offline.sql` - Cleanup function for expired soft_offline

### Phase 6: Voting Engine (2 files)
- `601_submit_vote.sql` - Complete voting engine (THE ONLY FUNCTION THAT HANDLES VOTES)
- `602_handle_idle_voter.sql` - Idle voter handling

### Phase 7: Reveal Engine (2 files)
- `701_complete_reveal.sql` - Atomic reveal → vote transition (THE ONLY FUNCTION THAT HANDLES REVEAL COMPLETION)
- `702_handle_reveal_timeout.sql` - Reveal timeout handling

### Phase 8: Concurrency Control (2 files)
- `801_matching_lock.sql` - Global matching lock functions
- `802_matching_orchestrator.sql` - Matching orchestrator with tier differentiation (THE ONLY FUNCTION THAT ORCHESTRATES MATCHING)

### Phase 9: Queue Monitoring (3 files)
- `901_collect_queue_metrics.sql` - Queue metrics collection
- `902_gender_ratio_balancing.sql` - Gender ratio stabilizer
- `903_monitor_queue_size.sql` - Queue size monitoring

### Phase 10: Timeout Detection (4 files)
- `1001_detect_spin_timeout.sql` - Real-time spin timeout detection
- `1002_detect_reveal_timeout.sql` - Real-time reveal timeout detection
- `1003_detect_vote_timeout.sql` - Real-time vote timeout detection
- `1004_check_user_timeouts.sql` - Unified timeout checker

### Phase 11: Schedulers (4 files)
- `1101_check_vote_timeouts.sql` - Vote timeout scheduler (THE ONLY FUNCTION THAT CHECKS FOR IDLE VOTERS)
- `1102_check_reveal_timeouts.sql` - Reveal timeout scheduler
- `1103_scheduler_setup.sql` - Complete scheduler setup (pg_cron commands)
- `1104_scheduler_health_check.sql` - Scheduler health monitoring

### Phase 12: Guardians (1 file)
- `1201_guardian_queue_consistency.sql` - Queue consistency guardian

### Phase 13: Logging Helper (1 file)
- `1301_log_event_helper.sql` - Logging helper function

**Total: 44 atomic migration files**

## Applying Migrations

### Option 1: Apply All at Once
```bash
# Apply all migrations in order
for file in speed-date/supabase/migrations/blueprint/*.sql; do
  psql $DATABASE_URL -f "$file"
done
```

### Option 2: Apply by Phase
```bash
# Apply Phase 0 (Schema)
psql $DATABASE_URL -f speed-date/supabase/migrations/blueprint/00*.sql

# Apply Phase 1 (State Machine)
psql $DATABASE_URL -f speed-date/supabase/migrations/blueprint/10*.sql

# ... and so on
```

### Option 3: Using Supabase CLI
```bash
# Apply individual migration
supabase db push --file supabase/migrations/blueprint/001_schema_match_history_tables.sql
```

## Testing

Each migration file is atomic and can be tested independently:

```sql
-- Test a specific migration
BEGIN;
\i supabase/migrations/blueprint/001_schema_match_history_tables.sql
-- Verify tables created
SELECT * FROM match_history LIMIT 1;
SELECT * FROM yes_yes_pairs LIMIT 1;
ROLLBACK; -- Or COMMIT if successful
```

## Rollback

To rollback a migration, create a corresponding rollback file:

```sql
-- Example: 001_schema_match_history_tables_rollback.sql
DROP TABLE IF EXISTS yes_yes_pairs CASCADE;
DROP TABLE IF EXISTS match_history CASCADE;
```

## Dependencies

- **Phase 0** (Schema) must be applied first
- **Phase 1** (State Machine) depends on Phase 0
- **Phase 2** (Matching) depends on Phase 0 and Phase 1
- **Phase 3-13** depend on previous phases

See `MIGRATION_STRATEGY.md` for the complete migration plan from current backend to new blueprint.

