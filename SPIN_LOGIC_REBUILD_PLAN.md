# Spin Logic Rebuild Plan - Zero Issues Architecture

## Philosophy: Simplicity Through Design

The previous implementation failed because it tried to handle complexity with more complexity. This rebuild takes the opposite approach: **eliminate complexity at the design level**.

**Core Principle**: If an operation can fail, design it so it cannot fail. If a race condition can occur, design it so races are impossible.

---

## Architecture Overview

### Design Philosophy

**1. Event-Driven, Not Polling**
- Matching triggered immediately when user joins (not on schedule)
- Real-time notifications via Supabase Realtime (already exists)
- No cron jobs for matching (only for cleanup tasks)

**2. Single Source of Truth**
- One table: `users_state` - contains ALL user state
- No separate queue table (queue is just `users_state WHERE state='waiting'`)
- No materialized views (direct queries with proper indexes)

**3. Atomic Operations Only**
- Every state change is a single SQL transaction
- No multi-step operations that can fail mid-way
- Idempotent functions (safe to call multiple times)

**4. Minimal State Machine**
- Only 4 states: `idle`, `waiting`, `matched`, `voting`
- No intermediate states
- Clear transitions only

**5. Outcome-Based, Not Vote-Based**
- Don't track individual votes during window
- Only determine outcome when both votes received OR timeout
- Single function handles all outcomes

---

## State Model

### States (Minimal Set)

**idle**
- User not in queue
- Can press spin to join

**waiting**
- User in queue, actively waiting
- Must have `last_active` within 10 seconds
- Has `waiting_since` timestamp for fairness

**matched**
- User matched with partner
- Has `match_id` and `partner_id`
- Waiting for both to acknowledge (transition to voting)

**voting**
- Both users acknowledged
- Vote window active (10 seconds)
- Waiting for votes or timeout

**Note**: No `video_date` or `ended` states in users_state. These are tracked in separate `video_dates` table. User returns to `idle` after video date ends.

### State Transitions (Only 4)

1. `idle` → `waiting` (user presses spin)
2. `waiting` → `matched` (matching engine finds partner)
3. `matched` → `voting` (both users acknowledge)
4. `voting` → `idle` or `waiting` (outcome determined)

**Critical**: No other transitions possible. This eliminates invalid states.

---

## Database Design

### Single Table: `users_state`

**Columns**:
- `user_id` (PK)
- `state` (enum: idle, waiting, matched, voting)
- `match_id` (FK to matches, NULL if not matched)
- `partner_id` (FK to profiles, NULL if not matched)
- `waiting_since` (timestamptz, set when entering waiting)
- `fairness` (integer, default 0, increases with boosts)
- `last_active` (timestamptz, heartbeat timestamp)
- `updated_at` (timestamptz)

**Indexes**:
- `(state, last_active)` WHERE `state='waiting'` - for finding matchable users
- `(fairness DESC, waiting_since ASC)` WHERE `state='waiting'` - for fairness ordering
- `(match_id)` WHERE `match_id IS NOT NULL` - for finding matches

**Why Single Table?**
- No synchronization issues between queue and users_state
- No materialized view refresh delays
- Direct queries are fast with proper indexes
- Simpler to reason about

### Match Table: `matches`

**Columns**:
- `match_id` (PK)
- `user1_id`, `user2_id` (FK to profiles)
- `status` (enum: active, completed, cancelled)
- `outcome` (enum: both_yes, yes_pass, pass_pass, pass_idle, yes_idle, idle_idle)
- `vote_window_expires_at` (timestamptz)
- `created_at`, `updated_at`

**Indexes**:
- `(user1_id, user2_id)` - for match history lookup
- `(status)` WHERE `status='active'` - for finding active matches

### Match History Table: `match_history`

**Columns**:
- `user1_id`, `user2_id` (PK, composite)
- `match_id` (FK to matches)
- `created_at`

**Indexes**:
- `(user1_id, user2_id)` - bidirectional lookup
- `(user2_id, user1_id)` - reverse lookup

**Why Composite PK?**
- Prevents duplicate entries
- Fast bidirectional lookup
- No need for separate indexes

### Votes Table: `votes`

**Columns**:
- `match_id` (PK, FK to matches)
- `user1_vote` (enum: yes, pass, NULL)
- `user2_vote` (enum: yes, pass, NULL)
- `updated_at`

**Why Single Row Per Match?**
- No need to query multiple rows
- Atomic updates
- Simpler outcome determination

---

## Core Functions (Minimal Set)

### Function 1: `join_queue(p_user_id UUID)`

**Purpose**: Add user to queue (transition idle → waiting)

