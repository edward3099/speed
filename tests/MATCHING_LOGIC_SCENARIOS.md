# Matching Logic Automated Test Scenarios

## Overview

This document describes 10 realistic real-world test scenarios designed to validate the matching logic system based on `matching_logic.md` and `MATCHING_LOGIC_REDESIGN.md`. All scenarios use the comprehensive logging system to verify behavior and rule compliance.

## Test File

**File**: `tests/matching-logic-scenarios.spec.ts`

**Run Command**: 
```bash
npm run test:matching-logic
```

## Test Scenarios

### Scenario 1: Immediate Match (Tier 1)

**Description**: Two users with exact preferences match immediately (0-2 seconds)

**Expected Behavior**:
- Both users spin and join queue
- Match found immediately (Tier 1 - exact preferences)
- Both users see reveal animation
- Voting window starts

**Logs Verified**:
- ✅ `spinStart` (both users)
- ✅ `queueJoined` (both users)
- ✅ `matchFound` (at least one user)
- ✅ `matchDetected` (both users via realtime)
- ✅ `matchLoaded` (both users)
- ✅ `votingWindowStarted` (both users)

**Rule Validated**: "Newest spinner matches with best waiting partner" - immediate match for compatible users

---

### Scenario 2: Fairness Priority

**Description**: Long-waiting user gets matched first when a new user spins

**Expected Behavior**:
- User 1 spins first and waits
- User 2 spins later (newer)
- User 3 spins and matches with User 1 (not User 2) due to fairness priority

**Logs Verified**:
- ✅ `spinStart` and `queueJoined` timestamps show User 1 joined earlier
- ✅ `matchFound` pairs User 1 with User 3 (fairness priority)
- ✅ Fairness score calculation verified

**Rule Validated**: "Fairness boost - users who waited long get higher priority"

---

### Scenario 3: Preference Expansion (Tier 2)

**Description**: User with narrow preferences waits, preferences expand (Tier 2), then matches

**Expected Behavior**:
- User spins with narrow preferences
- Initial matching attempt may fail (no exact match)
- Preferences expand (age ±2, distance +20%)
- Match found with expanded preferences

**Logs Verified**:
- ✅ `spinStart`, `queueJoined`
- ✅ `no_match_found` or `matching_failed` (if initial attempt fails)
- ✅ `matchFound` (after expansion)
- ✅ Event data shows expansion level or tier

**Rule Validated**: "If user waits too long, expand preferences gently"

---

### Scenario 4: Guaranteed Match (Tier 3)

**Description**: User with very narrow preferences eventually matches (guaranteed - no exceptions)

**Expected Behavior**:
- User spins with very narrow preferences
- System tries Tier 1, Tier 2, then Tier 3
- Match is guaranteed (even with maximum expansion)
- Both users see match

**Logs Verified**:
- ✅ `spinStart`, `queueJoined`
- ✅ `matchFound` or `matchDetected` (eventually)
- ✅ `matchLoaded` (both users)
- ✅ No user left unmatched

**Rule Validated**: "Every spin leads to a pairing" - guaranteed match guarantee

---

### Scenario 5: Both Vote Yes - Successful Video Date

**Description**: Both users vote yes, enter video date

**Expected Behavior**:
- Both users spin and get matched
- Both vote yes
- Both navigate to video-date page
- Video date session starts

**Logs Verified**:
- ✅ `voteCast` (both users)
- ✅ `voteYes` (both users)
- ✅ Navigation to video-date page

**Rule Validated**: "Both vote yes → both users enter a video date"

---

### Scenario 6: One Yes, One Pass - Priority Boost

**Description**: User 1 votes yes, User 2 votes pass. Both return to queue, User 1 gets priority boost.

**Expected Behavior**:
- Both users spin and get matched
- User 1 votes yes
- User 2 votes pass
- Both return to spin page (not video date)
- User 1 receives priority boost for next spin

**Logs Verified**:
- ✅ `voteCast` (both users)
- ✅ `voteYes` (User 1)
- ✅ `votePass` (User 2)
- ✅ Both return to spin page
- ✅ User 1's fairness score increased (priority boost)

**Rule Validated**: "One votes yes and the other votes respin → the yes voter receives a priority boost"

---

### Scenario 7: Both Vote Pass - Return to Queue

**Description**: Both users vote pass, both return to queue with normal priority

**Expected Behavior**:
- Both users spin and get matched
- Both vote pass
- Both return to spin page
- No priority boost (both voted pass)

**Logs Verified**:
- ✅ `voteCast` (both users)
- ✅ `votePass` (both users)
- ✅ Both return to spin page
- ✅ No priority boost applied

**Rule Validated**: "One user votes respin before the other has voted → no boost is given unless the other user had already voted yes"

---

### Scenario 8: Disconnection During Queue

**Description**: User disconnects while in queue, cleanup happens

