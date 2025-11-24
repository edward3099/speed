# Debugging Architecture Documentation

This document describes the comprehensive debugging architecture implemented for the speed dating matching system. The architecture consists of 90 components organized in 6 tiers, with Tier 1 (components 1-15) being critical for system correctness.

## Overview

The debugging architecture provides:
- **State Validation**: Automatic detection of illegal states
- **Event Logging**: Full timeline of all events for debugging
- **State Snapshots**: Before/after snapshots for troubleshooting
- **Race Condition Detection**: Detection of concurrent operations
- **Lock Tracking**: Monitoring of pairing locks
- **Heartbeat Management**: Tracking user activity and detecting disconnects
- **Invariant Checking**: Validation of absolute system truths
- **Time Synchronization**: Unified clock system for all timers

## Installation

### 1. Run Database Migrations

Apply the database migrations in order:

```bash
# From the supabase/migrations directory
supabase migration apply 20250101_debugging_architecture
supabase migration apply 20250102_debugging_triggers
```

Or if using Supabase CLI:
```bash
supabase db push
```

### 2. Enable Debugging in Your Application

The debugging system can be enabled/disabled based on environment:

```typescript
import { createDebugService } from '@/lib/debug/debug-service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(...);
const debugService = createDebugService(
  supabase,
  process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true'
);
```

## Core Components

### Component #1: State Validator

The state validator automatically checks for illegal states after each database update.

**Database Function**: `debug_validate_state()`

**Usage**:
```typescript
const errors = await debugService.validateState();
if (errors.length > 0) {
  console.error('Validation errors:', errors);
}
```

**Automatic**: Triggers automatically run validation after state changes.

### Component #2: Atomic Pairing

Ensures pairing operations are atomic and prevent duplicate pairs.

**Database Function**: `debug_process_matching_atomic(p_user_id)`

**Usage**:
```typescript
// Use the atomic wrapper instead of process_matching directly
const matchId = await supabase.rpc('debug_process_matching_atomic', {
  p_user_id: userId
});
```

**Features**:
- Automatic lock creation
- Race condition detection
- Event logging

### Component #3: Strict Queue Enforcement

Guards prevent duplicate queue entries and invalid state transitions.

**Database Function**: `debug_validate_queue_entry(p_user_id, p_status, p_operation)`

**Automatic**: Called by triggers before queue insert/update.

### Component #4: Heartbeat Manager

Tracks user activity and cleans up disconnected users.

**Usage**:
```typescript
// Update heartbeat periodically (every 30 seconds)
await debugService.updateHeartbeat(userId);

// Cleanup disconnected users (run periodically)
await supabase.rpc('debug_heartbeat_cleanup', { p_timeout_seconds: 60 });
```

### Component #5: Invariant Rules and Tests

Defines absolute truths the system must follow.

**Location**: `src/lib/debug/invariants.ts`

**Usage**:
```typescript
import { checkAllInvariants, ALL_INVARIANTS } from '@/lib/debug/invariants';

const systemState = {
  queue: [...],
  pairs: [...],
  votes: [...],
  locks: [...],
  users: [...]
};

const results = checkAllInvariants(systemState);
results.forEach(result => {
  if (!result.valid) {
    console.error(`Invariant violation: ${result.message}`);
  }
});
```

### Component #6: Sanity Guards

Input validation at RPC entry points.

**Automatic**: Built into database functions.

### Component #7: State Watcher

Automatically logs all state changes.

**Automatic**: Triggers on `matching_queue` table automatically log changes.

### Component #8: Lock Tracker

Tracks creation and deletion of locks.

**Usage**:
```typescript
// Get active locks
const locks = await debugService.getActiveLocks();
// Or for specific user
const userLocks = await debugService.getActiveLocks(userId);

// Create lock
const lockId = await debugService.createPairingLock({
  userId: userId,
  timeoutSeconds: 30
});

// Release lock
await debugService.releaseLock(lockId);
```

### Component #9: Event Log

Full timeline of all events.

**Usage**:
```typescript
// Log an event
await debugService.logEvent({
  eventType: 'user_action',
  eventData: { action: 'spin', timestamp: Date.now() },
  userId: userId,
  severity: 'INFO'
});

// Get recent events
const events = await debugService.getRecentEvents({
  limit: 100,
  userId: userId,
  severity: 'ERROR'
});
```

### Component #10: Snapshot Diff System

Before/after snapshots for troubleshooting.

**Automatic**: Triggers automatically create snapshots on state changes.

**Usage**:
```typescript
// Get snapshots for a record
const snapshots = await debugService.getSnapshots({
  tableName: 'matching_queue',
  recordId: recordId,
  limit: 10
});
```

### Component #11: Event Ordering Verifier

Validates event sequences.

**Usage**:
```typescript
const isValid = await debugService.validateEventSequence({
  userId: userId,
  currentEvent: 'vote_cast',
  previousEvents: ['pairing_success']
});
```

### Component #12: Orphan State Scanner

Scans for invalid state combinations.