**Logic**:
1. Validate user exists and has valid gender
2. Check if user can join (not already in invalid state)
3. Single UPDATE/INSERT:
   - Set `state = 'waiting'`
   - Set `waiting_since = NOW()`
   - Set `last_active = NOW()`
   - Preserve existing `fairness`
   - Clear `match_id` and `partner_id`

**Why This Works**:
- Idempotent (safe to call multiple times)
- Atomic (single operation)
- No separate queue table to sync
- Immediate eligibility (last_active set)

**Edge Cases Handled**:
- User already waiting → No-op (idempotent)
- User in matched state → Clear match, rejoin queue
- User in voting state → Clear match, rejoin queue

### Function 2: `find_and_create_match()`

**Purpose**: Find one pair and create match (triggered on join_queue)

**Logic**:
1. Get user who just joined (or longest waiting user if batch)
2. Acquire advisory lock on user
3. Double-check user still waiting and online
4. Find best partner:
   - Query `users_state` WHERE `state='waiting'` AND `last_active > NOW() - INTERVAL '10 seconds'`
   - Exclude: same user, already matched, offline, match history exists
   - Order by: `fairness DESC, waiting_since ASC`
   - LIMIT 1
5. If partner found:
   - Acquire advisory lock on partner
   - Double-check partner still available
   - Create match record
   - Update both users: `state='matched'`, set `match_id` and `partner_id`
   - Record in match_history
6. Return match_id or NULL

**Why This Works**:
- Advisory locks prevent race conditions
- Double-check locking ensures consistency
- Single transaction (all or nothing)
- Triggered on event (not polling)

**Edge Cases Handled**:
- User matched by another process → Skip (lock prevents)
- Partner becomes unavailable → Skip (double-check catches)
- Both users try to match each other → One succeeds, one skips (lock prevents)

### Function 3: `acknowledge_match(p_user_id UUID, p_match_id UUID)`

**Purpose**: User acknowledges match (transition matched → voting)

**Logic**:
1. Validate user is part of match
2. Update user's `acknowledged_at` timestamp in match record
3. Check if both users acknowledged:
   - If yes: Update match `status='voting'`, set `vote_window_expires_at = NOW() + INTERVAL '10 seconds'`
   - Update both users: `state='voting'`
4. Return vote window expiry time

**Why This Works**:
- Idempotent (safe to call multiple times)
- Atomic (single transaction)
- Both users must acknowledge before voting starts

### Function 4: `record_vote(p_user_id UUID, p_match_id UUID, p_vote TEXT)`

**Purpose**: Record vote and determine outcome if both voted

**Logic**:
1. Validate match exists and user is part of it
2. Validate vote window not expired
3. Update votes table: Set `user1_vote` or `user2_vote` based on which user
4. Check if both votes received:
   - If yes: Determine outcome immediately
   - If no: Return "waiting for partner"
5. If outcome determined:
   - Update match: `outcome = X`, `status = 'completed'`
   - Apply boosts (if yes+pass or yes+idle)
   - Update user states based on outcome
   - Record in match_history

**Outcome Handling**:
- `both_yes`: Both → `idle`, create video_date
- `yes_pass`: Both → `waiting` (auto-requeue), yes user gets +10 boost
- `pass_pass`: Both → `waiting` (auto-requeue)
- `pass_idle`: Pass user → `waiting`, idle user → `idle`
- `yes_idle`: Yes user → `waiting` with +10 boost, idle user → `idle`
- `idle_idle`: Both → `idle`

**Why This Works**:
- Single function handles all outcomes
- Atomic operation
- No separate timeout checker needed (handled in same function)

### Function 5: `check_vote_timeout()`

**Purpose**: Handle expired vote windows (idle+idle case)

**Logic**:
1. Find matches where `vote_window_expires_at < NOW()` AND `status='voting'` AND `outcome IS NULL`
2. For each match:
   - Determine outcome based on votes received (or lack thereof)
   - Apply same outcome handling as `record_vote`
3. Return count of resolved matches

**Why This Works**:
- Only handles timeout case (idle+idle)
- Same outcome logic as `record_vote` (no duplication)
- Called by cron every 10 seconds

### Function 6: `handle_disconnect(p_user_id UUID)`

**Purpose**: Handle user disconnection

**Logic**:
1. Check user's current state:
   - If `waiting`: Set `state='idle'`, remove from queue
   - If `matched`: Cancel match, return partner to `waiting`
   - If `voting`: Determine outcome based on partner's vote, handle accordingly
2. Update match status to `cancelled` if applicable
3. Return partner's new state

**Why This Works**:
- Handles all disconnect scenarios in one place
- Partner state recovery is explicit
- No ambiguity about what happens

