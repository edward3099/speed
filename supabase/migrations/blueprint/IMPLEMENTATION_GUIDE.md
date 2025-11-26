# Blueprint Implementation Guide: Sequential Order

This document explains **exactly how to implement** the 44 atomic migration files in the correct sequential order, with dependencies, testing, and rollback procedures.

---

## ⚠️ CRITICAL: Sequential Order is Mandatory

**DO NOT skip files or change the order.** Each file builds on previous ones. Dependencies are strict.

---

## Implementation Strategy

### Option 1: Phased Implementation (Recommended)

Apply migrations phase-by-phase, testing after each phase:

1. **Phase 0** (Schema) → Test → Commit
2. **Phase 1** (State Machine) → Test → Commit
3. **Phase 2** (Matching Engine) → Test → Commit
4. Continue with remaining phases...

### Option 2: All-at-Once (Advanced)

Apply all 44 files in one transaction (only if you're confident):

```bash
# Apply all migrations in order
for file in $(ls -1 supabase/migrations/blueprint/*.sql | sort -V); do
  psql $DATABASE_URL -f "$file"
done
```

**⚠️ Warning**: If any file fails, you'll need to rollback all previous files.

---

## Phase-by-Phase Implementation

### Phase 0: Schema Foundation (Files 001-004)

**Purpose**: Create all tables, indexes, and columns needed by the new system.

**Files**:
1. `001_schema_match_history_tables.sql` - Creates `match_history` and `yes_yes_pairs` tables
2. `002_schema_queue_columns.sql` - Adds `disconnected_at` and preference expansion columns
3. `003_schema_logging_table.sql` - Creates `spark_event_log` table with indexes
4. `004_schema_queue_metrics_table.sql` - Creates `queue_metrics` table

**Dependencies**: None (foundation layer)

**Testing**:
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('match_history', 'yes_yes_pairs', 'spark_event_log', 'queue_metrics');

-- Verify columns added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'matching_queue' 
AND column_name = 'disconnected_at';

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'user_preferences' 
AND column_name IN ('expanded', 'expanded_until', 'original_min_age', 'original_max_age', 'original_max_distance');
```

**Rollback** (if needed):
```sql
DROP TABLE IF EXISTS queue_metrics CASCADE;
DROP TABLE IF EXISTS spark_event_log CASCADE;
DROP TABLE IF EXISTS yes_yes_pairs CASCADE;
DROP TABLE IF EXISTS match_history CASCADE;
ALTER TABLE matching_queue DROP COLUMN IF EXISTS disconnected_at;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS expanded, expanded_until, original_min_age, original_max_age, original_max_distance;
```

**Status After Phase 0**: Schema ready, but no functions yet. Current backend still works.

---

### Phase 1: State Machine (Files 101-105)

**Purpose**: Create the centralized state machine that controls ALL state transitions.

**Files** (MUST be in this order):
1. `101_state_machine_enum.sql` - Creates `user_matching_state` enum type
2. `102_state_machine_transition.sql` - Main state transition function (depends on enum)
3. `103_validate_transition.sql` - Validates transitions (depends on enum)
4. `104_determine_reconnect_state.sql` - Determines reconnect state (depends on enum)
5. `105_execute_transition.sql` - Executes transitions (depends on enum, validate_transition, log_event)

**Dependencies**: 
- Phase 0 (schema)
- `log_event` function (from Phase 13) - **NOTE**: You may need to apply `1301_log_event_helper.sql` first, or temporarily comment out log_event calls

**Critical**: The state machine enum (`user_matching_state`) must exist before any function that uses it.

**Testing**:
```sql
-- Verify enum exists
SELECT typname FROM pg_type WHERE typname = 'user_matching_state';

-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('state_machine_transition', 'validate_transition', 'execute_transition', 'determine_reconnect_state');

-- Test enum values
SELECT unnest(enum_range(NULL::user_matching_state));
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS execute_transition CASCADE;
DROP FUNCTION IF EXISTS determine_reconnect_state CASCADE;
DROP FUNCTION IF EXISTS validate_transition CASCADE;
DROP FUNCTION IF EXISTS state_machine_transition CASCADE;
DROP TYPE IF EXISTS user_matching_state CASCADE;
```

**Status After Phase 1**: State machine ready, but not yet used by matching engine. Current backend still works.

---

### Phase 2: Matching Engine (Files 201-207)

**Purpose**: Create the unified matching engine that guarantees pairing.

**Files** (MUST be in this order):
1. `201_unified_matching_engine.sql` - Main matching function (depends on state machine, is_matchable, is_user_already_matched, find_candidate, find_guaranteed_match_strict, create_match_atomic)
2. `202_find_guaranteed_match_strict.sql` - Strict guaranteed match logic (depends on is_user_already_matched)
3. `203_is_user_already_matched.sql` - Duplicate prevention helper
4. `204_create_match_atomic.sql` - Atomic match creation (depends on validate_gender_compatibility, is_user_already_matched)
5. `205_validate_gender_compatibility.sql` - Gender validation + is_user_online helper
6. `206_find_candidate.sql` - Candidate finding for Tier 1/2 (depends on is_user_already_matched)
7. `207_is_matchable.sql` - Matchable state check (depends on enum)

**Dependencies**: 
- Phase 0 (schema - match_history, yes_yes_pairs)
- Phase 1 (state machine enum and functions)
- Phase 4 (calculate_fairness_score, apply_fairness_boost, reset_preference_expansion) - **NOTE**: You may need to apply Phase 4 first, or temporarily comment out these calls

**Critical Order Within Phase 2**:
- Apply helpers first: `203`, `205`, `207`
- Then validators: `204` (uses 205, 203)
- Then finders: `202` (uses 203), `206` (uses 203)
- Finally main engine: `201` (uses all above)

**Testing**:
```sql
-- Verify all functions exist
SELECT proname FROM pg_proc 
WHERE proname IN (
  'unified_matching_engine',
  'find_guaranteed_match_strict',
  'is_user_already_matched',
  'create_match_atomic',
  'validate_gender_compatibility',
  'is_user_online',
  'find_candidate',
  'is_matchable'
);

-- Test helper functions
SELECT is_user_online('00000000-0000-0000-0000-000000000000'::UUID); -- Should return FALSE
SELECT is_matchable('00000000-0000-0000-0000-000000000000'::UUID); -- Should return FALSE
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS unified_matching_engine CASCADE;
DROP FUNCTION IF EXISTS find_guaranteed_match_strict CASCADE;
DROP FUNCTION IF EXISTS find_candidate CASCADE;
DROP FUNCTION IF EXISTS is_matchable CASCADE;
DROP FUNCTION IF EXISTS create_match_atomic CASCADE;
DROP FUNCTION IF EXISTS validate_gender_compatibility CASCADE;
DROP FUNCTION IF EXISTS is_user_online CASCADE;
DROP FUNCTION IF EXISTS is_user_already_matched CASCADE;
```

**Status After Phase 2**: Matching engine ready, but not yet used by queue operations. Current backend still works.

---

### Phase 3: Queue Management (Files 301-302)

**Purpose**: Create unified queue operations that use the state machine.

**Files**:
1. `301_queue_join.sql` - Unified queue join (depends on state_machine_transition, calculate_fairness_score)
2. `302_queue_remove.sql` - Unified queue removal (depends on log_event)

**Dependencies**: 
- Phase 0 (schema)
- Phase 1 (state_machine_transition)
- Phase 4 (calculate_fairness_score) - **NOTE**: You may need to apply Phase 4 first
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('queue_join', 'queue_remove');

-- Test queue_join (with test user)
-- Note: This will fail if user doesn't exist, which is expected
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS queue_remove CASCADE;
DROP FUNCTION IF EXISTS queue_join CASCADE;
```

**Status After Phase 3**: Queue operations ready, but not yet used by frontend. Current backend still works.

---

### Phase 4: Fairness System (Files 401-403)

**Purpose**: Create centralized fairness calculation and boost system.

**Files**:
1. `401_calculate_fairness_score.sql` - Fairness calculation (no dependencies)
2. `402_apply_fairness_boost.sql` - Fairness boost application (depends on log_event)
3. `403_preference_expansion.sql` - Preference expansion and reset (depends on log_event)

**Dependencies**: 
- Phase 0 (schema - user_preferences columns)
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('calculate_fairness_score', 'apply_fairness_boost', 'apply_preference_expansion', 'reset_preference_expansion');

-- Test fairness calculation (with test user in queue)
-- SELECT calculate_fairness_score('test-user-id'::UUID);
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS reset_preference_expansion CASCADE;
DROP FUNCTION IF EXISTS apply_preference_expansion CASCADE;
DROP FUNCTION IF EXISTS apply_fairness_boost CASCADE;
DROP FUNCTION IF EXISTS calculate_fairness_score CASCADE;
```

**Status After Phase 4**: Fairness system ready. Current backend still works.

---

### Phase 5: Heartbeat & Offline (Files 501-504)

**Purpose**: Create unified heartbeat and offline handling with 10-second grace period.

**Files**:
1. `501_heartbeat_update.sql` - Heartbeat handler (depends on state_machine_transition)
2. `502_handle_user_offline.sql` - Offline detection (depends on log_event)
3. `503_finalize_user_offline.sql` - Finalize offline (depends on state_machine_transition, queue_remove, apply_fairness_boost)
4. `504_cleanup_expired_soft_offline.sql` - Cleanup function (depends on finalize_user_offline)

**Dependencies**: 
- Phase 0 (schema - disconnected_at column)
- Phase 1 (state_machine_transition)
- Phase 3 (queue_remove)
- Phase 4 (apply_fairness_boost)
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('heartbeat_update', 'handle_user_offline', 'finalize_user_offline', 'cleanup_expired_soft_offline');
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS cleanup_expired_soft_offline CASCADE;
DROP FUNCTION IF EXISTS finalize_user_offline CASCADE;
DROP FUNCTION IF EXISTS handle_user_offline CASCADE;
DROP FUNCTION IF EXISTS heartbeat_update CASCADE;
```

**Status After Phase 5**: Heartbeat and offline handling ready. Current backend still works.

---

### Phase 6: Voting Engine (Files 601-602)

**Purpose**: Create complete voting engine with instant respin logic.

**Files**:
1. `601_submit_vote.sql` - Main voting function (depends on state_machine_transition, apply_fairness_boost)
2. `602_handle_idle_voter.sql` - Idle voter handling (depends on apply_fairness_boost, queue_remove, state_machine_transition)

**Dependencies**: 
- Phase 0 (schema - match_history, yes_yes_pairs, votes table)
- Phase 1 (state_machine_transition)
- Phase 3 (queue_remove)
- Phase 4 (apply_fairness_boost)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('submit_vote', 'handle_idle_voter');
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS handle_idle_voter CASCADE;
DROP FUNCTION IF EXISTS submit_vote CASCADE;
```

**Status After Phase 6**: Voting engine ready. Current backend still works.

---

### Phase 7: Reveal Engine (Files 701-702)

**Purpose**: Create atomic reveal → vote transition.

**Files**:
1. `701_complete_reveal.sql` - Reveal completion (depends on state_machine_transition)
2. `702_handle_reveal_timeout.sql` - Reveal timeout (depends on state_machine_transition, apply_fairness_boost, queue_remove)

**Dependencies**: 
- Phase 0 (schema - matches table with metadata)
- Phase 1 (state_machine_transition)
- Phase 3 (queue_remove)
- Phase 4 (apply_fairness_boost)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('complete_reveal', 'handle_reveal_timeout');
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS handle_reveal_timeout CASCADE;
DROP FUNCTION IF EXISTS complete_reveal CASCADE;
```

**Status After Phase 7**: Reveal engine ready. Current backend still works.

---

### Phase 8: Concurrency Control (Files 801-802)

**Purpose**: Create global matching lock and orchestrator.

**Files**:
1. `801_matching_lock.sql` - Lock functions (no dependencies)
2. `802_matching_orchestrator.sql` - Matching orchestrator (depends on acquire_matching_lock, release_matching_lock, unified_matching_engine)

**Dependencies**: 
- Phase 2 (unified_matching_engine)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('acquire_matching_lock', 'release_matching_lock', 'matching_orchestrator');

-- Test lock acquisition
SELECT acquire_matching_lock(); -- Should return TRUE
SELECT release_matching_lock(); -- Should return void
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS matching_orchestrator CASCADE;
DROP FUNCTION IF EXISTS release_matching_lock CASCADE;
DROP FUNCTION IF EXISTS acquire_matching_lock CASCADE;
```

**Status After Phase 8**: Concurrency control ready. Current backend still works.

---

### Phase 9: Queue Monitoring (Files 901-903)

**Purpose**: Create queue metrics collection and gender ratio balancing.

**Files**:
1. `901_collect_queue_metrics.sql` - Metrics collection (depends on queue_metrics table)
2. `902_gender_ratio_balancing.sql` - Gender balancing (depends on collect_queue_metrics, apply_fairness_boost, log_event)
3. `903_monitor_queue_size.sql` - Queue size monitoring (depends on collect_queue_metrics, apply_gender_ratio_balancing)

**Dependencies**: 
- Phase 0 (schema - queue_metrics table)
- Phase 4 (apply_fairness_boost)
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('collect_queue_metrics', 'apply_gender_ratio_balancing', 'monitor_queue_size');

-- Test metrics collection
SELECT collect_queue_metrics();
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS monitor_queue_size CASCADE;
DROP FUNCTION IF EXISTS apply_gender_ratio_balancing CASCADE;
DROP FUNCTION IF EXISTS collect_queue_metrics CASCADE;
```

**Status After Phase 9**: Queue monitoring ready. Current backend still works.

---

### Phase 10: Timeout Detection (Files 1001-1004)

**Purpose**: Create real-time timeout detection functions.

**Files**:
1. `1001_detect_spin_timeout.sql` - Spin timeout detection (depends on state_machine_transition, log_event)
2. `1002_detect_reveal_timeout.sql` - Reveal timeout detection (depends on handle_reveal_timeout)
3. `1003_detect_vote_timeout.sql` - Vote timeout detection (depends on handle_idle_voter)
4. `1004_check_user_timeouts.sql` - Unified timeout checker (depends on all three detect functions)

**Dependencies**: 
- Phase 1 (state_machine_transition)
- Phase 6 (handle_idle_voter)
- Phase 7 (handle_reveal_timeout)
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('detect_spin_timeout', 'detect_reveal_timeout', 'detect_vote_timeout', 'check_user_timeouts');
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS check_user_timeouts CASCADE;
DROP FUNCTION IF EXISTS detect_vote_timeout CASCADE;
DROP FUNCTION IF EXISTS detect_reveal_timeout CASCADE;
DROP FUNCTION IF EXISTS detect_spin_timeout CASCADE;
```

**Status After Phase 10**: Timeout detection ready. Current backend still works.

---

### Phase 11: Schedulers (Files 1101-1104)

**Purpose**: Create scheduler functions for background jobs.

**Files**:
1. `1101_check_vote_timeouts.sql` - Vote timeout scheduler (depends on handle_idle_voter)
2. `1102_check_reveal_timeouts.sql` - Reveal timeout scheduler (depends on handle_reveal_timeout)
3. `1103_scheduler_setup.sql` - Scheduler setup commands (documentation only, no functions)
4. `1104_scheduler_health_check.sql` - Scheduler health monitoring (depends on cron.job table)

**Dependencies**: 
- Phase 6 (handle_idle_voter)
- Phase 7 (handle_reveal_timeout)
- Phase 5 (cleanup_expired_soft_offline)
- Phase 9 (collect_queue_metrics, apply_gender_ratio_balancing, monitor_queue_size)
- Phase 8 (matching_orchestrator)
- Phase 12 (guardian_queue_consistency)
- pg_cron extension must be enabled

**Testing**:
```sql
-- Verify functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('check_vote_timeouts', 'check_reveal_timeouts', 'check_scheduler_health');

-- Test scheduler functions
SELECT check_vote_timeouts();
SELECT check_reveal_timeouts();
SELECT check_scheduler_health();
```

**Setting Up Schedulers** (from `1103_scheduler_setup.sql`):
```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule all background jobs (uncomment and run)
SELECT cron.schedule('cleanup-soft-offline', '*/5 * * * * *', $$SELECT cleanup_expired_soft_offline();$$);
SELECT cron.schedule('check-vote-timeouts', '*/10 * * * * *', $$SELECT check_vote_timeouts();$$);
SELECT cron.schedule('check-reveal-timeouts', '*/10 * * * * *', $$SELECT check_reveal_timeouts();$$);
SELECT cron.schedule('queue-monitoring', '*/30 * * * * *', $$SELECT collect_queue_metrics();$$);
SELECT cron.schedule('gender-balancing', '*/60 * * * * *', $$SELECT apply_gender_ratio_balancing();$$);
SELECT cron.schedule('queue-size-monitoring', '*/60 * * * * *', $$SELECT monitor_queue_size();$$);
SELECT cron.schedule('matching-orchestrator', '*/5 * * * * *', $$SELECT matching_orchestrator();$$);
SELECT cron.schedule('guardian-queue-consistency', '*/30 * * * * *', $$SELECT guardian_queue_consistency();$$);
```

**Rollback** (if needed):
```sql
-- Unschedule all jobs first
SELECT cron.unschedule('cleanup-soft-offline');
SELECT cron.unschedule('check-vote-timeouts');
SELECT cron.unschedule('check-reveal-timeouts');
SELECT cron.unschedule('queue-monitoring');
SELECT cron.unschedule('gender-balancing');
SELECT cron.unschedule('queue-size-monitoring');
SELECT cron.unschedule('matching-orchestrator');
SELECT cron.unschedule('guardian-queue-consistency');

-- Then drop functions
DROP FUNCTION IF EXISTS check_scheduler_health CASCADE;
DROP FUNCTION IF EXISTS check_reveal_timeouts CASCADE;
DROP FUNCTION IF EXISTS check_vote_timeouts CASCADE;
```

**Status After Phase 11**: Schedulers ready. Current backend still works.

---

### Phase 12: Guardians (Files 1201)

**Purpose**: Create preventive guardians (safety nets).

**Files**:
1. `1201_guardian_queue_consistency.sql` - Queue consistency guardian (depends on log_event)

**Dependencies**: 
- Phase 0 (schema)
- Phase 13 (log_event)

**Testing**:
```sql
-- Verify function exists
SELECT proname FROM pg_proc 
WHERE proname = 'guardian_queue_consistency';

-- Test guardian (should return empty if system is working)
SELECT guardian_queue_consistency();
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS guardian_queue_consistency CASCADE;
```

**Status After Phase 12**: Guardians ready. Current backend still works.

---

### Phase 13: Logging Helper (Files 1301)

**Purpose**: Create logging helper function used throughout the system.

**Files**:
1. `1301_log_event_helper.sql` - Logging helper (depends on spark_event_log table)

**Dependencies**: 
- Phase 0 (schema - spark_event_log table)

**⚠️ CRITICAL**: This function is called by many other functions. You have two options:

**Option A**: Apply this file **BEFORE** other phases that use it (recommended)
- Apply `1301_log_event_helper.sql` right after Phase 0
- Then apply Phases 1-12

**Option B**: Apply this file last, but temporarily comment out `log_event` calls in other files
- Apply Phases 1-12 with `log_event` calls commented out
- Apply Phase 13
- Uncomment `log_event` calls in all files

**Testing**:
```sql
-- Verify function exists
SELECT proname FROM pg_proc 
WHERE proname = 'log_event';

-- Test logging
SELECT log_event('test_event', NULL, '{}'::JSONB, 'INFO', 'test');
SELECT * FROM spark_event_log WHERE event_type = 'test_event' ORDER BY timestamp DESC LIMIT 1;
```

**Rollback** (if needed):
```sql
DROP FUNCTION IF EXISTS log_event CASCADE;
```

**Status After Phase 13**: Logging helper ready. All functions can now log events.

---

## Complete Implementation Order

### Recommended Order (with log_event early):

```
Phase 0: Schema (001-004)
Phase 13: Logging Helper (1301) ← Apply early so other phases can use it
Phase 1: State Machine (101-105)
Phase 4: Fairness System (401-403) ← Apply before Phase 2 (matching uses fairness)
Phase 2: Matching Engine (201-207)
Phase 3: Queue Management (301-302)
Phase 5: Heartbeat & Offline (501-504)
Phase 6: Voting Engine (601-602)
Phase 7: Reveal Engine (701-702)
Phase 8: Concurrency Control (801-802)
Phase 9: Queue Monitoring (901-903)
Phase 10: Timeout Detection (1001-1004)
Phase 11: Schedulers (1101-1104)
Phase 12: Guardians (1201)
```

### Exact File Sequence:

```
001_schema_match_history_tables.sql
002_schema_queue_columns.sql
003_schema_logging_table.sql
004_schema_queue_metrics_table.sql
1301_log_event_helper.sql                    ← Apply early
101_state_machine_enum.sql
102_state_machine_transition.sql
103_validate_transition.sql
104_determine_reconnect_state.sql
105_execute_transition.sql
401_calculate_fairness_score.sql              ← Apply before matching
402_apply_fairness_boost.sql
403_preference_expansion.sql
203_is_user_already_matched.sql               ← Helpers first
205_validate_gender_compatibility.sql
207_is_matchable.sql
204_create_match_atomic.sql                   ← Then validators
202_find_guaranteed_match_strict.sql          ← Then finders
206_find_candidate.sql
201_unified_matching_engine.sql               ← Finally main engine
301_queue_join.sql
302_queue_remove.sql
501_heartbeat_update.sql
502_handle_user_offline.sql
503_finalize_user_offline.sql
504_cleanup_expired_soft_offline.sql
601_submit_vote.sql
602_handle_idle_voter.sql
701_complete_reveal.sql
702_handle_reveal_timeout.sql
801_matching_lock.sql
802_matching_orchestrator.sql
901_collect_queue_metrics.sql
902_gender_ratio_balancing.sql
903_monitor_queue_size.sql
1001_detect_spin_timeout.sql
1002_detect_reveal_timeout.sql
1003_detect_vote_timeout.sql
1004_check_user_timeouts.sql
1101_check_vote_timeouts.sql
1102_check_reveal_timeouts.sql
1103_scheduler_setup.sql
1104_scheduler_health_check.sql
1201_guardian_queue_consistency.sql
```

---

## Implementation Script

Create a script to apply all migrations in order:

```bash
#!/bin/bash
# apply-blueprint-migrations.sh

set -e  # Exit on error

DB_URL="${DATABASE_URL:-postgresql://user:pass@localhost:5432/dbname}"

MIGRATIONS=(
  "001_schema_match_history_tables.sql"
  "002_schema_queue_columns.sql"
  "003_schema_logging_table.sql"
  "004_schema_queue_metrics_table.sql"
  "1301_log_event_helper.sql"
  "101_state_machine_enum.sql"
  "102_state_machine_transition.sql"
  "103_validate_transition.sql"
  "104_determine_reconnect_state.sql"
  "105_execute_transition.sql"
  "401_calculate_fairness_score.sql"
  "402_apply_fairness_boost.sql"
  "403_preference_expansion.sql"
  "203_is_user_already_matched.sql"
  "205_validate_gender_compatibility.sql"
  "207_is_matchable.sql"
  "204_create_match_atomic.sql"
  "202_find_guaranteed_match_strict.sql"
  "206_find_candidate.sql"
  "201_unified_matching_engine.sql"
  "301_queue_join.sql"
  "302_queue_remove.sql"
  "501_heartbeat_update.sql"
  "502_handle_user_offline.sql"
  "503_finalize_user_offline.sql"
  "504_cleanup_expired_soft_offline.sql"
  "601_submit_vote.sql"
  "602_handle_idle_voter.sql"
  "701_complete_reveal.sql"
  "702_handle_reveal_timeout.sql"
  "801_matching_lock.sql"
  "802_matching_orchestrator.sql"
  "901_collect_queue_metrics.sql"
  "902_gender_ratio_balancing.sql"
  "903_monitor_queue_size.sql"
  "1001_detect_spin_timeout.sql"
  "1002_detect_reveal_timeout.sql"
  "1003_detect_vote_timeout.sql"
  "1004_check_user_timeouts.sql"
  "1101_check_vote_timeouts.sql"
  "1102_check_reveal_timeouts.sql"
  "1103_scheduler_setup.sql"
  "1104_scheduler_health_check.sql"
  "1201_guardian_queue_consistency.sql"
)

echo "Starting blueprint migration..."
echo "Database: $DB_URL"
echo ""

for file in "${MIGRATIONS[@]}"; do
  echo "Applying: $file"
  psql "$DB_URL" -f "supabase/migrations/blueprint/$file" || {
    echo "ERROR: Failed to apply $file"
    exit 1
  }
  echo "✓ Applied: $file"
  echo ""
done

echo "✅ All migrations applied successfully!"
```

---

## Testing After Each Phase

After applying each phase, run these tests:

### Phase 0 Test:
```sql
-- Verify all tables exist
SELECT COUNT(*) FROM match_history;
SELECT COUNT(*) FROM yes_yes_pairs;
SELECT COUNT(*) FROM spark_event_log;
SELECT COUNT(*) FROM queue_metrics;
```

### Phase 1 Test:
```sql
-- Test state machine
SELECT state_machine_transition('test-user-id'::UUID, 'spin_start', '{}'::JSONB);
```

### Phase 2 Test:
```sql
-- Test matching helpers
SELECT is_user_online('test-user-id'::UUID);
SELECT is_matchable('test-user-id'::UUID);
SELECT is_user_already_matched('test-user-id'::UUID);
```

### Phase 3 Test:
```sql
-- Test queue operations (with test user)
SELECT queue_join('test-user-id'::UUID, '{}'::JSONB);
```

### Phase 4 Test:
```sql
-- Test fairness
SELECT calculate_fairness_score('test-user-id'::UUID);
```

### Phase 5-13 Tests:
```sql
-- Test each function individually
SELECT heartbeat_update('test-user-id'::UUID);
SELECT collect_queue_metrics();
SELECT check_scheduler_health();
```

---

## Critical Dependencies Map

```
Phase 0 (Schema)
  ↓
Phase 13 (Logging) ← Used by almost everything
  ↓
Phase 1 (State Machine) ← Used by queue, matching, voting, reveal
  ↓
Phase 4 (Fairness) ← Used by matching, queue
  ↓
Phase 2 (Matching) ← Uses: State Machine, Fairness, Helpers
  ↓
Phase 3 (Queue) ← Uses: State Machine, Fairness
  ↓
Phase 5 (Heartbeat) ← Uses: State Machine, Queue, Fairness
  ↓
Phase 6 (Voting) ← Uses: State Machine, Fairness, Queue
  ↓
Phase 7 (Reveal) ← Uses: State Machine, Fairness, Queue
  ↓
Phase 8 (Concurrency) ← Uses: Matching
  ↓
Phase 9 (Monitoring) ← Uses: Fairness, Logging
  ↓
Phase 10 (Timeouts) ← Uses: State Machine, Voting, Reveal
  ↓
Phase 11 (Schedulers) ← Uses: Everything
  ↓
Phase 12 (Guardians) ← Uses: Logging
```

---

## Rollback Strategy

If you need to rollback:

1. **Unschedule all cron jobs** (from Phase 11):
```sql
SELECT cron.unschedule('cleanup-soft-offline');
SELECT cron.unschedule('check-vote-timeouts');
SELECT cron.unschedule('check-reveal-timeouts');
SELECT cron.unschedule('queue-monitoring');
SELECT cron.unschedule('gender-balancing');
SELECT cron.unschedule('queue-size-monitoring');
SELECT cron.unschedule('matching-orchestrator');
SELECT cron.unschedule('guardian-queue-consistency');
```

2. **Drop functions in reverse order** (Phase 12 → Phase 0)

3. **Drop tables** (Phase 0)

See individual phase rollback sections above for exact SQL.

---

## Post-Implementation Checklist

After applying all migrations:

- [ ] All 44 files applied successfully
- [ ] All functions exist (verify with `SELECT proname FROM pg_proc WHERE proname IN (...)`)
- [ ] All tables exist (verify with `SELECT table_name FROM information_schema.tables`)
- [ ] All indexes exist (verify with `SELECT indexname FROM pg_indexes`)
- [ ] Schedulers configured (verify with `SELECT check_scheduler_health()`)
- [ ] Test each major function individually
- [ ] Monitor logs for errors
- [ ] Update frontend to use new API contract
- [ ] Gradually migrate users (see `MIGRATION_STRATEGY.md`)

---

## Troubleshooting

### Error: "function does not exist"
- **Cause**: Applied files out of order or missing dependency
- **Fix**: Check dependencies and apply missing files

### Error: "type does not exist"
- **Cause**: `user_matching_state` enum not created
- **Fix**: Apply `101_state_machine_enum.sql` first

### Error: "relation does not exist"
- **Cause**: Schema tables not created
- **Fix**: Apply Phase 0 files first

### Error: "permission denied"
- **Cause**: Functions need `SECURITY DEFINER`
- **Fix**: Verify function definitions include `SECURITY DEFINER`

### Error: "statement timeout"
- **Cause**: Function taking too long
- **Fix**: Check `statement_timeout` settings in function definitions

---

## Next Steps

1. **Review this guide** - Understand the order and dependencies
2. **Test in staging** - Apply to a test database first
3. **Apply to production** - Use phased migration strategy (see `MIGRATION_STRATEGY.md`)
4. **Monitor closely** - Watch for errors and performance issues
5. **Update frontend** - Switch to new API contract gradually

---

**Remember**: The current backend remains untouched. These migrations create a parallel system that can be gradually migrated to. See `MIGRATION_STRATEGY.md` for the full migration plan.

