# Spin Logic Production Test Plan

## Overview
This test plan is designed to catch **real errors users will face** when pressing spin. All tests must verify actual user experience, not just theoretical correctness.

---

## Test Category 1: Core Flow Tests (Must Pass - Critical)

### Test 1.1: Basic Spin → Match → Vote Flow
**User Experience Test**: User presses spin, gets matched, sees partner, votes, gets outcome.

**Steps**:
1. User A presses spin → verify in queue, state='waiting'
2. User B presses spin → verify A and B matched immediately
3. Verify both users see each other (state='paired', match_id exists)
4. Both acknowledge → verify vote window starts (state='vote_window', vote_window_expires_at set)
5. Both vote 'yes' → verify outcome='both_yes', video-date created, both in 'idle'
6. Verify both users in never_pair_again history

**Failure Modes to Catch**:
- ❌ User presses spin but nothing happens (join_queue fails)
- ❌ Users matched but vote window never appears (acknowledge broken)
- ❌ Both vote yes but video-date not created (outcome resolution broken)
- ❌ Users stuck in 'vote_window' state (state transition broken)
- ❌ Users can match again immediately (history not working)

---

### Test 1.2: Auto-Spin After yes+pass
**User Experience Test**: User votes yes, partner votes pass, both auto-spin without pressing spin button.

**Steps**:
1. User A and B matched
2. A votes 'yes', B votes 'pass'
3. Verify outcome='yes_pass'
4. Verify A has +10 fairness boost
5. Verify A is in queue (state='waiting', auto-spun)
6. Verify B is in queue (state='waiting', auto-spun)
7. Verify both in never_pair_again history

**Failure Modes to Catch**:
- ❌ Users stuck in 'vote_window' after voting (auto-spin not working)
- ❌ Yes user doesn't get +10 fairness boost
- ❌ Users have to manually press spin (auto-spin broken)
- ❌ Users can match again (history not working)

---

### Test 1.3: Auto-Spin After pass+pass
**User Experience Test**: Both vote pass, both auto-spin without pressing spin.

**Steps**:
1. User A and B matched
2. Both vote 'pass'
3. Verify outcome='pass_pass'
4. Verify both in queue (state='waiting', auto-spun)
5. Verify no fairness boost for either user
6. Verify both in never_pair_again history

**Failure Modes to Catch**:
- ❌ Users stuck after voting pass+pass
- ❌ Users get unfairness boost when they shouldn't
- ❌ Users have to manually press spin

---

### Test 1.4: idle+idle (No Auto-Spin)
**User Experience Test**: Vote window expires, both go to idle, must press spin manually.

**Steps**:
1. User A and B matched, vote window started
2. Wait for vote window to expire (or manually expire it)
3. Verify outcome='idle_idle'
4. Verify both in 'idle' state (NOT 'waiting')
5. Verify both NOT in queue
6. Verify both in never_pair_again history
7. Verify users must press spin to rejoin

**Failure Modes to Catch**:
- ❌ Users auto-spin when they shouldn't (idle+idle should not auto-spin)
- ❌ Users stuck in 'vote_window' after expiration
- ❌ Vote window never expires (timer broken)

---

## Test Category 2: Scenario 1 - Three Users Different Times

### Test 2.1: Sequential Matching
**User Experience Test**: A starts, B joins 1s later, A+B match immediately, C continues waiting.

**Steps**:
1. User A presses spin at T=0
2. Wait 1 second
3. User B presses spin at T=1
4. Verify A and B matched immediately (within 2-3 seconds)
5. Verify C (if exists) still waiting
6. User C presses spin at T=3
7. Verify C continues waiting (no match yet)

**Failure Modes to Catch**:
- ❌ A and B never match (matching not real-time)
- ❌ A matches with C instead of B (wrong matching order)
- ❌ A matches with themselves (self-matching bug)
- ❌ C matches with offline user (online check broken)

---

## Test Category 3: Scenario 2 - Fairness Priority

### Test 3.1: Long Waiter Gets Priority
**User Experience Test**: User waiting 3 minutes matches immediately when new user joins.

**Steps**:
1. User A presses spin, wait 3 minutes (or simulate with fairness=20)
2. User B presses spin
3. Verify A and B matched immediately (A should match first due to fairness)
4. Verify A's fairness=20, B's fairness=0 (A has priority)
5. Verify neither matched with anyone else first

