# Comprehensive Test Plan: Spin → Pairing → Video Date

## Overview
This document outlines comprehensive testing for the three critical user flows:
1. **Spinning** - User initiates matching
2. **Pairing** - System matches two users
3. **Video Date** - Matched users have a video call

## Test Infrastructure Setup

### Tools
- **Playwright** - End-to-end testing (browser automation)
- **Jest** - Unit and integration tests
- **Testing Library** - Component testing

## Test Scenarios

### 1. SPINNING FLOW

#### 1.1 Basic Spin Functionality
- [ ] User can click spin button
- [ ] Spin animation starts
- [ ] User enters queue (`spin_active` → `queue_waiting`)
- [ ] User profile is added to matching queue
- [ ] Spinning animation continues until match found
- [ ] No timeout/expiry occurs (user stays in queue)

#### 1.2 Queue Management
- [ ] User joins queue with correct preferences
- [ ] User state transitions correctly
- [ ] User remains matchable until paired
- [ ] Queue entry includes: time joined, age preference, gender preference, location preference, fairness score
- [ ] User can see queue status

#### 1.3 Preference Handling
- [ ] User preferences are saved correctly
- [ ] Age range preferences work
- [ ] Gender preferences work
- [ ] Location/distance preferences work
- [ ] Preferences are used in matching algorithm

#### 1.4 Edge Cases
- [ ] User spins multiple times quickly (should handle gracefully)
- [ ] User spins while already in queue (should not create duplicate entries)
- [ ] Network interruption during spin (should recover)
- [ ] User closes browser during spin (should handle cleanup)

### 2. PAIRING FLOW

#### 2.1 Basic Pairing
- [ ] Two users spinning get matched
- [ ] Match is created in database
- [ ] Both users exit queue when paired
- [ ] Spin animation stops when match found
- [ ] Both users see reveal animation
- [ ] Both users enter `vote_active` state

#### 2.2 Matching Algorithm
- [ ] Newest spinner matches with best waiting partner
- [ ] Preference filters are applied correctly
- [ ] Fairness score affects matching priority
- [ ] Queue time affects matching priority
- [ ] Match score calculation works
- [ ] Tier-based matching works (Tier 1 → Tier 2 → Tier 3)

#### 2.3 Preference Matching
- [ ] Exact preference matches rank highest
- [ ] Expanded matches rank lower
- [ ] Age range matching works
- [ ] Gender preference matching works
- [ ] Location/distance matching works
- [ ] Preference expansion works when user waits too long

#### 2.4 Fairness System
- [ ] Long-waiting users get priority
- [ ] Fairness score increases with wait time
- [ ] Fairness score increases with narrow preferences
- [ ] Fairness score increases when skipped
- [ ] Fairness score resets after match
- [ ] Fairness score resets after video date
- [ ] Everyone eventually reaches front of queue

#### 2.5 Race Conditions
- [ ] No duplicate matches created
- [ ] Atomic pair creation works
- [ ] Users can't match multiple people simultaneously
- [ ] Queue locking prevents conflicts
- [ ] Concurrent spins handled correctly

#### 2.6 Edge Cases
- [ ] Only one user in queue (should wait or expand preferences)
- [ ] No compatible users (preferences should expand)
- [ ] User leaves during pairing (should handle cleanup)
- [ ] Network issues during pairing (should recover)

### 3. VIDEO DATE FLOW

#### 3.1 Date Initiation
- [ ] Both users vote "yes" → video date starts
- [ ] Video date record created in database
- [ ] Both users navigate to video date page
- [ ] LiveKit room is created
- [ ] Both users get tokens
- [ ] Both users connect to room

#### 3.2 Countdown Timer (15 seconds)
- [ ] Countdown starts when both users connect
- [ ] Countdown is synchronized between both users
- [ ] Both users see same countdown time
- [ ] Countdown uses database `NOW()` for sync
- [ ] Countdown continues correctly on page refresh
- [ ] Countdown completes → date starts

#### 3.3 Main Timer (5 minutes)
- [ ] Timer starts when countdown completes
- [ ] Timer is synchronized between both users
- [ ] Both users see same remaining time
- [ ] Timer uses database RPC function for sync
- [ ] Timer continues correctly on page refresh
- [ ] Timer reaches zero → date ends

#### 3.4 Video/Audio Functionality
- [ ] Local video displays correctly
- [ ] Remote video displays correctly
- [ ] Audio works for both users
- [ ] Camera can be toggled on/off
- [ ] Microphone can be toggled on/off
- [ ] Video/audio tracks attach correctly
- [ ] Tracks handle reconnection

#### 3.5 LiveKit Connection
- [ ] Both users connect successfully
- [ ] Room state is synchronized
- [ ] Tracks are published correctly
- [ ] Tracks are subscribed correctly
- [ ] Connection errors are handled gracefully
- [ ] Reconnection works if connection drops

