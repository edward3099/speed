# Spin Logic Rebuild: Zero Issues Architecture

## Core Design Principle

**Eliminate complexity, don't manage it.**

The previous implementation failed because it tried to handle edge cases with more code. This rebuild eliminates edge cases by design.

---

## Fundamental Architecture Decisions

### Decision 1: Single Source of Truth

**Problem**: Previous system had `queue` table AND `users_state` table, requiring synchronization.

**Solution**: Eliminate `queue` table entirely. Queue is just: `SELECT * FROM users_state WHERE state='waiting' AND last_active > NOW() - INTERVAL '10 seconds'`

**Why This Eliminates Issues**:
- No synchronization needed (one table, one source)
- No materialized view refresh delays
- Direct queries with indexes are fast
- Simpler to reason about

### Decision 2: Event-Driven Matching, Not Polling

**Problem**: Previous system used cron jobs to poll and match, causing delays and race conditions.

**Solution**: Matching triggered immediately when user joins queue. When `join_queue()` completes, immediately call matching function for that user.

**Why This Eliminates Issues**:
- Zero delay (immediate matching)
- No wasted cycles (only runs when needed)
- Simpler than scheduled jobs
- No race conditions from concurrent cron jobs

### Decision 3: Minimal State Machine (3 States Only)

**Problem**: Previous system had 6+ states with complex transitions.

**Solution**: Only 3 states: `idle`, `waiting`, `matched`

**State Definitions**:
- `idle`: User not in queue, can press spin
- `waiting`: User in queue, actively waiting for match
- `matched`: User matched with partner, in voting window

**Why This Eliminates Issues**:
- Fewer states = fewer invalid state combinations
- Clearer transitions
- Easier to reason about
- Database constraints can enforce valid states

### Decision 4: Outcome-Based, Not Vote-Tracking

**Problem**: Previous system tracked votes separately and determined outcomes in multiple places.

**Solution**: Single `outcome` field in `matches` table. Determine outcome once when both votes received OR timeout. All outcome handling in one place.

**Why This Eliminates Issues**:
- Single source of truth for outcome
- No vote tracking complexity
- All outcome logic in one function
- No race conditions between vote recording and outcome determination

### Decision 5: Database Constraints Enforce Validity

**Problem**: Previous system relied on application logic to prevent invalid states.

**Solution**: Database CHECK constraints and foreign keys enforce valid states at the database level.

**Constraints**:
- `state` must be valid enum
- `match_id` must exist in `matches` if `state='matched'`
- `partner_id` must exist in `profiles` if `state='matched'`
- `match_id` must be NULL if `state IN ('idle', 'waiting')`