**Failure Modes to Catch**:
- ❌ Long waiter never gets matched (fairness not working)
- ❌ New user matches with someone else first (fairness sorting broken)
- ❌ Fairness not applied correctly (long waiters don't get priority)

---

## Test Category 4: Scenario 4 - Disconnect Handling

### Test 4.1: Disconnect During Spinning
**User Experience Test**: User disconnects while spinning, removed from queue, must press spin when returning.

**Steps**:
1. User A presses spin (in queue, state='waiting')
2. Simulate disconnect: set last_active to 15 seconds ago
3. Run auto_remove_offline_users()
4. Verify A removed from queue
5. Verify A state='idle' (not 'waiting')
6. Verify A never gets matched
7. A comes back online, presses spin → verify rejoins queue

**Failure Modes to Catch**:
- ❌ Offline user stays in queue (cleanup not working)
- ❌ Offline user gets matched (online check broken)
- ❌ User can't rejoin after disconnect (state stuck)

---

### Test 4.2: Disconnect During Countdown (Yes User)
**User Experience Test**: User disconnects during vote window, remaining yes user auto-spins with +10 boost.

**Steps**:
1. User A and B matched, vote window started
2. User A votes 'yes'
3. User B disconnects (last_active > 10s ago)
4. Run auto_remove_offline_users()
5. Verify match cancelled (status='cancelled')
6. Verify A auto-spins (state='waiting', in queue)
7. Verify A has +10 fairness boost
8. Verify B in 'idle' state (must press spin manually)

**Failure Modes to Catch**:
- ❌ Remaining user stuck in 'vote_window' (disconnect handling broken)
- ❌ Remaining user doesn't auto-spin (auto-spin logic broken)
- ❌ Yes user doesn't get +10 boost (fairness boost broken)
- ❌ Match not cancelled (cleanup broken)

---

### Test 4.3: Disconnect During Countdown (Pass User)
**User Experience Test**: User disconnects during vote window, remaining pass user auto-spins.

**Steps**:
1. User A and B matched, vote window started
2. User A votes 'pass'
3. User B disconnects
4. Run auto_remove_offline_users()
5. Verify match cancelled
6. Verify A auto-spins (state='waiting', in queue)
7. Verify A has NO fairness boost (pass doesn't get boost)
8. Verify B in 'idle' state

**Failure Modes to Catch**:
- ❌ Pass user doesn't auto-spin
- ❌ Pass user gets unfairness boost
- ❌ Remaining user stuck

---

### Test 4.4: Disconnect During Countdown (No Vote)
**User Experience Test**: User disconnects, remaining user did nothing, both go to idle.

**Steps**:
1. User A and B matched, vote window started
2. Neither user votes
3. User B disconnects
4. Run auto_remove_offline_users()
5. Verify match cancelled
6. Verify A in 'idle' state (NOT auto-spin, no vote = no auto-spin)
7. Verify B in 'idle' state

**Failure Modes to Catch**:
- ❌ Remaining user auto-spins when they shouldn't (no vote = no auto-spin)
- ❌ Users stuck in 'vote_window'

---

### Test 4.5: Disconnect at Match Formation
**User Experience Test**: User disconnects immediately after match, match cancelled, other user auto-spins.

**Steps**:
1. User A and B matched (match created < 5 seconds ago)
2. User B disconnects immediately (last_active > 10s ago)
3. Run auto_remove_offline_users()
4. Verify match cancelled (status='cancelled')
5. Verify A auto-spins (state='waiting', in queue)
6. Verify B in 'idle' state

**Failure Modes to Catch**:
- ❌ Match not cancelled (ghost match)
- ❌ Remaining user stuck in 'paired' state
- ❌ Remaining user doesn't auto-spin

---

## Test Category 5: Scenario 5 - High Traffic

### Test 5.1: 200 Users Simultaneous Spin
**User Experience Test**: 200 users press spin simultaneously, all eventually get matched.

**Steps**:
1. Create 200 users with compatible preferences
2. All 200 press spin simultaneously
3. Run continuous_matching() repeatedly
4. Verify all users eventually get matched (within reasonable time)
5. Verify no duplicate matches
6. Verify no users matched with offline users
7. Verify matching order respects fairness (long waiters first)

**Failure Modes to Catch**:
- ❌ Some users never get matched (matching throughput too low)
- ❌ Duplicate matches created (race condition)
- ❌ Users matched with offline users (online check broken)
- ❌ Matching order unfair (fairness not working under load)
- ❌ System freezes or crashes (performance issue)

---

### Test 5.2: Pass/Idle Don't Freeze System
**User Experience Test**: Many users vote pass or idle, system continues matching others.

**Steps**:
1. 50 users matched (25 pairs)
2. 10 pairs vote pass+pass (auto-spin)
3. 10 pairs vote idle+idle (go to idle)
4. 5 pairs still voting
5. Verify system continues matching remaining users
6. Verify pass+pass users auto-spin and can match again
7. Verify idle+idle users in idle (not blocking)

**Failure Modes to Catch**:
- ❌ System freezes when many users vote pass/idle
- ❌ Pass+pass users don't auto-spin (blocking queue)
- ❌ Idle+idle users block matching (state stuck)

---

## Test Category 6: Scenario 6 - Concurrency

### Test 6.1: Multiple Join/Leave Simultaneously
**User Experience Test**: Users join and leave rapidly, system handles correctly.

**Steps**:
1. Users A, B, C, D spinning
2. User E joins
3. User C leaves (disconnects)
4. User F joins
5. User B leaves
6. User G joins
7. Verify remaining users keep spinning
8. Verify available users pair immediately
9. Verify arrivals fill gaps
10. Verify departures free partners
11. Verify nobody stuck
12. Verify nobody forgotten
13. Verify nobody paired with non-spinning user
14. Verify order remains fair

**Failure Modes to Catch**:
- ❌ Users get stuck when others leave
- ❌ Users forgotten when others join
- ❌ Users matched with offline users
- ❌ Matching order becomes unfair
- ❌ System breaks or freezes

---

## Test Category 7: Scenario 7 - History

### Test 7.1: Never Match Again (All Outcomes)
**User Experience Test**: Users who matched before never match again, regardless of outcome.

**Test Cases** (run each):
1. **yes+yes**: Match → both vote yes → try to match again → verify blocked
2. **yes+pass**: Match → vote yes+pass → try to match again → verify blocked
3. **pass+pass**: Match → both vote pass → try to match again → verify blocked
4. **pass+idle**: Match → vote pass, other idle → try to match again → verify blocked
5. **yes+idle**: Match → vote yes, other idle → try to match again → verify blocked
6. **idle+idle**: Match → both idle → try to match again → verify blocked
7. **pass+disconnect**: Match → vote pass, other disconnects → try to match again → verify blocked

**For Each Test**:
- Verify never_pair_again entry created
- Verify history persists after disconnect
- Verify history blocks only that pair (not others)
- Verify history check is fast (doesn't slow matching)

**Failure Modes to Catch**:
- ❌ Users can match again after any outcome (history not working)
- ❌ History lost after disconnect (persistence broken)
- ❌ History blocks wrong users (logic error)
- ❌ History check slows matching (performance issue)

---

## Test Category 8: Edge Cases & Race Conditions

### Test 8.1: Double Spin (Idempotency)
**User Experience Test**: User presses spin twice quickly, no errors, no duplicate entries.

**Steps**:
1. User A presses spin
2. User A presses spin again immediately (< 1 second)
3. Verify only one queue entry
4. Verify only one users_state entry
5. Verify no errors
6. Verify user in 'waiting' state

**Failure Modes to Catch**:
- ❌ Duplicate queue entries (unique constraint not working)
- ❌ Errors on double spin (idempotency broken)
- ❌ User state corrupted

---

### Test 8.2: Simultaneous Match Attempt
**User Experience Test**: Two matching processes try to match same users, only one succeeds.

**Steps**:
1. User A and B in queue
2. Call find_and_create_match(A) and find_and_create_match(B) simultaneously
3. Verify only one match created
4. Verify both users in 'paired' state
5. Verify no duplicate matches

**Failure Modes to Catch**:
- ❌ Duplicate matches created (race condition)
- ❌ Both users matched with different people (double-matching)
- ❌ Match creation fails (locking broken)

---

### Test 8.3: Vote Twice (Idempotency)
**User Experience Test**: User votes twice, second vote updates first, no errors.

**Steps**:
1. User A and B matched, vote window started
2. User A votes 'yes'
3. User A votes 'pass' (changes vote)
4. Verify only one vote recorded (latest vote)
5. Verify no errors
6. Verify outcome resolved correctly (pass+yes or pass+pass)

**Failure Modes to Catch**:
- ❌ Duplicate votes (unique constraint not working)
- ❌ Errors on second vote (idempotency broken)
- ❌ Outcome resolution broken

---

### Test 8.4: Acknowledge After Vote Window Started
**User Experience Test**: User acknowledges after vote window already started, no errors.

**Steps**:
1. User A and B matched
2. Both acknowledge → vote window starts
3. User A acknowledges again (idempotent)
4. Verify no errors
5. Verify vote window still active
6. Verify both can vote

**Failure Modes to Catch**:
- ❌ Errors on second acknowledge (idempotency broken)
- ❌ Vote window restarted (state corruption)

---

### Test 8.5: Vote After Window Expired
**User Experience Test**: User votes after vote window expired, outcome resolved as idle+idle.

**Steps**:
1. User A and B matched, vote window started
2. Wait for vote window to expire (or manually expire)
3. User A tries to vote
4. Verify outcome='idle_idle' (already resolved)
5. Verify both users in 'idle' state
6. Verify vote not recorded (window expired)

**Failure Modes to Catch**:
- ❌ Vote accepted after expiration (validation broken)
- ❌ Users stuck in 'vote_window' (expiration not handled)
- ❌ Outcome not resolved (cleanup broken)

---

## Test Category 9: Preference Expansion

### Test 9.1: Distance Expansion for Long Waiters
**User Experience Test**: User waiting 30+ minutes can match with users very far away.

**Steps**:
1. User A presses spin, wait 30+ minutes (or set preference_stage=8)
2. Verify preference_stage=8
3. Verify expanded_max_distance=10,000 km (or 20x base)
4. User B (373 km away) presses spin
5. Verify A and B can match (distance < 10,000 km)
6. Verify match created successfully

**Failure Modes to Catch**:
- ❌ Preference stage not advancing (auto_expand_preferences broken)
- ❌ Distance expansion not calculated correctly
- ❌ Long waiters can't match with far users (expansion not working)

---

### Test 9.2: Age Expansion
**User Experience Test**: User waiting 20+ seconds can match with wider age range.

**Steps**:
1. User A (age 25, prefers 20-30) presses spin
2. Wait 20+ seconds (preference_stage=3)
3. Verify expanded age range = 18-100
4. User B (age 35) presses spin
5. Verify A and B can match (35 within 18-100)
6. Verify match created

**Failure Modes to Catch**:
- ❌ Age expansion not working
- ❌ Users can't match even with expanded preferences

---

## Test Category 10: Fairness System

### Test 10.1: Fairness Boosts Applied
**User Experience Test**: User waiting 20+ seconds gets fairness boost, gets priority in matching.

**Steps**:
1. User A presses spin
2. Wait 60 seconds
3. Verify fairness=10 (or appropriate boost)
4. User B presses spin (fairness=0)
5. Verify A matches before B (fairness sorting works)
6. Verify A's fairness persists after auto-spin

**Failure Modes to Catch**:
- ❌ Fairness not applied (auto_apply_fairness_boosts broken)
- ❌ Fairness doesn't affect matching priority
- ❌ Fairness lost after auto-spin

---

### Test 10.2: Fairness Capped at 20
**User Experience Test**: User waiting very long doesn't exceed fairness cap.

**Steps**:
1. User A presses spin
2. Wait 10+ minutes (or set fairness=25)
3. Verify fairness <= 20 (capped)
4. Verify matching still works correctly

**Failure Modes to Catch**:
- ❌ Fairness exceeds 20 (cap not working)
- ❌ High fairness breaks matching

---

## Test Category 11: Database Constraints

### Test 11.1: Unique Constraints Prevent Duplicates
**User Experience Test**: Database prevents duplicate queue entries, votes, matches.

**Steps**:
1. Try to insert duplicate queue entry → verify constraint violation
2. Try to insert duplicate vote → verify constraint violation
3. Try to create duplicate match → verify constraint violation

**Failure Modes to Catch**:
- ❌ Duplicate entries allowed (constraints not working)
- ❌ Data corruption from duplicates

---

### Test 11.2: Foreign Key Constraints
**User Experience Test**: Database prevents orphaned records.

**Steps**:
1. Try to set match_id to non-existent match → verify constraint violation
2. Try to set partner_id to non-existent user → verify constraint violation

**Failure Modes to Catch**:
- ❌ Orphaned records created (data integrity broken)

---

### Test 11.3: State Transition Validation
**User Experience Test**: Database prevents invalid state transitions.

**Steps**:
1. Try to transition from 'idle' to 'vote_window' → verify constraint violation
2. Try to transition from 'waiting' to 'video_date' → verify constraint violation
3. Try invalid state value → verify constraint violation

**Failure Modes to Catch**:
- ❌ Invalid states allowed (state machine broken)
- ❌ Users stuck in invalid states

---

## Test Category 12: Performance & Scalability

### Test 12.1: Matching Throughput
**User Experience Test**: System matches users quickly even under load.

**Steps**:
1. 100 users in queue
2. Measure time to match all users
3. Verify all matched within reasonable time (< 30 seconds)
4. Verify no performance degradation

**Failure Modes to Catch**:
- ❌ Matching too slow (performance issue)
- ❌ System slows down under load
- ❌ Some users never matched (throughput too low)

---

### Test 12.2: Concurrent Operations
**User Experience Test**: Multiple operations happen simultaneously without conflicts.

**Steps**:
1. 50 users press spin simultaneously
2. 50 users vote simultaneously
3. 50 users acknowledge simultaneously
4. Verify no deadlocks
5. Verify no conflicts
6. Verify all operations complete successfully

**Failure Modes to Catch**:
- ❌ Deadlocks occur (locking broken)
- ❌ Conflicts cause errors (concurrency broken)
- ❌ Operations fail under load

---

## Test Category 13: Error Recovery

### Test 13.1: Stuck State Recovery
**User Experience Test**: System automatically repairs users stuck in invalid states.

**Steps**:
1. Manually set user to stuck state (e.g., 'paired' but no match_id)
2. Run repair_stuck_states()
3. Verify user state repaired (back to 'idle' or correct state)
4. Verify user can spin again

**Failure Modes to Catch**:
- ❌ Users stuck forever (repair not working)
- ❌ Repair breaks valid states

---

### Test 13.2: Expired Vote Window Recovery
**User Experience Test**: System automatically resolves expired vote windows.

**Steps**:
1. Create match with expired vote_window_expires_at
2. Run auto_resolve_expired_vote_windows()
3. Verify outcome='idle_idle'
4. Verify both users in 'idle' state
5. Verify both in never_pair_again history

**Failure Modes to Catch**:
- ❌ Expired windows never resolved (cleanup broken)
- ❌ Users stuck in 'vote_window'

---

## Test Implementation Priority

### P0 - Critical (Must Pass Before Production)
- Test 1.1: Basic Spin → Match → Vote Flow
- Test 1.2: Auto-Spin After yes+pass
- Test 1.3: Auto-Spin After pass+pass
- Test 4.1: Disconnect During Spinning
- Test 4.2: Disconnect During Countdown (Yes User)
- Test 7.1: Never Match Again (All Outcomes)
- Test 8.1: Double Spin (Idempotency)
- Test 8.2: Simultaneous Match Attempt

### P1 - High Priority (Should Pass)
- Test 2.1: Sequential Matching
- Test 3.1: Long Waiter Gets Priority
- Test 4.3-4.5: Other Disconnect Scenarios
- Test 9.1: Distance Expansion for Long Waiters
- Test 10.1: Fairness Boosts Applied

### P2 - Important (Nice to Have)
- Test 5.1-5.2: High Traffic Tests
- Test 6.1: Multiple Join/Leave
- Test 12.1-12.2: Performance Tests

---

## Test Execution Strategy

### Automated Tests
- Create SQL test functions for each test
- Run tests in isolated transactions (rollback after)
- Verify expected states at each step
- Log failures with detailed error messages

### Manual Tests
- Test with real users in staging environment
- Monitor logs during tests
- Verify user experience matches expectations

### Continuous Testing
- Run P0 tests on every deployment
- Run P1 tests daily
- Run P2 tests weekly or before releases

---

## Success Criteria

**All P0 tests must pass** before considering production-ready.

**Key Metrics**:
- ✅ 100% of P0 tests pass
- ✅ No users stuck in invalid states
- ✅ No duplicate matches
- ✅ All voting outcomes work correctly
- ✅ All disconnect scenarios handled
- ✅ History prevents rematching
- ✅ Auto-spin works for all scenarios
- ✅ Fairness and preference expansion work

---

## Common Failure Patterns to Watch For

1. **State Stuck**: User in wrong state, can't proceed
2. **Ghost Matches**: Match exists but users can't see it
3. **Missing Auto-Spin**: Users should auto-spin but don't
4. **Wrong Auto-Spin**: Users auto-spin when they shouldn't
5. **History Broken**: Users match again when they shouldn't
6. **Fairness Broken**: Long waiters don't get priority
7. **Distance Expansion Broken**: Long waiters can't match far users
8. **Race Conditions**: Duplicate matches, conflicts
9. **Disconnect Not Handled**: Offline users matched or stuck
10. **Performance Degradation**: System slows under load

---

## Notes

- All tests should use real database (not mocks) to catch actual SQL errors
- Tests should verify both database state AND user experience
- Tests should simulate real user behavior (not just happy path)
- Tests should catch errors users would actually see
- Tests should be fast enough to run frequently
- Tests should be deterministic (same input = same output)