---

## Matching Engine Design

### Event-Driven Matching

**Trigger**: When `join_queue` is called

**Process**:
1. User joins queue (state → waiting)
2. Immediately call `find_and_create_match()` for this user
3. If no match found, user stays in waiting
4. When another user joins, try to match them with existing waiters

**Why Event-Driven?**
- Immediate matching (no polling delay)
- No wasted cycles when queue is empty
- Simpler than scheduled matching

### Fairness Algorithm

**Fairness Score Calculation**:
- Base: Existing fairness (from previous matches)
- Boost: +10 if user voted "yes" but partner passed/idled
- Waiting Time: Already handled by `ORDER BY fairness DESC, waiting_since ASC`

**No Complex Calculations**:
- Don't calculate waiting time into fairness score
- Just use `waiting_since` in ORDER BY clause
- Simpler, more predictable

### Match History Prevention

**Implementation**:
- Check before matching: `NOT EXISTS (SELECT 1 FROM match_history WHERE (user1_id, user2_id) = (A, B) OR (user2_id, user1_id) = (A, B))`
- Record after match: `INSERT INTO match_history (user1_id, user2_id, match_id) VALUES (A, B, match_id)`
- Indexed for fast lookup

**Why This Works**:
- Single check, single insert
- Bidirectional lookup with composite index
- Permanent (never deleted)

---

## API Endpoints

### POST `/api/spin`
- Calls `join_queue(user_id)`
- Immediately calls `find_and_create_match()` for this user
- Returns: `{ success: true, matched: boolean, match_id?: UUID }`
- If matched: Frontend redirects to voting window
- If not matched: Frontend shows spinning page

### GET `/api/match/status`
- Returns current user state and match info
- Used by spinning page to check for matches
- Real-time updates via WebSocket (already implemented)

### POST `/api/match/acknowledge`
- Calls `acknowledge_match(user_id, match_id)`
- Returns vote window expiry time
- Frontend starts countdown

### POST `/api/vote`
- Calls `record_vote(user_id, match_id, vote)`
- Returns outcome if determined, or "waiting for partner"
- Frontend handles outcome (redirect to video or auto-requeue)

### POST `/api/heartbeat`
- Updates `last_active = NOW()`
- Called every 7 seconds from spinning page
- Critical for disconnect detection

---

## Frontend Flow

### `/spin` Page
- "Start Spin" button
- Calls `POST /api/spin`
- If matched: Redirect to `/voting-window?matchId=X`
- If not matched: Redirect to `/spinning`

### `/spinning` Page
- Shows spinning animation
- Sends heartbeat every 7 seconds
- Subscribes to `users_state` changes via WebSocket
- On match detected: Redirect to `/voting-window`
- Polls `/api/match/status` every 2 seconds as fallback

### `/voting-window` Page
- Shows partner profile
- Calls `POST /api/match/acknowledge` on load
- Shows 10-second countdown
- "Yes" and "Pass" buttons
- Calls `POST /api/vote` on button click
- Polls for outcome every 1 second
- On outcome:
  - `both_yes`: Redirect to `/video-date`
  - `yes_pass` or `pass_pass`: Auto-redirect to `/spinning` (auto-requeued)
  - `pass_idle` or `yes_idle`: Show message, redirect to `/spin` (manual spin for idle user)
  - `idle_idle`: Show message, redirect to `/spin` (both manual spin)

---

## Disconnect Handling

### Detection
- Cron job every 10 seconds: Find users where `last_active < NOW() - INTERVAL '10 seconds'`
- For each offline user: Call `handle_disconnect(user_id)`

### Scenarios

**Case A: Disconnect During Spinning**
- User in `waiting` state
- `handle_disconnect` sets `state='idle'`
- User removed from queue
- On return: Must press spin manually

**Case B: Disconnect During Voting**
- User in `voting` state
- `handle_disconnect` determines outcome based on partner's vote
- Partner handled according to voting logic
- Disconnected user set to `idle`
- On return: Must press spin manually

**Case C: Disconnect at Match Formation**
- User in `matched` state
- `handle_disconnect` cancels match
- Partner returned to `waiting` (auto-requeued)
- Disconnected user set to `idle`
- On return: Must press spin manually

---

## High Traffic Optimization

### Batch Processing
- `find_and_create_match()` processes one match at a time
- Called on every `join_queue` event
- If queue is large, process multiple matches per event (up to 10)

### Connection Pooling
- Supabase Pro: 200 connections
- Use connection pool for all queries
- Reuse connections efficiently

### Indexes
- All queries use indexes
- No full table scans
- Composite indexes for common query patterns