**Usage**:
```typescript
const orphanCount = await debugService.scanOrphanStates();
if (orphanCount > 0) {
  console.warn(`Found ${orphanCount} orphaned states`);
}
```

### Component #13: Synchronised Time Engine

Unified clock system for all timers.

**Usage**:
```typescript
// Start a timer
const timerId = await debugService.startTimer({
  timerType: 'vote',
  userId: userId,
  timeoutMs: 10000
});

// Complete timer
await debugService.completeTimer(timerId, 'completed');
```

### Component #14: Race Condition Sentinel

Detects overlapping calls to pairing/vote logic.

**Automatic**: Built into atomic pairing function.

### Component #15: State Rollback Journal

Stores copies of previous state for rollback.

**Automatic**: Triggers automatically store rollback data.

**Usage**:
```typescript
// Rollback is stored automatically, but you can query it
const { data } = await supabase
  .from('debug_rollback_journal')
  .select('*')
  .eq('table_name', 'matching_queue')
  .eq('record_id', recordId)
  .order('timestamp', { ascending: false })
  .limit(1);
```

## Integration with Existing Code

### Wrapping RPC Calls

To enable debugging for your existing RPC calls, wrap them:

```typescript
// Before
const { data } = await supabase.rpc('process_matching', { p_user_id: userId });

// After (with debugging)
const { data } = await supabase.rpc('debug_process_matching_atomic', { p_user_id: userId });
```

### Adding Event Logging

Log important events in your application code:

```typescript
await debugService.logEvent({
  eventType: 'user_spin',
  eventData: { timestamp: Date.now() },
  userId: currentUser.id,
  severity: 'INFO'
});
```

### Adding Heartbeat Updates

Update heartbeat on user activity:

```typescript
// In your component or hook
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentUser) {
      await debugService.updateHeartbeat(currentUser.id);
    }
  }, 30000); // Every 30 seconds

  return () => clearInterval(interval);
}, [currentUser]);
```

## Database Tables

The debugging architecture creates the following tables:

- `debug_event_log` - All events
- `debug_state_snapshots` - State snapshots
- `debug_rollback_journal` - Rollback data
- `debug_validation_errors` - Validation errors
- `debug_lock_tracker` - Active locks
- `debug_race_conditions` - Race condition detections
- `debug_event_ordering_errors` - Event ordering violations
- `debug_orphan_states` - Orphaned states
- `debug_time_events` - Timer events
- `debug_heartbeat_tracker` - User heartbeat tracking

## Scheduled Jobs

For production, set up scheduled jobs to run maintenance tasks:

```sql
-- Using pg_cron extension
SELECT cron.schedule('debug-scan-orphans', '*/5 * * * *', 'SELECT debug_scan_orphan_states();');
SELECT cron.schedule('debug-heartbeat-cleanup', '*/30 * * * * *', 'SELECT debug_heartbeat_cleanup(60);');
SELECT cron.schedule('debug-validate-state', '* * * * *', 'SELECT debug_validate_state();');
```

## Querying Debug Data

### Get Recent Validation Errors

```sql
SELECT * FROM debug_validation_errors
WHERE resolved_at IS NULL
ORDER BY detected_at DESC
LIMIT 100;
```

### Get Events for a User

```sql
SELECT * FROM debug_event_log
WHERE user_id = 'user-uuid-here'
ORDER BY timestamp DESC
LIMIT 50;
```

### Get State Snapshots for a Record

```sql
SELECT * FROM debug_state_snapshots
WHERE table_name = 'matching_queue'
AND record_id = 'record-uuid-here'
ORDER BY timestamp DESC;
```

### Get Active Locks

```sql
SELECT * FROM debug_lock_tracker
WHERE released_at IS NULL
ORDER BY created_at DESC;
```

## Performance Considerations

- **Event Logging**: Can generate significant data. Consider:
  - Periodic cleanup of old events
  - Logging only in development or when explicitly enabled
  - Using appropriate log levels (INFO, WARNING, ERROR)

- **State Snapshots**: Can be memory-intensive. Consider:
  - Limiting snapshot retention
  - Only storing snapshots for important events
  - Compressing snapshot data

- **Validation**: Runs automatically on triggers. Consider:
  - Optimizing validation queries
  - Running heavy validations asynchronously
  - Batching validation checks

## Troubleshooting

### Debugging is not working

1. Check that migrations have been applied
2. Verify that `DEBUG_ENABLED` environment variable is set
3. Check database logs for errors
4. Ensure RLS policies allow access to debug tables

### Too many validation errors

1. Check for systemic issues in your matching logic
2. Review invariants to ensure they're correctly defined
3. Consider adjusting validation severity levels
4. Run orphan state scanner to find root causes

### Performance issues

1. Review event logging frequency
2. Consider disabling non-critical validations
3. Optimize database queries
4. Add indexes to frequently queried debug tables

## Next Steps

This implementation covers Tier 1 (critical) components. For Tier 2-6 components, refer to the "Debugging Architecture final.md" document and implement additional components as needed.

## Support

For questions or issues with the debugging architecture, refer to:
- The debugging architecture specification document
- Database function comments
- TypeScript type definitions in `src/lib/debug/`