**Expected Behavior**:
- User spins and joins queue
- User closes browser/tab or navigates away
- System detects disconnection
- User removed from queue (cleanup)

**Logs Verified**:
- ✅ `spinStart`, `queueJoined`
- ✅ `userDisconnected` (when user disconnects)
- ✅ Queue cleanup verified

**Rule Validated**: "User leaves the session → cleanup happens"

---

### Scenario 9: Multiple Users Queue - Best Partner Selection

**Description**: Multiple users in queue, newest spinner matches with best waiting partner

**Expected Behavior**:
- User 1 spins first (waits longer)
- User 2 spins later (newer)
- User 3 spins and matches with User 1 (best waiting partner, not User 2)

**Logs Verified**:
- ✅ Multiple `spinStart` and `queueJoined` events
- ✅ `matchFound` pairs newest spinner with best waiting partner
- ✅ Fairness and queue time considered

**Rule Validated**: "Match the newest spinner with the best waiting partner in the queue"

---

### Scenario 10: Race Condition Prevention

**Description**: Two users try to match simultaneously, system prevents duplicate matches

**Expected Behavior**:
- Both users spin at exactly the same time
- System handles concurrent matching attempts
- Only one match created (no duplicates)
- Both users see the same match

**Logs Verified**:
- ✅ Both `spinStart` and `queueJoined` (simultaneous)
- ✅ Only one `matchFound` (not duplicates)
- ✅ Both `matchDetected` (via realtime)
- ✅ No duplicate matches in database

**Rule Validated**: "No user can appear for more than one person at the same time" - atomic pair creation

---

## Logging System Integration

All scenarios use the comprehensive logging system to verify:

1. **Event Tracking**: Every action (spin, queue join, match, vote) is logged
2. **State Transitions**: Queue status changes are tracked
3. **Rule Compliance**: Matching rules are verified via log analysis
4. **Timing**: Timestamps verify fairness and priority calculations
5. **Error Detection**: Failed operations are logged with severity levels

### Log Event Types Used

- `spinStart` - User presses spin button
- `queueJoined` - User successfully joins queue
- `queue_join_failed` - Queue join failed
- `matchFound` - Match found immediately
- `matchDetected` - Match detected via realtime
- `matchLoaded` - Match loaded with partner profile
- `no_match_found` - No match found on initial attempt
- `matching_failed` - Matching process failed
- `votingWindowStarted` - Voting window started
- `votingWindowEnded` - Voting window ended
- `voteCast` - User cast a vote
- `voteYes` - User voted yes
- `votePass` - User voted pass/respin
- `vote_save_failed` - Vote save failed
- `userDisconnected` - User disconnected while in queue
- `userDisconnectedVoting` - User disconnected during voting

## Running the Tests

### Prerequisites

1. Development server running: `npm run dev`
2. Test users created in Supabase (see `TEST_ACCOUNTS_SETUP.md`)
3. Environment variables set:
   ```bash
   TEST_USER1_EMAIL=testuser1@example.com
   TEST_USER1_PASSWORD=testpass123
   TEST_USER2_EMAIL=testuser2@example.com
   TEST_USER2_PASSWORD=testpass123
   ```

### Run All Scenarios

```bash
npm run test:matching-logic
```

### Run Specific Scenario

```bash
npx playwright test tests/matching-logic-scenarios.spec.ts -g "Scenario 1"
```

### Run with UI (Recommended)

```bash
npx playwright test tests/matching-logic-scenarios.spec.ts --ui
```

### Debug a Scenario

```bash
npx playwright test tests/matching-logic-scenarios.spec.ts --debug -g "Scenario 5"
```

## Analyzing Results

After running tests, analyze logs:

```bash
# Fetch recent logs
curl "http://localhost:3001/api/debug/spin-logs?limit=100"

# Filter by user
curl "http://localhost:3001/api/debug/spin-logs?user=USER_ID&limit=50"

# Filter by event type
curl "http://localhost:3001/api/debug/spin-logs?types=spinStart,queueJoined,matchFound"
```

## Success Criteria

Each scenario should:

1. ✅ Execute without errors
2. ✅ Generate expected log events
3. ✅ Follow matching logic rules
4. ✅ Complete within timeout limits
5. ✅ Verify state transitions correctly

## Troubleshooting

### Tests Fail with "Element not found"

- Check that `data-testid` attributes are in components
- Verify server is running on port 3001
- Check browser console for errors

### Logs Not Appearing

- Verify `spark_log_event` function is working
- Check database connection
- Ensure `p_event_category` parameter is included

### Timeout Errors

- Increase timeout in test file
- Check network connectivity
- Verify Supabase connection
- Check if matching is taking longer than expected

## Next Steps

1. Run all scenarios: `npm run test:matching-logic`
2. Review test results and logs
3. Fix any failing scenarios
4. Add more edge case scenarios as needed
5. Integrate into CI/CD pipeline