#### 3.6 End Date Flow
- [ ] User can click "end date" button
- [ ] Confirmation modal appears
- [ ] User confirms → date ends
- [ ] Post-date feedback modal shows
- [ ] Partner receives notification modal
- [ ] Partner clicks "ok" → redirects to spin
- [ ] Date status updated to `ended_early`

#### 3.7 Timer Synchronization
- [ ] Timer tied to matchId (not user session)
- [ ] Both users see identical time
- [ ] Refresh doesn't reset timer
- [ ] Timer continues from correct time on refresh
- [ ] Database RPC functions work correctly
- [ ] Unique constraint on match_id works

#### 3.8 Contact Exchange
- [ ] Users can share contact details
- [ ] Contact details are encrypted
- [ ] Contact exchange record created
- [ ] Both users must share to exchange
- [ ] Exchange happens when both shared
- [ ] No duplicate key errors

#### 3.9 Edge Cases
- [ ] One user disconnects during date
- [ ] Network interruption during date
- [ ] User refreshes during countdown
- [ ] User refreshes during active date
- [ ] Both users refresh simultaneously
- [ ] Timer synchronization across timezones
- [ ] Multiple video dates for same matchId (should be prevented)

### 4. INTEGRATION TESTS

#### 4.1 Full Flow: Spin → Pair → Video Date
- [ ] User A spins
- [ ] User B spins
- [ ] Both get matched
- [ ] Both vote "yes"
- [ ] Video date starts
- [ ] Countdown works
- [ ] Main timer works
- [ ] Both can see/hear each other
- [ ] Date completes successfully

#### 4.2 Full Flow: Spin → Pair → Vote Pass
- [ ] User A spins
- [ ] User B spins
- [ ] Both get matched
- [ ] One votes "pass"
- [ ] Pair ends
- [ ] Both return to spin
- [ ] Can spin again

#### 4.3 Full Flow: Spin → Pair → End Date Early
- [ ] User A spins
- [ ] User B spins
- [ ] Both get matched
- [ ] Both vote "yes"
- [ ] Video date starts
- [ ] User A ends date
- [ ] Confirmation modal shows
- [ ] User A confirms
- [ ] Post-date modal shows for User A
- [ ] Partner notification shows for User B
- [ ] User B clicks "ok" → redirects

### 5. PERFORMANCE TESTS

#### 5.1 Matching Performance
- [ ] Matching happens within 2 seconds (Tier 1)
- [ ] Matching happens within 10 seconds (Tier 2)
- [ ] Matching happens within 30 seconds (Tier 3)
- [ ] No memory leaks during long sessions
- [ ] Queue handles 100+ concurrent users

#### 5.2 Video Date Performance
- [ ] Video date loads within 3 seconds
- [ ] Video/audio tracks connect within 2 seconds
- [ ] Timer updates smoothly (no lag)
- [ ] No performance degradation during 5-minute date
- [ ] Handles multiple concurrent video dates

### 6. ERROR HANDLING TESTS

#### 6.1 Network Errors
- [ ] Handles network disconnection during spin
- [ ] Handles network disconnection during pairing
- [ ] Handles network disconnection during video date
- [ ] Reconnects gracefully
- [ ] Shows appropriate error messages

#### 6.2 Database Errors
- [ ] Handles RPC function failures
- [ ] Handles unique constraint violations
- [ ] Handles missing records
- [ ] Handles race conditions
- [ ] Logs errors correctly

#### 6.3 LiveKit Errors
- [ ] Handles connection failures
- [ ] Handles track subscription failures
- [ ] Handles room disconnection
- [ ] Shows appropriate error messages
- [ ] Allows reconnection

## Test Execution Plan

### Phase 1: Unit Tests
- Test individual functions
- Test state management
- Test utility functions

### Phase 2: Integration Tests
- Test API routes
- Test database functions
- Test RPC functions

### Phase 3: E2E Tests
- Test full user flows
- Test browser interactions
- Test real-time updates

### Phase 4: Load Tests
- Test with multiple concurrent users
- Test queue performance
- Test video date performance

## Test Data Requirements

### Test Users
- Multiple test user accounts
- Different preferences
- Different locations
- Different ages

### Test Scenarios
- Happy path scenarios
- Edge case scenarios
- Error scenarios
- Performance scenarios

## Success Criteria

### Spinning
- ✅ 100% of spins result in pairing (no empty results)
- ✅ Average matching time < 10 seconds
- ✅ No race conditions
- ✅ Fairness system works correctly

### Pairing
- ✅ All pairs are valid (preferences match)
- ✅ No duplicate matches
- ✅ Fairness scores work correctly
- ✅ Preference expansion works

### Video Date
- ✅ Timer synchronization works 100% of the time
- ✅ Both users see identical timers
- ✅ Refresh doesn't break timer
- ✅ Video/audio works for both users
- ✅ End date flow works correctly

## Test Automation

### Continuous Testing
- Run tests on every commit
- Run tests before deployment
- Run tests in staging environment

### Test Reports
- Generate test reports
- Track test coverage
- Monitor test results