### Query Optimization
- Direct queries (no materialized views)
- Limit result sets
- Use EXPLAIN ANALYZE to verify query plans

---

## Concurrency Handling

### Advisory Locks
- Acquire lock before matching user
- Prevents multiple processes matching same user
- Non-blocking (`pg_try_advisory_xact_lock`)

### Double-Check Locking
- Check state after acquiring lock
- Verify user still available
- Prevents race conditions

### Transaction Isolation
- All operations in transactions
- ACID guarantees
- No partial updates

### SKIP LOCKED
- Not needed (event-driven, not batch processing)
- Each event processes one user
- No concurrent processing of same user

---

## Testing Strategy

### Scenario 1: Staggered Joins
- User A joins → stays waiting
- User B joins 1 second later → A and B match immediately
- User C joins 3 seconds later → stays waiting
- Verify: A and B matched, C still waiting

### Scenario 2: Fairness
- User A waits 3 minutes
- User B joins → A and B match immediately
- Verify: A matched before any newer users

### Scenario 3: Voting Outcomes
- Test all 7 outcomes
- Verify: Correct state transitions, boosts applied, auto-requeue works

### Scenario 4: Disconnects
- Test all 3 disconnect cases
- Verify: Correct handling, partner state recovery

### Scenario 5: High Traffic
- 200-500 concurrent users
- Verify: All eventually matched, fairness respected, no stuck users

### Scenario 6: Concurrency
- Multiple joins/leaves simultaneously
- Verify: No duplicate matches, no stuck users, fairness maintained

### Scenario 7: Match History
- Two users match → vote → outcome
- Try to match again → should be prevented
- Verify: History check works, fast lookup

---

## Implementation Order

### Phase 1: Core Infrastructure
1. Simplify `users_state` table (remove unnecessary columns)
2. Remove `queue` table (use users_state directly)
3. Remove materialized views
4. Create proper indexes
5. Implement `join_queue` function (simplified)

### Phase 2: Matching Engine
1. Implement `find_and_create_match` function
2. Trigger matching on `join_queue` event
3. Test Scenario 1 and 2

### Phase 3: Voting System
1. Implement `acknowledge_match` function
2. Implement `record_vote` function
3. Implement `check_vote_timeout` function
4. Test Scenario 3

### Phase 4: Disconnect Handling
1. Implement `handle_disconnect` function
2. Create disconnect detector cron job
3. Test Scenario 4

### Phase 5: Optimization
1. Optimize queries
2. Add connection pooling
3. Load test (Scenario 5)

### Phase 6: Concurrency Testing
1. Test concurrent operations
2. Verify advisory locks work
3. Test Scenario 6

### Phase 7: Integration Testing
1. Test all scenarios end-to-end
2. Fix any edge cases
3. Performance tuning

---

## Key Differences from Previous Implementation

### What We're NOT Doing
- No separate queue table
- No materialized views
- No complex state machine
- No polling-based matching
- No separate vote tracking during window
- No complex fairness calculations

### What We ARE Doing
- Single source of truth (users_state)
- Event-driven matching
- Minimal state machine
- Simple outcome determination
- Direct queries with indexes
- Atomic operations only

---

## Success Criteria

### Functional
- All 7 scenarios pass
- Zero edge case failures
- Zero stuck users
- Zero duplicate matches
- Perfect fairness

### Performance
- Matching latency: < 1 second
- Vote processing: < 100ms
- Handles 500 concurrent users
- No performance degradation

### Reliability
- Zero race conditions
- Zero state inconsistencies
- Graceful error handling
- Idempotent operations

---

## Risk Mitigation

### Race Conditions
- **Prevention**: Advisory locks + double-check locking
- **Verification**: Concurrent operation tests

### State Inconsistencies
- **Prevention**: Single source of truth, atomic operations
- **Verification**: State consistency checks

### Performance Issues
- **Prevention**: Proper indexes, direct queries, connection pooling
- **Verification**: Load testing with 500 users

### Edge Cases
- **Prevention**: Minimal state machine, clear transitions
- **Verification**: Comprehensive scenario testing

---

## Conclusion

This architecture eliminates complexity at the design level:

1. **Single Source of Truth**: No synchronization issues
2. **Event-Driven**: Immediate matching, no polling delays
3. **Minimal States**: Only 4 states, clear transitions
4. **Atomic Operations**: All-or-nothing, no partial updates
5. **Idempotent Functions**: Safe to call multiple times
6. **Simple Outcome Logic**: One function handles all cases

By designing for simplicity, we eliminate the need to handle edge cases. The system cannot get into invalid states because invalid states don't exist in the design.







