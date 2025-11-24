# Debugging Toolkit for Realtime Matching Engine

A comprehensive debugging toolkit for monitoring, analyzing, and debugging the real-time matching engine. This toolkit provides 9 integrated modules for complete observability and control over the matching system.

## Quick Start

```typescript
import DebugToolkit from '@/lib/debug';

// Get current state
const state = DebugToolkit.getState();

// Get debug feed
const feed = DebugToolkit.getFeed();

// Validate state
const validation = DebugToolkit.validate();

// Create checkpoint
const checkpointId = DebugToolkit.checkpoint('Before testing');

// Run simulation
const result = await DebugToolkit.simulate([
  { type: 'spin', user: 1 },
  { type: 'spin', user: 2 },
  { type: 'vote', user: 1, value: 'yes' },
  { type: 'vote', user: 2, value: 'yes' }
]);
```

## Modules

### Module 1: State Management (debugState)

Returns the entire internal state in structured JSON format.

```typescript
import { debugState, addToQueue, createPair } from '@/lib/debug';

// Get complete state
const state = debugState();
console.log(state);
// {
//   queue: [...],
//   pairs: {...},
//   voteActive: {...},
//   videoActive: {...},
//   locks: {...},
//   heartbeat: {...},
//   fairness: {...},
//   timers: [...],
//   idle: {...},
//   serverTimestamp: 1234567890
// }

// Add user to queue
addToQueue('user123', { minAge: 18, maxAge: 30 });

// Create a pair
const pairId = createPair('user1', 'user2');
```

### Module 2: Structured Logging

Logs every event as a structured object with before/after states.

```typescript
import { logEvent, logError, logDebug, getLogs } from '@/lib/debug';

// Log an event
logEvent({
  type: 'spinStart',
  user: 'user123',
  beforeState: debugState(),
  afterState: debugState(),
  metadata: { preferences: {...} }
});

// Log an error
logError({
  type: 'matching_failed',
  error: new Error('No compatible users'),
  user: 'user123'
});

// Get recent logs
const logs = getLogs(100);
const errors = getErrors(10);
```

### Module 3: State Snapshots

Automatic before/after state snapshots with ring buffer storage.

```typescript
import { captureEvent, getSnapshots, compareSnapshots } from '@/lib/debug';

// Capture event with automatic snapshots
const { result, snapshot } = await captureEvent(
  'spin',
  'user123',
  () => {
    // Your event logic here
    addToQueue('user123');
  },
  { metadata: 'optional' }
);

// Get snapshots
const snapshots = getSnapshots(50);

// Compare snapshots
const comparison = compareSnapshots('snap_id1', 'snap_id2');
```

### Module 4: Validators

Micro checks that run after every event to ensure state consistency.

```typescript
import { validateState, validateAfterEvent, getValidationHistory } from '@/lib/debug';

// Validate current state
const validation = validateState();
if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
}

// Validate after an event
const result = validateAfterEvent('spin', beforeState, afterState);

// Get validation history
const history = getValidationHistory(20);
```

Validators check:
- User cannot be in queue and in pair
- User cannot appear twice in queue
- Symmetric pairs (if A has partner B, B must have partner A)
- Vote active users must be in pairs
- Locked users must be in pairs
- Heartbeat consistency
- No conflicting states

### Module 5: Simulation

Run scripted scenarios for testing.

```typescript
import { simulate, runScenario, runChaos, scenarios } from '@/lib/debug';

// Run custom simulation
const result = await simulate([
  { type: 'spin', user: 1 },
  { type: 'spin', user: 2 },
  { type: 'vote', user: 1, value: 'yes' },
  { type: 'vote', user: 2, value: 'yes' },
  { type: 'disconnect', user: 2, delay: 1000 },
  { type: 'reconnect', user: 2, delay: 2000 }
]);

// Run predefined scenario
const scenarioResult = await runScenario(scenarios.basicMatch);

// Run chaos testing
const chaosResult = await runChaos(10, 100); // 10 users, 100 events
```

