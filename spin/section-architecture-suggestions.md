# Spin Logic Section Architecture - Ensuring 100% Functionality

## Overview

The spin logic has three main sections that must work together seamlessly:
1. **Spinning** - User presses spin, joins queue
2. **Matching** - Finding partners, creating matches
3. **Voting** - Recording votes, resolving outcomes

Each section must be connected, tracked, and managed independently while coordinating with others.

---

## Section Flow Diagram

```
User Action
    ↓
┌─────────────────┐
│  SPINNING       │  Input: User presses spin
│  Section        │  Output: User in queue, state='waiting'
└─────────────────┘
    ↓ (Database State)
┌─────────────────┐
│  MATCHING       │  Input: Users in queue
│  Section        │  Output: Matched pairs, state='paired'
└─────────────────┘
    ↓ (Database State)
┌─────────────────┐
│  VOTING         │  Input: Matched pairs
│  Section        │  Output: Resolved outcomes, final states
└─────────────────┘
    ↓
Final State (idle/video-date)
```

**Key:** Database state is the connection mechanism between sections.

---

## Section 1: SPINNING

### Purpose
User presses spin button → User joins queue → Ready for matching

### Input
- User ID
- User state (should be 'idle')

### Output
- User in queue table
- User state = 'waiting'
- `waiting_since` timestamp set

### Focus Areas

#### 1. Speed (Critical)
- **Target:** <500ms total time
- **Why:** User experience - spinning should feel instant
- **How:** 
  - Fast database inserts (no complex queries)
  - No blocking operations
  - Idempotent operations (safe to retry)

#### 2. Reliability (Critical)
- **Target:** 100% success rate (no failures from race conditions)
- **Why:** If spinning fails, nothing works
- **How:**
  - Use `INSERT ... ON CONFLICT DO NOTHING` (idempotent)
  - No locks that could timeout
  - Advisory locks only if needed (non-blocking)

#### 3. State Consistency (Critical)
- **Target:** User state and queue state always match
- **Why:** Matching section reads from both
- **How:**
  - Update both in same transaction
  - Validate state before joining
  - Repair inconsistencies automatically

