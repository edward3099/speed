# Spinning Logic Guardians - Documentation

## Overview

The Spinning Logic Guardians are a set of database functions that act as **traffic controllers** and **wardens** for the matching/spinning system. They continuously monitor and enforce the core invariants described in `matching_logic.md`, ensuring the system remains compliant with the design principles.

## Core Principles Enforced

Based on `matching_logic.md`, the guardians enforce:

1. **No spin fails** - Every spin leads to a pairing
2. **No timeouts** - Users stay matchable until paired
3. **No user left out** - Everyone eventually gets matched
4. **Proper state transitions** - spin_active → queue_waiting → vote_active
5. **Fairness** - Long-waiting users get priority
6. **Rule compliance** - Gender, preferences, blocked users
7. **No duplicates** - No user can appear for more than one person
8. **Voting behavior** - Proper yes/respin handling with priority boosts

## Guardian Functions

### 1. `guardian_ensure_no_failed_spins()`

**Purpose**: Ensures "No spin fails. Every spin leads to a pairing."

**What it does**:
- Monitors users in `spin_active`/`queue_waiting` for >30 seconds
- Forces matching attempts using `spark_process_matching` with Tier 3 (guaranteed match)
- Logs successful forced matches and warnings for failed attempts

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of unmatched users checked and forced matches created

---

### 2. `guardian_enforce_state_transitions()`

**Purpose**: Ensures proper state transitions throughout the matching lifecycle.

**What it does**:
- Finds users in `vote_active` without a pending match → moves to `spin_active`
- Finds users with pending matches but not in `vote_active` → moves to `vote_active`
- Corrects invalid state combinations

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of corrections made

---

### 3. `guardian_enforce_fairness()`

**Purpose**: Ensures "Fair matching for all users. Everyone eventually reaches front of queue."

**What it does**:
- Calculates average wait time
- Boosts fairness scores for users waiting longer than average
- Resets `skip_count` for users who have been skipped >5 times and waited >30 seconds
- Formula: `fairness_boost = (wait_seconds - avg_wait_time) / 10.0`, minimum 1.0

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of boosted users, reset skips, and average wait time

---

### 4. `guardian_prevent_duplicates()`

**Purpose**: Ensures "No user can appear for more than one person at the same time."

**What it does**:
- Finds users with multiple pending matches
- Keeps the most recent match, removes others
- Resets users back to `spin_active` if they were in `vote_active` for removed matches

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of conflicts found and resolved

---

### 5. `guardian_enforce_voting_behavior()`

**Purpose**: Ensures proper voting behavior with priority boosts for yes voters.

**What it does**:
- Finds completed matches (status != 'pending') that need voting behavior enforcement
- Applies priority boost (+10.0 fairness score) to yes voters when other voted respin
- Re-enters users who voted respin back into queue if they're not already there
- Logs all voting behavior actions

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of processed votes and boosts applied

---

### 6. `guardian_enforce_online_status()` ⚠️ **CRITICAL**

**Purpose**: Ensures users can only match with online users.

**What it does**:
- Finds pending matches where one or both users are offline
- **Breaks invalid matches** by deleting them
- Resets both users back to `spin_active` if they were in `vote_active`
- Logs all broken matches

**When it runs**: Every 10 seconds (via orchestrator) - **Runs FIRST** to prevent invalid matches

**Returns**: JSONB with count of invalid matches found and broken

**Why it's critical**: This prevents the exact issue you're experiencing - matches with offline users. It runs first in the orchestrator to catch and break these matches immediately.

---

### 7. `guardian_enforce_preference_expansion()`

**Purpose**: Ensures "Preferences expand only when needed and in small steps."

**What it does**:
- Monitors users waiting >60 seconds
- Triggers preference expansion via `spark_process_matching` (which uses Tier 3)
- Logs expansion actions

**When it runs**: Every 10 seconds (via orchestrator)

**Returns**: JSONB with count of users whose preferences were expanded

---

### 8. `guardian_orchestrator()`

**Purpose**: Master orchestrator that runs all guardians in optimal order.

**Execution Order**:
1. **`guardian_enforce_online_status()`** - ⚠️ **CRITICAL: Runs FIRST** to break matches with offline users
2. `guardian_prevent_duplicates()` - Critical for data integrity
3. `guardian_enforce_state_transitions()` - Fix invalid states
4. `guardian_enforce_fairness()` - Boost long-waiting users
5. `guardian_enforce_preference_expansion()` - Expand preferences for long-waiting users
6. `guardian_ensure_no_failed_spins()` - Force matches for long-waiting users
7. `guardian_enforce_voting_behavior()` - Apply boosts, re-enter users

