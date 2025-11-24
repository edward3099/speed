# 🔒 LOCKED STATE DOCUMENTATION

**⚠️ CRITICAL: DO NOT MODIFY WITHOUT COMPREHENSIVE REVIEW**

This document defines the "golden state" of the application - the exact configuration that works perfectly. Any changes to these components must be carefully reviewed and tested.

---

## 🎯 Core Principles (LOCKED)

1. **Every spin leads to a pairing** - No user is left unmatched
2. **Guaranteed matching** - Tier-based system ensures matches happen
3. **Fairness first** - Long-waiting users get priority
4. **Atomic operations** - All matching operations are race-condition free
5. **Non-blocking logging** - Logging failures never break functionality

---

## 📱 FRONTEND - Spinning Page (`src/app/spin/page.tsx`)

### Critical State Defaults (LOCKED)
```typescript
// DO NOT CHANGE THESE DEFAULTS
const [isInQueue, setIsInQueue] = useState(false)
const [waitingForMatch, setWaitingForMatch] = useState(false)
const [spinning, setSpinning] = useState(false)
```

### Critical Functions (LOCKED)
- `startSpin()` - Handles queue joining and initial match attempt
- `handleCountdownComplete()` - Processes match after countdown
- `handleRespin()` - Handles respin after vote
- Polling mechanism (2-second interval) - Checks for matches

### Critical RPC Calls (LOCKED)
- `spark_join_queue` - Must use SPARK wrapper, not direct `join_queue`
- `spark_process_matching` - Must use SPARK wrapper, not direct `process_matching`
- `spark_find_best_match` - Must use SPARK wrapper for logging

### Race Condition Handling (LOCKED)
- Partner queue status check with retry logic (3 attempts, 500ms delay)
- Null check for `partnerQueue` before accessing `.status`
- Default to `vote_active` if match exists but partner queue entry not found

### State Transitions (LOCKED)
```
spin_active → queue_waiting → paired → vote_active → video_date
```

### Error Handling (LOCKED)
- All errors logged via `log_frontend_error`
- Non-blocking error handling
- Graceful degradation on errors

---

## 🗄️ BACKEND - Matching Logic (v2)

### Critical Database Functions (LOCKED)

#### Tier-Based Matching System
- `find_best_match_v2(user_id, tier)` - **LOCKED**
  - Tier 1: Exact preferences (0-2 seconds)
  - Tier 2: Expanded preferences (2-10 seconds)
  - Tier 3: Guaranteed match (10+ seconds)
  - **DO NOT MODIFY** tier logic without comprehensive testing

- `process_matching_v2(user_id)` - **LOCKED**
  - Orchestrates tier-based matching
  - Ensures guaranteed pairing
  - **DO NOT MODIFY** without review

- `create_pair_atomic(user1_id, user2_id)` - **LOCKED**
  - Atomic pair creation with `SELECT FOR UPDATE`
  - Prevents race conditions
  - **DO NOT MODIFY** locking mechanism

#### Supporting Functions (LOCKED)
- `calculate_fairness_score(user_id)` - Fairness calculation
- `calculate_preference_match_score()` - Preference compatibility
- `calculate_distance_score()` - Distance scoring
- `get_tier_expansion(tier)` - Preference expansion rules
- `find_guaranteed_match(user_id)` - Last resort matching
- `check_guaranteed_match(user1_id, user2_id)` - Guaranteed match validation

### Queue Management (LOCKED)
- `spark_join_queue` - Must use SPARK wrapper
- Queue status transitions: `spin_active` → `queue_waiting` → `vote_active`
- Users remain in queue until matched
- No timeout/expiry for queue entries

### Pairing Rules (LOCKED)
1. Match newest spinner with best waiting partner
2. Apply preference filters first
3. Expand preferences if user waits too long
4. Both users exit queue when paired
5. No user can appear for multiple people simultaneously

---

## 📊 SPARK Logging System (LOCKED)

### Matching SPARK (`supabase/migrations/20251122143000_spark_logging_setup.sql`)
- `spark_event_log` table - All matching events
- `spark_error_log` table - All matching errors
- `spark_log_event()` - Event logging function
- `spark_log_error()` - Error logging function