#### 4. Non-Blocking (Important)
- **Target:** Don't wait for matching to complete
- **Why:** Spinning should be fire-and-forget
- **How:**
  - Return immediately after joining queue
  - Trigger matching in background (don't wait)
  - Matching happens asynchronously

#### 5. Error Handling (Important)
- **Target:** Graceful failures with clear errors
- **Why:** User needs to know what went wrong
- **How:**
  - Validate user can spin (online, correct state)
  - Return clear error messages
  - Allow retries

### Tracking Spinning Section

**Metrics to Track:**
- Join success rate (should be 100%)
- Average join time (should be <500ms)
- Join failures (should be 0)
- Users stuck in 'joining' state

**Logging:**
```sql
CREATE TABLE spinning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT, -- 'join_attempted', 'join_succeeded', 'join_failed'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB
);
```

### Managing Spinning Section

**Health Checks:**
- Monitor join success rate (alert if <99%)
- Monitor average join time (alert if >1000ms)
- Detect stuck users (in 'joining' state >5s)
- Auto-repair: Reset stuck users to 'idle'

**Recovery:**
- If join fails, user can retry
- If user stuck, auto-reset to 'idle'
- If queue full, alert (but don't block)

---

## Section 2: MATCHING

### Purpose
Find compatible partners from queue → Create matches → Ready for voting

### Input
- Users in queue (state='waiting')
- User preferences, history, online status

### Output
- Matched pairs (match created)
- Both users state = 'paired'
- Match ID, partner ID

### Focus Areas

#### 1. Efficiency (Critical)
- **Target:** Process queue every 2 seconds
- **Why:** Users shouldn't wait long
- **How:**
  - Continuous background process
  - Batch processing (multiple matches per run)
  - Efficient queries (indexed, materialized views)

#### 2. Fairness (Critical)
- **Target:** Long waiters get priority
- **Why:** Scenario 2 requirement
- **How:**
  - Sort by fairness DESC, waiting_since ASC
  - Priority tiers (long waiters first)
  - Fairness boosts for long waiters

#### 3. Compatibility (Critical)
- **Target:** Only valid matches (preferences, history, online)
- **Why:** Scenario 1, 7 requirements
- **How:**
  - Two-way preference checks
  - History checks (never_pair_again)
  - Online status validation
  - Preference expansion for long waiters

#### 4. Atomicity (Critical)
- **Target:** No duplicate matches
- **Why:** Prevents race conditions
- **How:**
  - Advisory locks at entry point
  - Row-level locks during match creation
  - Database constraints (unique indexes)

#### 5. Coordination (Important)
- **Target:** Don't match same user twice
- **Why:** Prevents conflicts
- **How:**
  - Advisory locks per user
  - Double-check locking
  - Process queue with SKIP LOCKED

### Tracking Matching Section

**Metrics to Track:**
- Queue size (should stay reasonable)
- Match success rate (should be >80%)
- Average match time (should be <5s)
- Matches created per minute
- Long waiters (>60s)

**Logging:**
```sql
CREATE TABLE matching_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id),
  user1_id UUID REFERENCES profiles(id),
  user2_id UUID REFERENCES profiles(id),
  action TEXT, -- 'match_attempted', 'match_created', 'match_failed'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  queue_size INTEGER,
  wait_time_seconds INTEGER,
  failure_reason TEXT,
  metadata JSONB
);
```

### Managing Matching Section

**Health Checks:**
- Monitor queue size (alert if >100)
- Monitor match success rate (alert if <50%)
- Monitor long waiters (alert if >10 users waiting >60s)
- Detect duplicate matches (should be 0)

**Recovery:**
- If no matches found, expand preferences
- If queue grows, trigger aggressive matching
- If duplicate matches detected, cancel duplicates
- Auto-repair: Remove offline users from queue

---

## Section 3: VOTING

### Purpose
Acknowledge matches → Vote window → Record votes → Resolve outcomes → Final states

### Input
- Matched pairs (state='paired')
- Match ID, partner ID

### Output
- Resolved outcomes (both_yes, yes_pass, pass_pass)
- Users in final states (idle/video-date)
- Video-date records (if both_yes)

### Focus Areas

#### 1. Timing (Critical)
- **Target:** Acknowledgment within 2-3s, voting within 10s
- **Why:** Real-world network conditions
- **How:**
  - Increase acknowledgment timeout (2-3s instead of 500ms)
  - Store all timing in database
  - Frontend reads from database (no local calculation)

#### 2. Synchronization (Critical)
- **Target:** Frontend and backend use same timestamps
- **Why:** Timer accuracy
- **How:**
  - Store `vote_window_expires_at` in database
  - Frontend calculates remaining time from database
  - Backend validates against same timestamp

#### 3. Atomicity (Critical)
- **Target:** Vote + outcome resolution in one transaction
- **Why:** Prevents votes recorded but outcomes not resolved
- **How:**
  - Record vote and check outcome in same transaction
  - Resolve outcome immediately if both voted
  - Create video-date in same transaction as outcome

#### 4. State Transitions (Critical)
- **Target:** Clean transitions to final states
- **Why:** Users shouldn't get stuck
- **How:**
  - Validate every transition
  - Auto-repair stuck states
  - Clear final states (idle or video-date)

#### 5. Error Recovery (Important)
- **Target:** Handle timeouts, disconnects gracefully
- **Why:** Real-world failures
- **How:**
  - Acknowledgment timeout → cancel match, boost user
  - Vote timeout → resolve as idle/idle
  - Disconnect → treat as pass/idle

### Tracking Voting Section

**Metrics to Track:**
- Acknowledgment success rate (should be >95%)
- Vote success rate (should be >90%)
- Outcome resolution rate (should be 100%)
- Average time in voting section (should be <15s)
- Stuck users (in vote_window but expired)

**Logging:**
```sql
CREATE TABLE voting_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(match_id),
  user_id UUID REFERENCES profiles(id),
  action TEXT, -- 'acknowledged', 'vote_recorded', 'outcome_resolved', 'video_date_created'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  vote_value TEXT, -- 'yes', 'pass'
  outcome TEXT, -- 'both_yes', 'yes_pass', 'pass_pass'
  metadata JSONB
);
```

### Managing Voting Section

**Health Checks:**
- Monitor acknowledgment rate (alert if <90%)
- Monitor vote success rate (alert if <80%)
- Monitor stuck users (in vote_window >15s)
- Detect unresolved outcomes (should be 0)

**Recovery:**
- If acknowledgment timeout, cancel match
- If vote timeout, resolve as idle/idle
- If outcome not resolved, auto-resolve
- Auto-repair: Fix stuck users in vote_window

---

## How Sections Connect

### Connection Mechanism: Database State

**The Flow:**
1. **Spinning** sets `state='waiting'` → Matching reads `state='waiting'`
2. **Matching** sets `state='paired'` → Voting reads `state='paired'`
3. **Voting** sets `state='idle'` or creates video-date → Flow complete

**Why Database State:**
- Single source of truth
- Persistent (survives restarts)
- Queryable (can check state anytime)
- Atomic (transactions ensure consistency)

### Connection Pattern: Event-Driven + Polling

**Fast Path (Event-Driven):**
- User joins queue → Trigger immediate matching attempt
- Match created → Trigger immediate acknowledgment
- Both acknowledge → Trigger immediate vote window

**Guaranteed Path (Polling):**
- Background process polls queue every 2 seconds
- Background process polls matches every 2 seconds
- Background process polls vote windows every 2 seconds

**Why Both:**
- Events = fast (immediate processing)
- Polling = guaranteed (nothing missed)
- If event fails, polling catches it

### Section Handoff Validation

**Before Spinning → Matching:**
- ✅ User is in queue
- ✅ User state is 'waiting'
- ✅ User is online
- ✅ User not already matched

**Before Matching → Voting:**
- ✅ Match exists
- ✅ Both users in 'paired' state
- ✅ Match is valid (not cancelled)
- ✅ Both users online

**Before Voting → Final:**
- ✅ Outcome is resolved
- ✅ All records created (video-date if both_yes)
- ✅ Users in final states
- ✅ History updated

---

## Recommendations for 100% Functionality

### 1. Section Isolation with Clear Interfaces ⭐ CRITICAL

**What:**
- Each section has clear input/output interface
- Sections don't know about each other's internals
- Sections communicate only via database state

**Why:**
- Makes sections independent and testable
- Prevents tight coupling
- Easier to debug and maintain

**Implementation:**
```typescript
// Spinning Section Interface
interface SpinningSection {
  input: { userId: string }
  output: { success: boolean, state: 'waiting' | 'idle' }
}

// Matching Section Interface
interface MatchingSection {
  input: { queue: User[] }
  output: { matchesCreated: number }
}

// Voting Section Interface
interface VotingSection {
  input: { matchId: string, userId: string }
  output: { success: boolean, outcome?: string }
}
```

**Priority:** 🔴 P0 - Must have

---

### 2. Section State Tracking ⭐ CRITICAL

**What:**
- Track which section each user is in
- Track section-specific state (not just user state)
- Log section transitions

**Why:**
- Visibility into where users are
- Debug which section is broken
- Identify bottlenecks

**Implementation:**
```sql
ALTER TABLE users_state ADD COLUMN section TEXT;
-- Values: 'spinning', 'matching', 'voting', 'complete'

ALTER TABLE users_state ADD COLUMN section_entered_at TIMESTAMPTZ;
ALTER TABLE users_state ADD COLUMN section_state JSONB;
-- Spinning: { joining: true, queue_joined: false }
-- Matching: { searching: true, match_found: false }
-- Voting: { acknowledging: true, voting: false, outcome: null }
```

**Priority:** 🔴 P0 - Must have

---

### 3. Section Health Monitoring ⭐ CRITICAL

**What:**
- Each section reports its health metrics
- Real-time dashboard showing section performance
- Alerts when section health drops

**Why:**
- Know which section is broken
- Identify issues before users notice
- Track performance over time

**Implementation:**
```sql
CREATE TABLE section_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL, -- 'spinning', 'matching', 'voting'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success_rate NUMERIC, -- 0-100
  average_time_ms INTEGER,
  error_count INTEGER,
  active_users INTEGER,
  health_score INTEGER -- 0-100
);

-- Update every 10 seconds
-- Alert if health_score < 70
```

**Priority:** 🔴 P0 - Must have

---

### 4. Section Coordination Locks

**What:**
- When matching section processes a user, lock that user
- When voting section processes a match, lock that match
- Prevents multiple sections from processing same user/match

**Why:**
- Prevents conflicts between sections
- Ensures sections don't interfere with each other

**Implementation:**
```sql
-- Advisory locks for section coordination
-- Matching: Lock user ID before processing
-- Voting: Lock match ID before processing
-- Use non-blocking locks (skip if already locked)
```

**Priority:** 🟡 P1 - Should have

---

### 5. Section Transition Times

**What:**
- Track time spent in each section
- Log when user enters and leaves each section
- Identify slow sections

**Why:**
- Shows where bottlenecks are
- Helps optimize slow sections

**Implementation:**
```sql
CREATE TABLE section_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  match_id UUID REFERENCES matches(match_id),
  from_section TEXT,
  to_section TEXT,
  entered_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  duration_seconds INTEGER
);
```

**Priority:** 🟡 P1 - Should have

---

### 6. Section Rollback Strategies

**What:**
- Each section has rollback logic
- If section fails, return to known good state
- Prevents users getting stuck

**Why:**
- Handles failures gracefully
- System always returns to valid state

**Implementation:**
```typescript
// Spinning rollback: Remove from queue, set state to idle
// Matching rollback: Cancel match, return users to queue
// Voting rollback: Cancel match, return users to idle
```

**Priority:** 🟡 P1 - Should have

---

### 7. Section Dependency Tracking

**What:**
- Track which section depends on which
- Matching depends on Spinning (needs users in queue)
- Voting depends on Matching (needs matches created)

**Why:**
- Understand cascading failures
- If Voting is broken, check Matching first

**Implementation:**
```sql
CREATE TABLE section_dependencies (
  section TEXT PRIMARY KEY,
  depends_on TEXT[], -- Array of sections this depends on
  required_state TEXT -- State required from dependency
);

-- Matching depends on: ['spinning'] with state='waiting'
-- Voting depends on: ['matching'] with state='paired'
```

**Priority:** 🟢 P2 - Nice to have

---

### 8. Section Flow Completion Tracking

**What:**
- Track complete user journey through all sections
- Log timestamps for each section entry/exit
- Calculate total time and section times

**Why:**
- Shows complete flow performance
- Identifies where delays occur

**Implementation:**
```sql
CREATE TABLE user_journey (
  user_id UUID REFERENCES profiles(id),
  match_id UUID REFERENCES matches(match_id),
  spinning_entered_at TIMESTAMPTZ,
  spinning_exited_at TIMESTAMPTZ,
  matching_entered_at TIMESTAMPTZ,
  matching_exited_at TIMESTAMPTZ,
  voting_entered_at TIMESTAMPTZ,
  voting_exited_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_time_seconds INTEGER
);
```

**Priority:** 🟡 P1 - Should have

---

### 9. Section Metrics Dashboard

**What:**
- Real-time dashboard showing each section's metrics
- Spinning: users joining, success rate, average time
- Matching: queue size, matches created, success rate
- Voting: active vote windows, votes recorded, outcomes resolved

**Why:**
- Visual visibility into system health
- Quick identification of problems

**Priority:** 🟡 P1 - Should have

---

### 10. Section Isolation Testing

**What:**
- Test each section independently
- Mock inputs/outputs for other sections
- Ensure sections work in isolation

**Why:**
- Easier debugging
- Can test sections without full system
- Prevents bugs from spreading

**Priority:** 🟡 P1 - Should have

---

## Section-Specific Focus Areas

### SPINNING Section Focus

**Critical:**
1. **Speed** - Must be <500ms
2. **Reliability** - Must be 100% success rate
3. **Idempotency** - Safe to retry

**Important:**
4. **State Consistency** - User state and queue state match
5. **Non-Blocking** - Don't wait for matching

**How to Track:**
- Join success rate (target: 100%)
- Average join time (target: <500ms)
- Join failures (target: 0)

**How to Manage:**
- Monitor join success rate (alert if <99%)
- Auto-repair stuck users (reset to idle)
- Validate state consistency (background job)

---

### MATCHING Section Focus

**Critical:**
1. **Efficiency** - Process queue every 2 seconds
2. **Fairness** - Long waiters get priority
3. **Atomicity** - No duplicate matches

**Important:**
4. **Compatibility** - Only valid matches
5. **Coordination** - Don't match same user twice

**How to Track:**
- Queue size (target: <50 users)
- Match success rate (target: >80%)
- Average match time (target: <5s)
- Long waiters (target: 0 users >60s)

**How to Manage:**
- Monitor queue size (alert if >100)
- Trigger aggressive matching if queue grows
- Auto-repair: Remove offline users

---

### VOTING Section Focus

**Critical:**
1. **Timing** - Acknowledgment 2-3s, voting 10s
2. **Synchronization** - Frontend/backend timer sync
3. **Atomicity** - Vote + outcome resolution

**Important:**
4. **State Transitions** - Clean transitions to final states
5. **Error Recovery** - Handle timeouts, disconnects

**How to Track:**
- Acknowledgment success rate (target: >95%)
- Vote success rate (target: >90%)
- Outcome resolution rate (target: 100%)
- Average time in voting (target: <15s)

**How to Manage:**
- Monitor acknowledgment rate (alert if <90%)
- Auto-repair stuck users (resolve expired vote windows)
- Validate state transitions (background job)

---

## Section Connection Checklist

When building the spin logic, ensure:

### Spinning → Matching Connection
- [ ] Spinning sets `state='waiting'` in database
- [ ] Matching reads `state='waiting'` from database
- [ ] Event triggers immediate matching attempt
- [ ] Background polling processes queue every 2s
- [ ] Validation: User in queue before matching

### Matching → Voting Connection
- [ ] Matching sets `state='paired'` in database
- [ ] Voting reads `state='paired'` from database
- [ ] Event triggers immediate acknowledgment
- [ ] Background polling processes matches every 2s
- [ ] Validation: Match exists before voting

### Voting → Final State Connection
- [ ] Voting sets final state in database
- [ ] Outcome resolution creates all records
- [ ] Video-date created atomically with outcome
- [ ] History updated in same transaction
- [ ] Validation: Outcome resolved before completion

---

## Success Criteria

The spin logic runs 100% when:

### Spinning Section
- ✅ 100% join success rate
- ✅ <500ms average join time
- ✅ 0 stuck users
- ✅ State consistency 100%

### Matching Section
- ✅ Queue size stays reasonable (<50)
- ✅ >80% match success rate
- ✅ <5s average match time
- ✅ 0 duplicate matches
- ✅ 0 long waiters (>60s)

### Voting Section
- ✅ >95% acknowledgment success rate
- ✅ >90% vote success rate
- ✅ 100% outcome resolution rate
- ✅ <15s average time in voting
- ✅ 0 stuck users

### Section Connections
- ✅ Smooth transitions between sections
- ✅ No users lost between sections
- ✅ Database state always consistent
- ✅ Events + polling ensure nothing missed

---

## Common Pitfalls to Avoid

1. **Don't make sections depend on each other directly** - Use database state
2. **Don't skip validation at handoffs** - Validate before each transition
3. **Don't ignore section health** - Monitor continuously
4. **Don't mix section logic** - Keep sections isolated
5. **Don't skip error recovery** - Each section needs rollback
6. **Don't ignore timing** - Track section transition times
7. **Don't skip logging** - Log every section transition
8. **Don't make sections blocking** - Keep them fast and non-blocking

---

## Architecture Pattern

### The "Pipeline" Pattern

```
Spinning → Matching → Voting
   ↓         ↓         ↓
Database State (Connection)
   ↓         ↓         ↓
Health Monitoring
   ↓         ↓         ↓
Auto-Repair
```

**Key Principles:**
1. **Database state connects sections** (single source of truth)
2. **Events + polling ensure nothing missed** (fast + guaranteed)
3. **Each section is isolated** (independent and testable)
4. **Health monitoring tracks each section** (visibility)
5. **Auto-repair fixes stuck states** (self-healing)

---

*Document created: 2025-01-09*
*Purpose: Guide for building spin logic with three connected sections*
*Based on: Sequential Thinking Analysis (25 thoughts)*