**Why This Eliminates Issues**:
- Database prevents invalid states (cannot be bypassed)
- Application errors cannot corrupt data
- Self-documenting (constraints show what's valid)

---

## Database Schema (Simplified)

### Table: `users_state`

**Purpose**: Single source of truth for all user state.

**Columns**:
- `user_id` (PK, UUID)
- `state` (enum: idle, waiting, matched) - CHECK constraint
- `match_id` (FK to matches, NULLABLE) - CHECK: NULL if state != 'matched'
- `partner_id` (FK to profiles, NULLABLE) - CHECK: NULL if state != 'matched'
- `waiting_since` (timestamptz, NULLABLE) - Set when entering waiting
- `fairness` (integer, default 0) - Increases with boosts
- `last_active` (timestamptz) - Heartbeat timestamp, critical for online detection
- `updated_at` (timestamptz)

**Indexes**:
- Primary: `user_id`
- Matching: `(state, last_active)` WHERE `state='waiting'`
- Fairness: `(fairness DESC, waiting_since ASC)` WHERE `state='waiting'`
- Match lookup: `(match_id)` WHERE `match_id IS NOT NULL`

**Constraints**:
- `state` IN ('idle', 'waiting', 'matched')
- If `state='matched'`, then `match_id IS NOT NULL` AND `partner_id IS NOT NULL`
- If `state IN ('idle', 'waiting')`, then `match_id IS NULL` AND `partner_id IS NULL`

### Table: `matches`

**Purpose**: Match records with outcome.

**Columns**:
- `match_id` (PK, UUID)
- `user1_id` (FK to profiles)
- `user2_id` (FK to profiles)
- `status` (enum: active, completed, cancelled)
- `outcome` (enum: both_yes, yes_pass, pass_pass, pass_idle, yes_idle, idle_idle, NULL)
- `vote_window_expires_at` (timestamptz, NULLABLE)
- `user1_vote` (enum: yes, pass, NULL)
- `user2_vote` (enum: yes, pass, NULL)
- `created_at`, `updated_at`

**Indexes**:
- Primary: `match_id`
- Users: `(user1_id, user2_id)`
- Status: `(status)` WHERE `status='active'`

**Constraints**:
- `user1_id != user2_id`
- `outcome` only set when `status='completed'`
- `vote_window_expires_at` only set when `status='active'`

### Table: `match_history`

**Purpose**: Permanent record of all matches (prevents rematching).

**Columns**:
- `user1_id` (PK, FK to profiles)
- `user2_id` (PK, FK to profiles)
- `match_id` (FK to matches)
- `created_at`

**Indexes**:
- Primary: `(user1_id, user2_id)`
- Reverse: `(user2_id, user1_id)` - for bidirectional lookup

**Constraint**:
- `user1_id < user2_id` - ensures consistent ordering (prevents duplicates)

---

## Core Functions (Minimal Set)

### Function 1: `join_queue(p_user_id UUID)`

**Purpose**: Add user to queue (idle → waiting).

**Single Operation**:
```sql
UPDATE users_state
SET 
  state = 'waiting',
  waiting_since = NOW(),
  last_active = NOW(),
  match_id = NULL,
  partner_id = NULL,
  updated_at = NOW()
WHERE user_id = p_user_id
  AND state IN ('idle', 'waiting', 'matched')  -- Allow rejoin from matched state
```

**Why This Works**:
- Single atomic operation
- Idempotent (safe to call multiple times)
- Database constraint ensures valid state
- Immediately eligible (last_active set)

**After This Function**:
- Immediately call `try_match_user(p_user_id)` to attempt matching

### Function 2: `try_match_user(p_user_id UUID)`

**Purpose**: Try to match this specific user with a partner.

**Process**:
1. Acquire advisory lock on user
2. Verify user still in `waiting` state and online
3. Find best partner (query with proper ordering)
4. If partner found:
   - Acquire lock on partner
   - Verify partner still available
   - Create match (atomic transaction)
   - Update both users to `matched` state
   - Record in match_history
5. Return match_id or NULL

**Why This Works**:
- Advisory locks prevent races
- Double-check ensures consistency
- Single transaction (all or nothing)
- Called immediately after join (event-driven)

### Function 3: `acknowledge_match(p_user_id UUID, p_match_id UUID)`

**Purpose**: User acknowledges match, starts vote window if both acknowledged.

**Process**:
1. Verify user is part of match
2. Update match: Set `user1_acknowledged` or `user2_acknowledged` timestamp
3. Check if both acknowledged:
   - If yes: Update match `status='active'`, set `vote_window_expires_at`
   - Update both users: `state='matched'` (already matched, but now voting active)
4. Return vote window expiry time

**Why This Works**:
- Idempotent (safe to call multiple times)
- Both users must acknowledge before voting
- Clear transition point

### Function 4: `record_vote(p_user_id UUID, p_match_id UUID, p_vote TEXT)`

**Purpose**: Record vote and determine outcome if complete.

**Process**:
1. Validate match exists and vote window not expired
2. Update match: Set `user1_vote` or `user2_vote`
3. Check if both votes received:
   - If yes: Determine outcome, apply boosts, update states, record history
   - If no: Return "waiting for partner"
4. Return outcome or waiting status

**Outcome Handling** (all in one place):
- `both_yes`: Both → `idle`, create video_date
- `yes_pass`: Both → `waiting` (auto-requeue), yes user +10 boost
- `pass_pass`: Both → `waiting` (auto-requeue)
- `pass_idle`: Pass → `waiting`, idle → `idle`
- `yes_idle`: Yes → `waiting` with +10 boost, idle → `idle`
- `idle_idle`: Both → `idle`

**Why This Works**:
- Single function handles all outcomes
- Atomic operation
- No separate timeout function needed (handled here)

### Function 5: `resolve_expired_votes()`

**Purpose**: Handle vote windows that expired (idle+idle case).

**Process**:
1. Find matches where `vote_window_expires_at < NOW()` AND `status='active'` AND `outcome IS NULL`
2. For each: Determine outcome (idle+idle), update states
3. Return count

**Why This Works**:
- Only handles timeout case
- Same outcome logic as `record_vote` (no duplication)
- Called by cron every 10 seconds

### Function 6: `handle_disconnect(p_user_id UUID)`

**Purpose**: Handle user going offline.

**Process**:
1. Check user's current state
2. Based on state:
   - `waiting`: Set to `idle`
   - `matched`: Cancel match, return partner to `waiting`
   - Handle partner according to voting logic if in voting
3. Return partner's new state

**Why This Works**:
- All disconnect scenarios in one place
- Explicit partner handling
- No ambiguity

---

## Matching Engine: Event-Driven

### Trigger: On `join_queue` completion

**Flow**:
1. User calls `join_queue(user_id)`
2. Function completes (user now in `waiting` state)
3. Immediately call `try_match_user(user_id)`
4. If match found: Both users notified via WebSocket
5. If no match: User stays in `waiting`, will be matched when next user joins

**Why Event-Driven**:
- Zero delay (immediate matching)
- No wasted cycles (only runs when user joins)
- Simpler than cron jobs
- No race conditions

### Fairness Algorithm

**Implementation**:
- Query: `SELECT * FROM users_state WHERE state='waiting' AND last_active > NOW() - INTERVAL '10 seconds' ORDER BY fairness DESC, waiting_since ASC`
- No complex calculations
- `fairness` increases with boosts (+10 for yes votes)
- `waiting_since` used directly in ORDER BY (no conversion needed)

**Why Simple**:
- No time-based fairness calculations
- Just order by existing values
- Predictable and fast

### Match History Prevention

**Implementation**:
- Before matching: `NOT EXISTS (SELECT 1 FROM match_history WHERE (user1_id, user2_id) IN ((A, B), (B, A)))`
- After match: `INSERT INTO match_history (user1_id, user2_id, match_id) VALUES (LEAST(A, B), GREATEST(A, B), match_id)`
- Constraint: `user1_id < user2_id` ensures consistent ordering

**Why This Works**:
- Single check, single insert
- Bidirectional lookup with composite index
- Database constraint prevents duplicates
- Fast and reliable

---

## API Design

### POST `/api/spin`

**Flow**:
1. Call `join_queue(user_id)`
2. Immediately call `try_match_user(user_id)`
3. Return: `{ matched: boolean, match_id?: UUID }`

**Response Handling**:
- If `matched=true`: Frontend redirects to `/voting-window?matchId=X`
- If `matched=false`: Frontend redirects to `/spinning`

**Why Simple**:
- Single endpoint does everything
- Immediate response
- No polling needed initially

### GET `/api/match/status`

**Purpose**: Check current match status (for spinning page).

**Returns**:
- Current state
- Match info if matched
- Partner info if matched

**Used By**:
- Spinning page (polls every 2 seconds as fallback)
- Real-time updates via WebSocket (primary method)

### POST `/api/match/acknowledge`

**Purpose**: User acknowledges match.

**Flow**:
1. Call `acknowledge_match(user_id, match_id)`
2. Return vote window expiry time
3. Frontend starts countdown

### POST `/api/vote`

**Purpose**: Record vote.

**Flow**:
1. Call `record_vote(user_id, match_id, vote)`
2. Return outcome if determined, or "waiting for partner"
3. Frontend handles outcome

### POST `/api/heartbeat`

**Purpose**: Update last_active timestamp.

**Flow**:
1. `UPDATE users_state SET last_active = NOW() WHERE user_id = X`
2. Called every 7 seconds from spinning page

---

## Frontend Flow

### `/spin` Page
- Button: "Start Spin"
- Action: `POST /api/spin`
- On success: Redirect based on `matched` flag

### `/spinning` Page
- Animation: Spinning indicator
- Heartbeat: Every 7 seconds
- Real-time: WebSocket subscription to `users_state` changes
- Fallback: Poll `/api/match/status` every 2 seconds
- On match: Redirect to `/voting-window`

### `/voting-window` Page
- Load: Call `POST /api/match/acknowledge`
- UI: Partner profile, countdown, Yes/Pass buttons
- Vote: Call `POST /api/vote` on button click
- Poll: Check outcome every 1 second
- Outcome handling:
  - `both_yes`: Redirect to `/video-date`
  - `yes_pass` or `pass_pass`: Auto-redirect to `/spinning`
  - `pass_idle` or `yes_idle`: Show message, redirect to `/spin`
  - `idle_idle`: Show message, redirect to `/spin`

---

## Disconnect Handling

### Detection
- Cron job every 10 seconds
- Find: `SELECT user_id FROM users_state WHERE last_active < NOW() - INTERVAL '10 seconds' AND state IN ('waiting', 'matched')`
- For each: Call `handle_disconnect(user_id)`

### Scenarios

**Case A: Disconnect During Spinning**
- State: `waiting`
- Action: Set to `idle`
- Result: Removed from queue, must press spin on return

**Case B: Disconnect During Voting**
- State: `matched` (voting active)
- Action: Determine outcome based on partner's vote
- Result: Partner handled, disconnected user set to `idle`

**Case C: Disconnect at Match Formation**
- State: `matched` (just matched)
- Action: Cancel match, return partner to `waiting`
- Result: Partner auto-requeued, disconnected user set to `idle`

---

## High Traffic Optimization

### Event-Driven Scaling
- Each join triggers one matching attempt
- No batch processing needed (events are naturally distributed)
- If queue is large, process multiple matches per join (up to 5)

### Database Optimization
- Proper indexes on all query patterns
- Direct queries (no materialized views)
- Connection pooling (Supabase Pro: 200 connections)
- Query optimization (EXPLAIN ANALYZE)

### Performance Targets
- Matching latency: < 500ms (event-driven, immediate)
- Vote processing: < 50ms (single update)
- Handles 500 concurrent users
- No degradation under load

---

## Concurrency: Eliminated by Design

### No Race Conditions Possible

**Why**:
1. Event-driven: Only one event per user at a time
2. Advisory locks: Prevent concurrent processing
3. Database constraints: Prevent invalid states
4. Atomic operations: All-or-nothing

### Advisory Locks
- Acquire before matching user
- Non-blocking (`pg_try_advisory_xact_lock`)
- Released automatically on transaction commit

### Double-Check Locking
- Check state after acquiring lock
- Verify user still available
- Prevents races

---

## Testing: Scenario Verification

### Scenario 1: Staggered Joins
- A joins → waiting
- B joins → A+B matched immediately
- C joins → waiting
- Verify: A+B matched, C waiting

### Scenario 2: Fairness
- A waits 3 minutes
- B joins → A+B matched immediately
- Verify: A matched (fairness respected)

### Scenario 3: Voting Outcomes
- Test all 7 outcomes
- Verify: Correct transitions, boosts, requeue

### Scenario 4: Disconnects
- Test all 3 cases
- Verify: Correct handling

### Scenario 5: High Traffic
- 500 concurrent users
- Verify: All matched, fairness, no stuck users

### Scenario 6: Concurrency
- Simultaneous joins/leaves
- Verify: No duplicates, no stuck users

### Scenario 7: Match History
- Match → outcome → try again
- Verify: Prevented by history

---

## Implementation Phases

### Phase 1: Database Simplification
1. Remove `queue` table
2. Remove materialized views
3. Simplify `users_state` (remove unnecessary columns)
4. Add database constraints
5. Create proper indexes

### Phase 2: Core Functions
1. Implement `join_queue` (simplified)
2. Implement `try_match_user` (event-driven)
3. Test Scenario 1 and 2

### Phase 3: Voting System
1. Implement `acknowledge_match`
2. Implement `record_vote` (all outcomes)
3. Implement `resolve_expired_votes`
4. Test Scenario 3

### Phase 4: Disconnect Handling
1. Implement `handle_disconnect`
2. Create disconnect detector
3. Test Scenario 4

### Phase 5: Optimization
1. Optimize queries
2. Add connection pooling
3. Load test (Scenario 5)

### Phase 6: Concurrency Testing
1. Test concurrent operations
2. Verify locks work
3. Test Scenario 6

### Phase 7: Final Testing
1. All scenarios end-to-end
2. Edge cases
3. Performance tuning

---

## Key Architectural Differences

### What We Eliminated
- Separate queue table
- Materialized views
- Complex state machine (6+ states)
- Polling-based matching
- Separate vote tracking
- Complex fairness calculations
- Multiple outcome determination functions

### What We Added
- Database constraints (enforce validity)
- Event-driven matching (immediate)
- Minimal state machine (3 states)
- Single outcome function
- Direct queries with indexes

### Why This Eliminates Issues
- Fewer moving parts = fewer failure points
- Database constraints = cannot get into invalid state
- Event-driven = no delays, no wasted cycles
- Atomic operations = all-or-nothing, no partial updates
- Idempotent functions = safe to retry
- Single source of truth = no synchronization issues

---

## Success Metrics

### Functional
- All 7 scenarios pass
- Zero edge case failures
- Zero stuck users
- Zero duplicate matches
- Perfect fairness

### Performance
- Matching: < 500ms
- Voting: < 50ms
- 500 concurrent users
- No degradation

### Reliability
- Zero race conditions
- Zero state inconsistencies
- Database constraints prevent invalid states
- All operations idempotent

---

## Conclusion

This architecture eliminates issues by eliminating complexity:

1. **Single Source of Truth**: No synchronization needed
2. **Event-Driven**: Immediate matching, no delays
3. **Minimal States**: Only 3 states, clear transitions
4. **Database Constraints**: Invalid states impossible
5. **Atomic Operations**: All-or-nothing, no partial updates
6. **Idempotent Functions**: Safe to retry, no side effects

By designing for simplicity, we eliminate the need to handle edge cases. The system cannot fail in ways that weren't designed for, because invalid states and race conditions are impossible by design.


