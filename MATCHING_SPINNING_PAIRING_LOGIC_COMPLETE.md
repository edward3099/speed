# Complete Matching/Spinning/Pairing Logic Documentation

This document contains all the matching, spinning, and pairing logic for the speed dating application. It includes frontend code, database functions, API routes, and supporting components.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Constants & Configuration](#core-constants--configuration)
3. [Frontend Logic - Spin Page](#frontend-logic---spin-page)
4. [Database Functions (SQL)](#database-functions-sql)
5. [API Routes](#api-routes)
6. [UI Components](#ui-components)
7. [Debug & Logging](#debug--logging)

---

## Overview

The matching system ensures:
- **Every spin leads to a pairing** - No empty results
- **Fair matching** - Long-waiting users get priority
- **Gender compatibility** - Males only match with females
- **State transitions** - spin_active → queue_waiting → vote_active → video_date
- **Real-time synchronization** - Both users see synchronized countdown timers

---

## Core Constants & Configuration

### File: `src/lib/constants/locked-state.ts`

```typescript
/**
 * 🔒 LOCKED STATE CONSTANTS
 * 
 * ⚠️ CRITICAL: DO NOT MODIFY WITHOUT REVIEW
 */

export const MATCHING_CONFIG = {
  /** Polling interval for match attempts (milliseconds) */
  POLLING_INTERVAL_MS: 2000,
  /** Maximum retry attempts for partner status check */
  MAX_RETRY_ATTEMPTS: 3,
  /** Delay between retries (milliseconds) */
  RETRY_DELAY_MS: 500,
  /** Tier 1 timeout (seconds) - exact preferences */
  TIER_1_TIMEOUT_SEC: 2,
  /** Tier 2 timeout (seconds) - expanded preferences */
  TIER_2_TIMEOUT_SEC: 10,
  /** Tier 3 - guaranteed match (no timeout) */
  TIER_3_GUARANTEED: true,
} as const

export const MATCHING_STATES = {
  SPIN_ACTIVE: 'spin_active',
  QUEUE_WAITING: 'queue_waiting',
  PAIRED: 'paired',
  VOTE_ACTIVE: 'vote_active',
  VIDEO_DATE: 'video_date',
  ENDED: 'ended',
} as const

export const VALID_STATE_TRANSITIONS = [
  [MATCHING_STATES.SPIN_ACTIVE, MATCHING_STATES.QUEUE_WAITING],
  [MATCHING_STATES.QUEUE_WAITING, MATCHING_STATES.PAIRED],
  [MATCHING_STATES.PAIRED, MATCHING_STATES.VOTE_ACTIVE],
  [MATCHING_STATES.VOTE_ACTIVE, MATCHING_STATES.VIDEO_DATE],
  [MATCHING_STATES.VOTE_ACTIVE, MATCHING_STATES.SPIN_ACTIVE], // Respin
  [MATCHING_STATES.VIDEO_DATE, MATCHING_STATES.ENDED],
] as const

/**
 * Critical RPC Function Names
 * 
 * These must ALWAYS use SPARK wrappers, never direct functions.
 */
export const CRITICAL_RPC_FUNCTIONS = {
  /** Must use spark_join_queue, never join_queue */
  JOIN_QUEUE: 'spark_join_queue',
  /** Must use spark_process_matching, never process_matching */
  PROCESS_MATCHING: 'spark_process_matching',
  /** Must use spark_find_best_match, never find_best_match */
  FIND_BEST_MATCH: 'spark_find_best_match',
  /** Must use spark_create_pair, never create_pair */
  CREATE_PAIR: 'spark_create_pair',
} as const

export function isValidStateTransition(
  from: MatchingState,
  to: MatchingState
): boolean {
  return VALID_STATE_TRANSITIONS.some(
    ([fromState, toState]) => fromState === from && toState === to
  )
}

export function isSparkWrapper(functionName: string): boolean {
  return Object.values(CRITICAL_RPC_FUNCTIONS).includes(
    functionName as CriticalRPCFunction
  )
}
```

---

## Frontend Logic - Spin Page

### File: `src/app/spin/page.tsx`

**Key Functions:**

#### 1. Start Spin Function
```typescript
const startSpin = async () => {
  // 1. Log spin start event
  await logSpinEvent(supabase, 'spinStart', `User ${user.name} pressed spin button`, authUser.id, {...}, 'INFO', true, 'startSpin')

  // 2. Fetch compatible photos for spinning animation (opposite gender)
  const photos = await fetchSpinningPhotos()
  setSpinningPhotos(photos.length > 0 ? photos : [])

  // 3. Clean up any stale matches first
  await supabase.rpc('cleanup_stale_matches')

  // 4. Join the queue (CRITICAL: Must use SPARK wrapper)
  const { data: queueId, error: queueError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, {
    p_user_id: authUser.id,
    p_fairness_boost: 0
  })

  // 5. Process matching - find best match (CRITICAL: Must use SPARK wrapper)
  const { data: matchIdResult, error: matchError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, {
    p_user_id: authUser.id
  })

  // 6. If match found, load partner profile and transition to vote_active
  if (matchId) {
    // Fetch match and partner profile
    // Set matchedPartner, currentMatchId, voteStartedAt
    // Transition to vote_active state
  }
}
```

#### 2. Real-time Match Detection
```typescript
// Set up real-time subscriptions for match detection
useEffect(() => {
  // Subscribe to matches where user is user1_id
  channel1 = supabase
    .channel(`matches-user1-${authUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'matches',
      filter: `user1_id=eq.${authUser.id}`
    }, async (payload) => {
      await handleMatch(payload.new)
    })
    .subscribe()

  // Subscribe to matches where user is user2_id
  channel2 = supabase
    .channel(`matches-user2-${authUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'matches',
      filter: `user2_id=eq.${authUser.id}`
    }, async (payload) => {
      await handleMatch(payload.new)
    })
    .subscribe()
}, [user])
```

#### 3. Periodic Matching Polling (Fallback)
```typescript
// Periodic check for existing matches while spinning (fallback if real-time fails)
useEffect(() => {
  if (!user || !spinning || !isInQueue) return

  const attemptMatchingAndCheck = async () => {
    // Check if user already has an active match
    const { data: existingMatches } = await supabase
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${authUser.id},user2_id.eq.${authUser.id}`)
      .eq('status', 'pending')
      .order('matched_at', { ascending: false })
      .limit(1)

    if (!existingMatch) {
      // 🔒 LOCKED: Matching logic - must use SPARK wrapper
      const { data: matchId, error: matchError } = await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, {
        p_user_id: authUser.id
      })
    }
  }

  // Try matching and check for existing matches every 2 seconds while spinning
  const matchingConfig = getMatchingConfig()
  const interval = setInterval(attemptMatchingAndCheck, matchingConfig.pollingInterval)

  return () => clearInterval(interval)
}, [user, spinning, isInQueue, supabase])
```

#### 4. Vote Handling
```typescript
const handleVote = async (voteType: "yes" | "pass") => {
  // Save vote to database
  const { error: voteError } = await supabase
    .from('votes')
    .upsert({
      voter_id: authUser.id,
      profile_id: matchedPartner.id,
      vote_type: voteType
    }, {
      onConflict: 'voter_id,profile_id',
      ignoreDuplicates: false
    })

  if (voteType === "yes") {
    // User voted yes - wait for partner's vote
    setWaitingForMatch(true)
    // Stay in voting window until countdown completes
  } else {
    // Pass/Respin vote
    // Check if other user already voted yes
    // If yes, give fairness boost (+8) to yes voter
    // Delete match and automatically re-queue
    await startSpin() // Automatically respin
  }
}
```

#### 5. Countdown Completion Handler
```typescript
const handleCountdownComplete = async () => {
  // If user voted yes and waiting for match, check if match was created
  if (userVote === "yes" && waitingForMatch && currentMatchId) {
    // Check if both voted yes (match should be ready for video date)
    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .or(`and(voter_id.eq.${authUser.id},profile_id.eq.${matchedPartner?.id}),and(voter_id.eq.${matchedPartner?.id},profile_id.eq.${authUser.id})`)
      .eq('vote_type', 'yes')

    if (votes && votes.length === 2) {
      // Both voted yes - redirect to video date
      router.push(`/video-date?matchId=${currentMatchId}`)
    } else {
      // Only this user voted yes, other user didn't vote (idle)
      // Re-queue this yes voter automatically with +8 fairness boost
      await supabase.rpc(CRITICAL_RPC_FUNCTIONS.JOIN_QUEUE, { p_user_id: authUser.id, p_fairness_boost: 8 })
      await supabase.rpc(CRITICAL_RPC_FUNCTIONS.PROCESS_MATCHING, { p_user_id: authUser.id })
      // Keep spinning state active
    }
  }

  // If user didn't vote within 10 seconds (idle voter)
  if (!userVote) {
    // Remove idle voter from queue
    await supabase.rpc('remove_from_queue', { p_user_id: authUser.id })
    // Reset UI - user must press spin again
  }
}
```

**Note:** The full `spin/page.tsx` file is 3689 lines. The above shows the critical functions. The complete file includes:
- Profile fetching and filtering
- Queue management
- Match detection (real-time + polling)
- Vote handling
- State management
- UI rendering with animations
- Error handling and logging

---

## Database Functions (SQL)

### 1. Core Pairing Logic

**File: `supabase/migrations/20250111_enhance_pairing_logic_comprehensive.sql`**

#### create_pair_atomic
Creates a match atomically with retry logic and lock handling:
- Uses FOR UPDATE NOWAIT to lock both users
- Retries up to 5 times with exponential backoff
- Validates both users are in matchable state
- Creates match and updates both users to vote_active
- Returns match_id on success, NULL on failure

#### find_best_match_v2
Finds the best match candidate using priority scoring:
- Calculates priority score: (fairness_score * 1000) + (wait_time * 10) + (preference_match * 100) + (distance_score * 10)
- Uses SKIP LOCKED to avoid blocking
- Tier-based filtering (Tier 1: exact preferences, Tier 2: expanded, Tier 3: guaranteed)
- Returns best_match_id or NULL

#### process_matching_v2
Main matching orchestrator:
- Tries all 3 tiers sequentially
- Tries multiple candidates per tier (up to 5)
- Retries create_pair_atomic up to 3 times per candidate
- Falls back to guaranteed match if no tier match found
- NEVER returns NULL - keeps retrying until match found (up to 30 guaranteed retries)
- Waits if queue is empty (up to 10 wait cycles)

### 2. Queue Management System

**File: `supabase/migrations/20250112_queue_management_system.sql`**

#### validate_match_rules
CRITICAL: Validates all matching rules before creating a match:
- Gender compatibility (males only with females)
- Blocked users check
- Age preferences (bidirectional)
- Distance preferences (bidirectional)
- Online status (for Tier 1/2)
- Queue status validation

#### validate_queue_integrity
Auto-fixes queue issues:
- Removes stuck users (>5 minutes)
- Deletes orphaned matches
- Removes duplicate queue entries
- Fixes invalid states (vote_active without match)

#### optimize_queue_order
Optimizes queue order:
- Recalculates fairness scores
- Manages gender balance
- Resets skip_count for long-waiting users

#### monitor_queue_health
Real-time monitoring:
- Tracks queue statistics
- Detects issues (gender imbalance, high wait times, low match rate)
- Provides health score (0-100)

#### manage_queue_system
Master orchestrator that runs all queue management functions in optimal order.

### 3. Guaranteed Matching

**File: `supabase/migrations/20250125_guarantee_every_spin_leads_to_pairing.sql`**

#### find_guaranteed_match
ALWAYS finds a match:
- Step 1: Try compatible user (gender + preferences)
- Step 2: If no compatible, find ANY opposite gender user (relaxed preferences)
- Step 3: Return NULL only if queue is empty or all users blocked

#### Enhanced process_matching_v2
- Never returns NULL
- Up to 30 guaranteed retries
- Waits if queue is empty (up to 10 cycles)
- Enhanced retry logic with exponential backoff

### 4. Spinning Logic Guardians

**File: `supabase/migrations/20250125_spinning_logic_guardians.sql`**

#### guardian_ensure_no_failed_spins
Ensures no spin fails:
- Monitors users waiting >30 seconds
- Forces matching attempts
- Expands preferences if needed

#### guardian_enforce_state_transitions
Enforces proper state transitions:
- Corrects invalid states (vote_active without match, match without vote_active)

#### guardian_enforce_fairness
Enforces fairness:
- Boosts fairness scores for long-waiting users
- Resets skip_count

#### guardian_prevent_duplicates
Prevents duplicates:
- Ensures no user appears for more than one person
- Resolves conflicts by keeping most recent match

#### guardian_enforce_voting_behavior
Enforces voting behavior:
- Applies priority boosts to yes voters
- Ensures proper queue re-entry after respin

#### guardian_enforce_online_status
CRITICAL: Enforces online status:
- Breaks matches where one or both users are offline
- Resets users back to spin_active

#### guardian_enforce_preference_expansion
Enforces preference expansion:
- Triggers expansion for users waiting >60 seconds

#### guardian_orchestrator
Master orchestrator that runs all guardians in optimal order (every 10 seconds via pg_cron).

### 5. Background Matching Job

**File: `supabase/migrations/20250112_setup_background_matching_job.sql`**

Sets up pg_cron job to call `process_unmatched_users()` every 10 seconds to match users who have been waiting 5+ seconds.

---

## API Routes

### 1. Background Matching API

**File: `src/app/api/background-matching/route.ts`**

```typescript
export async function POST(request: Request) {
  const supabase = await createClient();

  // Call the background matching function
  const { data: matchesCreated, error } = await supabase.rpc(
    'process_unmatched_users'
  );

  // Also record metrics
  const { error: metricsError } = await supabase.rpc('record_matching_metrics');

  return NextResponse.json({
    success: true,
    matchesCreated: matchesCreated || 0,
    timestamp: new Date().toISOString(),
  });
}
```

### 2. Guardians API

**File: `src/app/api/guardians/route.ts`**

```typescript
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('guardian_orchestrator');

  return NextResponse.json({ 
    message: 'Guardian orchestrator executed', 
    results: data 
  });
}
```

---

## UI Components

### 1. Spin Button

**File: `src/components/ui/spin-button.tsx`**

Animated button component for yes/pass votes with shimmer effect.

### 2. Profile Card Spin

**File: `src/components/ui/profile-card-spin.tsx`**

Displays profile card with photo, name, age, and bio. Includes selection indicator and glow effects.

### 3. Match Synchronized Countdown Timer

**File: `src/components/ui/match-synchronized-countdown-timer.tsx`**

Synchronized countdown timer that polls database for remaining time:
- Uses match ID to fetch synchronized time from database
- Polls every 500ms for smooth updates
- Ensures both users see exact same countdown time
- Calls onComplete when countdown reaches 0

---

## Debug & Logging

### File: `src/lib/debug/core/logging.ts`

Structured logging engine with:
- In-memory log storage (up to 10,000 logs)
- File logging (server-side only)
- Log levels: debug, info, warn, error
- User tracking
- Before/after state tracking
- Duration tracking

**Key Functions:**
- `logEvent()` - Log general events
- `logError()` - Log errors with stack traces
- `logDebug()` - Log debug messages
- `getLogs()` - Retrieve logs (with optional limit)
- `getLogsByType()` - Filter by event type
- `getLogsByUser()` - Filter by user ID

---

## Key Matching Flow

1. **User presses "start spin"**
   - Joins queue via `spark_join_queue`
   - Fetches compatible photos for animation
   - Calls `spark_process_matching`

2. **Matching Process (process_matching_v2)**
   - Tier 1: Exact preferences (online, age, distance, gender)
   - Tier 2: Expanded preferences (relaxed age/distance)
   - Tier 3: Guaranteed match (any opposite gender, online)
   - Tries multiple candidates per tier
   - Retries create_pair_atomic on lock conflicts

3. **Match Created (create_pair_atomic)**
   - Locks both users (FOR UPDATE NOWAIT)
   - Validates rules (gender, blocked, preferences)
   - Creates match record
   - Updates both users to vote_active
   - Returns match_id

4. **Real-time Notification**
   - Supabase real-time triggers on match INSERT
   - Frontend receives match notification
   - Loads partner profile
   - Transitions to vote_active state
   - Shows synchronized countdown timer

5. **Voting Window (10 seconds)**
   - Both users see synchronized countdown
   - User can vote "yes" or "pass/respin"
   - If both vote yes → redirect to video date
   - If one votes pass → delete match, re-queue yes voter with boost
   - If idle (no vote) → remove from queue

6. **Guardians (Background)**
   - Run every 10 seconds via pg_cron
   - Ensure no failed spins
   - Enforce state transitions
   - Enforce fairness
   - Prevent duplicates
   - Enforce online status
   - Enforce preference expansion

---

## Critical Rules

1. **Every spin leads to a pairing** - No empty results
2. **Males only match with females** - Strict gender compatibility
3. **Fair matching** - Long-waiting users get priority
4. **Online status required** - Users can only match with online users (Tier 1/2)
5. **State transitions** - Must follow: spin_active → queue_waiting → vote_active
6. **No duplicates** - No user can appear for more than one person
7. **SPARK wrappers** - Must use spark_* functions, never direct functions

---

## Testing

Test files are available in `/tests/`:
- `spin-pairing-comprehensive.spec.ts`
- `spin-pairing-realistic-500-users.spec.ts`
- `spin-pairing-critical-scenarios.spec.ts`
- `matching-logic-scenarios-v2.spec.ts`

---

## Summary

This matching system is designed for:
- **High concurrency** (500+ simultaneous users)
- **100% match rate** (every spin leads to pairing)
- **Fairness** (long-waiting users prioritized)
- **Real-time synchronization** (synchronized countdown timers)
- **Robust error handling** (retries, fallbacks, guardians)
- **Auto-recovery** (guardians fix issues automatically)

The system uses a tier-based matching approach with guaranteed fallback, ensuring users always get matched even under extreme load or edge cases.