### Module 6: Event Replay

Replay events from logs to reconstruct state.

```typescript
import { replay, replayFromMemory } from '@/lib/debug';

// Replay from file
const result = await replay('logs/event_log.jsonl', {
  validateEachStep: true,
  stopOnError: false,
  compareSnapshots: true,
  verbose: true
});

// Check for divergence
if (!result.success) {
  console.error('Replay failed:', result.errors);
  console.warn('Divergences:', result.divergences);
}
```

### Module 7: Time Management

Unified time management for all timers.

```typescript
import { 
  getTime, 
  pauseTime, 
  resumeTime, 
  setSpeedMultiplier,
  setVoteTimer,
  clearAllTimers 
} from '@/lib/debug';

// Get synchronized time
const now = getTime();

// Control time for testing
pauseTime();
// Run tests...
resumeTime();

// Speed up time (2x speed)
setSpeedMultiplier(2);

// Set specific timers
const timerId = setVoteTimer('pair123', () => {
  console.log('Vote timeout!');
});

// Clear all timers
clearAllTimers();
```

### Module 8: Dashboard Data

Get compact debugging data for monitoring.

```typescript
import { getDebugFeed, getCompactFeed } from '@/lib/debug';

// Get full debug feed
const feed = getDebugFeed();
console.log({
  queue: feed.currentQueue,
  pairs: feed.currentPairs,
  health: feed.systemHealth,
  stats: feed.stats
});

// Get compact feed
const compact = getCompactFeed();
// {
//   queue: 5,
//   pairs: 2,
//   health: 'warning',
//   issues: ['User xyz waiting 5 minutes'],
//   stats: { matchRate: 80, avgWait: 30 }
// }
```

### Module 9: Freeze & Rollback

Save and restore state snapshots.

```typescript
import { 
  freezeState, 
  rollbackTo, 
  createCheckpoint,
  listFrozenStates 
} from '@/lib/debug';

// Freeze current state
freezeState('before_test', 'Pre-test state', 'About to run integration test');

// Create checkpoint
const checkpointId = createCheckpoint('Testing milestone');

// Run tests that might break things...

// Rollback if needed
rollbackTo('before_test');
// or
rollbackToLastCheckpoint();

// List all frozen states
const states = listFrozenStates();
```

## Common Usage Patterns

### Pattern 1: Debug a Matching Issue

```typescript
// 1. Create checkpoint before investigation
const checkpoint = DebugToolkit.checkpoint('Debug start');

// 2. Get current state and validate
const state = DebugToolkit.getState();
const validation = DebugToolkit.validate();

// 3. Check recent events
const logs = getLogs(50);
const errors = getErrors(10);

// 4. Look for specific user
const userLogs = getLogsByUser('problematic_user');

// 5. Simulate the issue
await simulate([
  { type: 'spin', user: 'problematic_user' },
  // ... reproduce steps
]);

// 6. Rollback when done
DebugToolkit.rollback();
```

### Pattern 2: Performance Testing

```typescript
// 1. Set up time control
setSpeedMultiplier(10); // 10x speed

// 2. Create checkpoint
const checkpoint = createCheckpoint('Performance test');

// 3. Run chaos simulation
const result = await runChaos(100, 1000); // 100 users, 1000 events

// 4. Get statistics
const feed = getDebugFeed();
console.log('Match rate:', feed.stats.matchRate);
console.log('Avg wait time:', feed.stats.averageWaitTime);

// 5. Check for issues
const health = feed.systemHealth;
if (health.overallHealth !== 'healthy') {
  console.warn('Issues found:', health.issues);
}

// 6. Reset
DebugToolkit.reset();
```

### Pattern 3: State Verification