**When it runs**: 
- Automatically every 10 seconds via `pg_cron`
- Manually via `POST /api/guardians`

**Returns**: JSONB with results from all guardians

---

## Scheduling

The guardians are scheduled to run automatically via `pg_cron`:

```sql
-- Runs every 10 seconds
SELECT cron.schedule(
  'guardian-orchestrator',
  '*/10 * * * * *',
  'SELECT guardian_orchestrator();'
);
```

If `pg_cron` is not available, you can:
1. Use the Next.js API route: `POST /api/guardians`
2. Set up an external cron job to call the API route
3. Call `guardian_orchestrator()` manually via Supabase SQL Editor

---

## API Endpoints

### `POST /api/guardians`

Manually triggers the master guardian orchestrator.

**Response**:
```json
{
  "message": "Guardian orchestrator executed",
  "results": {
    "prevent_duplicates": { ... },
    "enforce_state_transitions": { ... },
    "enforce_fairness": { ... },
    "enforce_preference_expansion": { ... },
    "ensure_no_failed_spins": { ... },
    "enforce_voting_behavior": { ... },
    "summary": {
      "timestamp": "...",
      "guardians_run": 6,
      "status": "complete"
    }
  }
}
```

### `GET /api/guardians`

Returns information about all available guardians.

**Response**:
```json
{
  "guardians": [
    {
      "name": "guardian_ensure_no_failed_spins",
      "purpose": "Ensures no spin fails...",
      "invariant": "Every spin leads to a pairing"
    },
    ...
  ],
  "schedule": "Master guardian orchestrator runs every 10 seconds via pg_cron",
  "manual_trigger": "POST /api/guardians to trigger manually"
}
```

---

## Monitoring

All guardian actions are logged via `spark_log_event` and `spark_log_error`:

- **Event Type**: `guardian_action`, `guardian_warning`
- **Event Category**: Specific to each guardian (e.g., `forced_match`, `state_correction`)
- **Related Table**: `matches`, `matching_queue`, etc.
- **Triggered By**: `GUARDIAN`
- **Severity**: `INFO`, `WARNING`, `ERROR`

You can query guardian logs:
```sql
SELECT * FROM spark_event_log
WHERE triggered_by = 'GUARDIAN'
ORDER BY created_at DESC
LIMIT 100;
```

---

## Integration with Existing Systems

The guardians work alongside existing queue management functions:

- **`validate_match_rules()`** - Rule enforcement (called by matching functions)
- **`validate_queue_integrity()`** - Queue validation (called by `manage_queue_system()`)
- **`manage_queue_system()`** - Queue management (runs every 4 seconds)
- **`guardian_orchestrator()`** - Guardian orchestrator (runs every 10 seconds)

The guardians focus on **enforcing invariants** and **correcting violations**, while the queue management functions focus on **optimization** and **health monitoring**.

---

## Best Practices

1. **Monitor Guardian Logs**: Regularly check `spark_event_log` for guardian actions
2. **Adjust Thresholds**: If needed, adjust wait time thresholds (30s, 60s) based on your system's performance
3. **Manual Triggers**: Use `POST /api/guardians` for testing or emergency situations
4. **Combine with Queue Management**: The guardians complement `manage_queue_system()` - both should run

---

## Troubleshooting

### Guardians not running automatically

If `pg_cron` is not available:
1. Check if `pg_cron` extension is installed: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Use the API route as a backup: Set up an external cron to call `POST /api/guardians` every 10 seconds

### Too many forced matches

If `guardian_ensure_no_failed_spins()` is creating too many forced matches:
- Check if the matching logic (`spark_process_matching`) is working correctly
- Verify that preference expansion is working (Tier 3 matching)
- Check for gender imbalances or other queue issues

### State transition corrections

If `guardian_enforce_state_transitions()` is making many corrections:
- This might indicate a bug in the matching logic or frontend
- Check logs to see what states are being corrected
- Verify that `create_pair_atomic()` is properly setting `vote_active` status

---

## Summary

The Spinning Logic Guardians ensure that your matching system remains compliant with the design principles in `matching_logic.md`. They act as **traffic controllers** and **wardens**, continuously monitoring and enforcing:

- ✅ No spin fails
- ✅ No timeouts
- ✅ No user left out
- ✅ Proper state transitions
- ✅ Fairness
- ✅ No duplicates
- ✅ Proper voting behavior
- ✅ Preference expansion

By running every 10 seconds, they provide continuous protection and enforcement, ensuring a **calm, predictable, and user-friendly** experience.