### SPARK Wrapper Functions (LOCKED)
- `spark_join_queue` - Wraps `join_queue` with logging
- `spark_process_matching` - Wraps `process_matching_v2` with logging
- `spark_find_best_match` - Wraps `find_best_match_v2` with logging
- `spark_create_pair` - Wraps `create_pair_atomic` with logging

**⚠️ CRITICAL**: All matching operations MUST use SPARK wrappers, never direct functions.

### Video Date SPARK (`supabase/migrations/video_spark_logging_setup.sql`)
- `video_spark_event_log` table - All video date events
- `video_spark_error_log` table - All video date errors
- `video_spark_log_event_rpc()` - Frontend event logging
- `video_spark_log_error_rpc()` - Frontend error logging

---

## 🎥 VIDEO DATE - Countdown Defaults (LOCKED)

### Critical State Defaults (LOCKED)
```typescript
// DO NOT CHANGE - These defaults provide optimal UX
const [countdownMuted, setCountdownMuted] = useState(true) // Default muted
const [countdownVideoOff, setCountdownVideoOff] = useState(true) // Default video off
```

**Why locked**: Users expect privacy during countdown. Defaulting to off prevents accidental exposure.

---

## 🔄 State Machine (LOCKED)

### Valid State Transitions
```
User Journey:
spin_active → queue_waiting → paired → vote_active → video_date → ended

Invalid States (PREVENT):
- User in queue_waiting but also in vote_active
- User matched but not in vote_active
- User in video_date but match deleted
```

### State Validation Rules (LOCKED)
- Users can only be in ONE state at a time
- Queue entries must match user status
- Matches must have both users in `vote_active`
- Video dates must have valid match

---

## 🛡️ Error Handling Patterns (LOCKED)

### Pattern 1: Non-Blocking Logging
```typescript
// ALWAYS use this pattern for logging
try {
  await logVideoEvent(...)
} catch (error) {
  // Silently fail - logging should never break the app
  console.error('Failed to log:', error)
}
```

### Pattern 2: Race Condition Handling
```typescript
// ALWAYS retry with delays for race conditions
let retries = 0
while (retries < 3) {
  const result = await checkPartnerStatus()
  if (result) break
  await new Promise(resolve => setTimeout(resolve, 500))
  retries++
}
```

### Pattern 3: Null Safety
```typescript
// ALWAYS check for null before accessing properties
if (partnerQueue && partnerQueue.status === 'vote_active') {
  // Safe to proceed
}
```

---

## 📋 Critical Paths (LOCKED)

### Path 1: Spin → Match → Video Date
1. User presses spin → `startSpin()`
2. Join queue → `spark_join_queue()`
3. Poll for match → `spark_process_matching()` (every 2 seconds)
4. Match found → Status changes to `vote_active`
5. Both vote yes → Redirect to video date
6. Video date countdown → Defaults: muted, video off
7. Video date active → User interactions enabled

### Path 2: Respin Flow
1. User votes respin → `handleRespin()`
2. Delete match → Remove from queue
3. Rejoin queue → `spark_join_queue()`
4. Poll for new match → `spark_process_matching()`

---

## 🚫 What NOT to Change

### ❌ DO NOT:
1. Change tier-based matching logic without comprehensive testing
2. Remove SPARK logging wrappers
3. Change countdown defaults (muted/video off)
4. Modify atomic pair creation locking mechanism
5. Remove race condition handling
6. Change polling interval from 2 seconds
7. Remove retry logic for partner status checks
8. Change state transition rules
9. Remove null checks
10. Make logging blocking

---

## ✅ Change Process

If you MUST modify any locked component:

1. **Document the change** - Why is it needed?
2. **Create a test plan** - How will you verify it works?
3. **Update this document** - Reflect the new locked state
4. **Test thoroughly** - All critical paths must work
5. **Monitor logs** - Watch for new errors after deployment
6. **Get review** - Have another developer review the change

---

## 📝 Version History

- **2025-11-22**: Initial locked state documentation
  - Tier-based matching v2
  - SPARK logging system
  - Video date countdown defaults
  - Race condition handling
  - State machine validation

---

**Last Updated**: 2025-11-22
**Status**: ✅ All systems locked and working perfectly