```typescript
// Run validation continuously
setInterval(() => {
  const validation = validateState();
  
  if (!validation.isValid) {
    // Log errors and create snapshot
    logError({
      type: 'validation_failed',
      error: validation.errors,
      beforeState: getSnapshots(1)[0]?.beforeState,
      afterState: debugState()
    });
    
    // Create checkpoint for investigation
    createCheckpoint('Validation failure');
  }
}, 1000);
```

### Pattern 4: Event Replay for Debugging

```typescript
// 1. Export current logs
const logs = getLogs();
await flushLogsToFile();

// 2. Reset and replay
DebugToolkit.reset();
const replayResult = await replay('logs/event_log.jsonl', {
  validateEachStep: true,
  stopOnError: true
});

// 3. Find where things went wrong
if (!replayResult.success) {
  const firstError = replayResult.errors[0];
  console.log('Failed at event:', firstError.eventIndex);
  console.log('Error:', firstError.error);
  
  // Compare states
  console.log('Expected:', firstError.expectedState);
  console.log('Actual:', firstError.actualState);
}
```

## Integration with Application

### Setup in your reducer/event handler:

```typescript
import { debugState, logEvent, validateAfterEvent, captureEvent } from '@/lib/debug';

async function handleMatchingEvent(event: any) {
  // Capture event with automatic logging and validation
  const { result, snapshot } = await captureEvent(
    event.type,
    event.userId,
    async () => {
      // Your existing event handling logic
      switch (event.type) {
        case 'spin':
          return handleSpin(event);
        case 'vote':
          return handleVote(event);
        // ... etc
      }
    },
    event.metadata
  );
  
  // Validate after event
  const validation = validateAfterEvent(
    event.type,
    snapshot.beforeState,
    snapshot.afterState
  );
  
  if (!validation.isValid) {
    console.error('State validation failed:', validation.errors);
    // Optionally rollback or alert
  }
  
  return result;
}
```

### Setup periodic health checks:

```typescript
// Health monitoring
setInterval(() => {
  const feed = getCompactFeed();
  
  if (feed.health !== 'healthy') {
    console.warn('System health degraded:', feed.issues);
    
    // Alert or take action
    if (feed.stats.errorRate > 0.1) {
      console.error('High error rate detected');
    }
    
    if (feed.stats.avgWait > 60) {
      console.warn('Long queue wait times');
    }
  }
}, 5000);
```

## Environment Variables

```bash
# Enable debug logging
DEBUG=true

# Log file location
DEBUG_LOG_FILE=logs/event_log.jsonl

# Maximum snapshots to keep
DEBUG_MAX_SNAPSHOTS=200

# Maximum frozen states
DEBUG_MAX_FROZEN_STATES=50
```

## Performance Considerations

- State snapshots are stored in memory (ring buffer of 200)
- Logs are stored in memory (10,000 entries max) and optionally written to file
- Frozen states are limited to 50 by default
- Use `clearLogs()`, `clearSnapshots()`, etc. to free memory
- Disable auto-validation in production with `setAutoValidate(false)`

## Troubleshooting

### Issue: Out of memory
```typescript
// Clear all debug data
DebugToolkit.reset();
```

### Issue: Log file too large
```typescript
// Rotate logs
clearLogs();
await flushLogsToFile(); // Starts fresh log file
```

### Issue: Time-based tests failing
```typescript
// Control time precisely
pauseTime();
// Set up your test state
resumeTime();
```

### Issue: Can't reproduce bug
```typescript
// Use deterministic chaos
setSeed(12345);
const result = await runChaos(10, 100);
// Same seed = same sequence
```

## API Reference

See individual module files for complete API documentation:

- `/core/state.ts` - State management
- `/core/logging.ts` - Logging system
- `/core/snapshots.ts` - Snapshot management
- `/core/validators.ts` - Validation rules
- `/simulation/simulator.ts` - Simulation engine
- `/replay/replay.ts` - Event replay
- `/timing/timeManager.ts` - Time management
- `/dashboard/dataFeeder.ts` - Dashboard data
- `/freeze/freezeRollback.ts` - Freeze/rollback