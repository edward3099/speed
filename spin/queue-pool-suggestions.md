# Queue Pool Suggestions - Preventing Failures

## Problem Statement

Persistent queue pool issues that keep recurring:
- **Matches not happening** - Users in queue but no matches created
- **Matches taking too long** - Users waiting too long before matching
- **Users failing to join queue** - Join operations failing

These issues persist even after rebuilding the queue pool multiple times, suggesting **architectural problems**, not simple bugs.

---

## Root Cause Analysis

### Likely Causes

1. **Queue and matching are separate processes with no coordination**
   - Queue adds users, but matching doesn't know when to run
   - No feedback loop between queue and matching

2. **Matching is triggered on-demand instead of continuously**
   - Matches only happen when explicitly triggered
   - If trigger fails or is slow, matches don't happen

3. **Queue queries are inefficient**
   - No indexes, full table scans
   - Slow queries block matching

4. **Matching logic is too strict**
   - Rejects valid matches
   - Users wait forever for "perfect" matches

5. **No feedback loop**
   - Queue doesn't know if matching succeeded
   - Can't detect when matching is broken

---

## 15 Ideas to Prevent Queue Pool Failures

### 1. Continuous Matching (Not On-Demand) ⭐ CRITICAL

**Problem:** Matches only happen when triggered

**Solution:** Background process that continuously processes the queue every 1-2 seconds

**Why:** Matches happen quickly regardless of when users join

**Implementation:**
- Cron job or background worker
- Runs `process_matching()` every 2 seconds
- Never stops, always running
- Independent of user actions

**Priority:** 🔴 P0 - Must have

---

### 2. Separate "Queue" from "Matching Pool"

**Problem:** Matching reads directly from queue table (slow)

**Solution:** Materialized view optimized for matching:
- Pre-filtered (online users only)
- Pre-sorted (by fairness/priority)
- Refreshed every second

**Why:** Faster reads, separates concerns

**Implementation:**
```sql
CREATE MATERIALIZED VIEW matching_pool AS
SELECT user_id, fairness, waiting_since, preference_stage
FROM queue
JOIN users_state ON queue.user_id = users_state.user_id
JOIN profiles ON queue.user_id = profiles.id
WHERE users_state.state = 'waiting'
  AND profiles.online = true
ORDER BY fairness DESC, waiting_since ASC;

-- Refresh every second
REFRESH MATERIALIZED VIEW CONCURRENTLY matching_pool;
```

**Priority:** 🟡 P1 - Should have

---

### 3. Match Attempt System (Parallelizable)

**Problem:** One process tries to match everyone sequentially

**Solution:** Multiple lightweight match attempts:
- Each attempt picks two users
- Checks compatibility
- Creates match if compatible
- If incompatible, both stay in queue

**Why:** More parallelizable, handles failures better

**Implementation:**
- Process queue in parallel batches
- Each worker handles 5-10 match attempts
- Failed attempts don't block others

**Priority:** 🟡 P1 - Should have

---

### 4. Queue Health Monitoring ⭐ CRITICAL

**Problem:** No visibility into what's happening

**Solution:** Continuously monitor:
- Queue size
- Oldest waiting user
- Average wait time
- Match success rate

**Why:** Alerts when something is wrong, triggers aggressive matching if needed

**Implementation:**
```sql
-- Monitor every 10 seconds
SELECT 
  COUNT(*) as queue_size,
  MIN(waiting_since) as oldest_waiter,
  AVG(EXTRACT(EPOCH FROM (NOW() - waiting_since))) as avg_wait_seconds,
  COUNT(*) FILTER (WHERE waiting_since < NOW() - INTERVAL '30 seconds') as long_waiters
FROM queue;
```

**Priority:** 🔴 P0 - Must have

---

### 5. Idempotent, Non-Blocking join_queue ⭐ CRITICAL

**Problem:** Join queue fails from race conditions or locks

**Solution:**
- If user already in queue, return success (don't error)
- Use `INSERT ... ON CONFLICT DO NOTHING`
- No locks that could timeout
- Fast and safe to retry

**Why:** Prevents "failed to join queue" errors

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Idempotent: if already in queue, do nothing
  INSERT INTO queue (user_id, fairness, waiting_since, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO UPDATE
  SET waiting_since = NOW(), updated_at = NOW();
  
  -- Update user state (also idempotent)
  INSERT INTO users_state (user_id, state, waiting_since)
  VALUES (p_user_id, 'waiting', NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET state = 'waiting', waiting_since = NOW();
END;
$$ LANGUAGE plpgsql;
```

**Priority:** 🔴 P0 - Must have

---

### 6. Batch Matching (Not One-by-One)

**Problem:** Matching one user at a time is slow

**Solution:** Process entire queue in batches:
- Get all waiting users
- Sort by priority
- Try to match them in pairs
- Process 10-20 matches per batch

**Why:** More efficient, everyone gets a chance

**Implementation:**
- Instead of: `for each user: try to match`
- Do: `get batch of users → try to match all pairs → process results`

**Priority:** 🟡 P1 - Should have

---

### 7. Queue Priority Tiers

**Problem:** Fairness calculation might be off

**Solution:** Actual tiers:
- **Tier 1:** High priority (long waiters >60s)
- **Tier 2:** Normal (10-60s)
- **Tier 3:** Just joined (<10s)
- Always match Tier 1 first

**Why:** Long waiters never get stuck behind new joiners

**Implementation:**
```sql
-- Add tier column to queue
ALTER TABLE queue ADD COLUMN priority_tier INTEGER DEFAULT 3;

-- Update tiers based on wait time
UPDATE queue SET priority_tier = CASE
  WHEN waiting_since < NOW() - INTERVAL '60 seconds' THEN 1
  WHEN waiting_since < NOW() - INTERVAL '10 seconds' THEN 2
  ELSE 3
END;

-- Match by tier first, then fairness
ORDER BY priority_tier ASC, fairness DESC, waiting_since ASC;
```

**Priority:** 🟢 P2 - Nice to have

---

### 8. Matching Heartbeat

**Problem:** Don't know if matching is actually running

**Solution:** Matching process logs activity:
- "Processed queue at timestamp X"
- "Found Y users, attempted Z matches, created W matches"
- If heartbeat stops, alert

**Why:** Shows if matching is running and what it's doing

**Implementation:**
```sql
CREATE TABLE matching_heartbeat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  queue_size INTEGER,
  matches_attempted INTEGER,
  matches_created INTEGER,
  processing_time_ms INTEGER
);

-- Log after each matching run
INSERT INTO matching_heartbeat (queue_size, matches_attempted, matches_created, processing_time_ms)
VALUES (...);
```

**Priority:** 🟡 P1 - Should have

---

### 9. Optimistic Matching with Conflict Detection

**Problem:** Locks slow down matching

**Solution:** Try to create match optimistically:
- If it fails (user already matched), try next user
- Use database constraints to prevent duplicates
- Don't use application locks to prevent attempts

**Why:** Faster, handles concurrency better

**Implementation:**
- Try to create match
- If unique constraint violation, user already matched → skip
- Continue to next user
- Database constraints prevent duplicates

**Priority:** 🟢 P2 - Nice to have

---

### 10. Separate Queue Management from Matching

**Problem:** Join queue is slow because matching is running

**Solution:** Two separate processes:
- **Process 1:** Adds/removes users from queue (fast, non-blocking)
- **Process 2:** Matches users (runs continuously)
- They coordinate via queue table but don't block each other

**Why:** Prevents "join queue" from being slow

**Implementation:**
- `join_queue()` function: Fast, just inserts into queue
- `process_matching()` function: Runs in background, reads from queue
- No shared locks between them

**Priority:** 🔴 P0 - Must have

---

### 11. Materialized Queue View

**Problem:** Querying queue table directly is slow

**Solution:** Materialized view:
- Pre-filtered (online users only)
- Pre-sorted (by priority)
- Refreshed every second
- Matching reads from view

**Why:** Much faster reads

**Implementation:**
```sql
CREATE MATERIALIZED VIEW queue_matching_view AS
SELECT 
  q.user_id,
  q.fairness,
  q.waiting_since,
  q.preference_stage,
  us.state,
  p.online,
  p.gender,
  up.gender_preference
FROM queue q
JOIN users_state us ON q.user_id = us.user_id
JOIN profiles p ON q.user_id = p.id
JOIN user_preferences up ON q.user_id = up.user_id
WHERE us.state = 'waiting'
  AND p.online = true
ORDER BY q.fairness DESC, q.waiting_since ASC;

-- Refresh every second via cron
REFRESH MATERIALIZED VIEW CONCURRENTLY queue_matching_view;
```

**Priority:** 🟡 P1 - Should have

---

### 12. Match Attempt Logging

**Problem:** Don't know why matches aren't happening

**Solution:** Log every match attempt:
- User1, User2
- Why it succeeded/failed (compatible, incompatible, already matched, etc.)

**Why:** Shows if matching is running but failing (compatibility too strict) or not running at all

**Implementation:**
```sql
CREATE TABLE match_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID,
  user2_id UUID,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  result TEXT, -- 'matched', 'incompatible', 'already_matched', 'offline', etc.
  reason TEXT
);

-- Log every attempt
INSERT INTO match_attempts (user1_id, user2_id, result, reason)
VALUES (...);
```

**Priority:** 🟡 P1 - Should have

---

### 13. Queue Size Limits with Overflow Handling

**Problem:** Queue grows unbounded

**Solution:** If queue >100 users:
- Trigger aggressive matching
- Expand preferences more
- Alert

**Why:** Prevents unbounded growth, indicates a problem

**Implementation:**
```sql
-- Check queue size
IF (SELECT COUNT(*) FROM queue) > 100 THEN
  -- Trigger aggressive matching
  -- Expand all preferences to maximum
  -- Send alert
END IF;
```

**Priority:** 🟡 P1 - Should have

---

### 14. Event-Driven + Polling (Hybrid)

**Problem:** Either too slow (polling only) or unreliable (events only)

**Solution:** Both:
- When user joins queue, trigger immediate matching attempt (fast)
- Background polling every 2 seconds as fallback (guaranteed)

**Why:** Fast matches for new joiners, guaranteed processing for everyone

**Implementation:**
```typescript
// When user joins queue
async function joinQueue(userId: string) {
  // 1. Add to queue (fast)
  await addToQueue(userId);
  
  // 2. Trigger immediate matching attempt (fast path)
  triggerMatching(userId).catch(() => {}); // Don't wait
  
  // 3. Background polling will catch it if trigger fails (guaranteed)
}
```

**Priority:** 🟢 P2 - Nice to have

---

### 15. Fire-and-Forget Queue

**Problem:** Users wait for matching to complete

**Solution:** Queue pool is "fire and forget":
- Users join queue (fast, non-blocking)
- Matching happens automatically in background (continuous)
- Users don't wait for matching

**Why:** Queue = data, Matching = service that processes data

**Implementation:**
- `join_queue()` returns immediately (doesn't wait for match)
- Matching runs continuously in background
- Users poll for match status separately

**Priority:** 🔴 P0 - Must have

---

## Priority Tiers

### 🔴 Tier 1: Must Have (Implement First)

1. **Continuous Matching** - Background process every 2 seconds
2. **Idempotent join_queue** - No failures from race conditions
3. **Queue Health Monitoring** - Know when something is wrong
4. **Separate Queue Management from Matching** - Don't block each other
5. **Fire-and-Forget Queue** - Fast joins, background matching

### 🟡 Tier 2: Should Have (Implement Second)

6. **Batch Matching** - Process multiple at once
7. **Materialized Queue View** - Faster reads
8. **Match Attempt Logging** - Understand failures
9. **Matching Heartbeat** - Know if matching is running
10. **Queue Size Limits** - Prevent unbounded growth

### 🟢 Tier 3: Nice to Have (Implement Third)

11. **Priority Tiers** - Ensure fairness
12. **Optimistic Matching** - Faster
13. **Event-Driven + Polling** - Best of both worlds
14. **Match Attempt System** - More parallelizable
15. **Separate Queue from Matching Pool** - Better separation

---

## The Core Insight

### Queue vs Matching: Separate Concerns

**Queue = Data Structure (State)**
- Who's waiting
- Fast writes
- Non-blocking
- Fire-and-forget

**Matching = Service (Process)**
- Finds and creates matches
- Continuous processing
- Separate process
- Background operation

### Architecture Pattern

```
User presses spin
    ↓
join_queue() → Fast, non-blocking, idempotent
    ↓
User added to queue (state)
    ↓
Background matching process (continuous)
    ↓
Matches created automatically
```

**Key Principles:**
1. Queue is just state - users waiting
2. Matching is a service - processes the queue
3. They don't block each other
4. Matching runs continuously, not on-demand
5. Queue operations are fast and safe to retry

---

## Implementation Checklist

When building the queue pool:

- [ ] Continuous matching process (runs every 2 seconds)
- [ ] Idempotent join_queue (no failures from races)
- [ ] Queue health monitoring (know when broken)
- [ ] Separate queue management from matching (don't block)
- [ ] Fire-and-forget pattern (fast joins, background matching)
- [ ] Batch matching (process multiple at once)
- [ ] Materialized view for faster reads
- [ ] Match attempt logging (understand failures)
- [ ] Matching heartbeat (know if running)
- [ ] Queue size limits (prevent unbounded growth)

---

## Common Pitfalls to Avoid

1. **Don't trigger matching on queue join** - Use continuous background process
2. **Don't use locks in join_queue** - Use idempotent inserts
3. **Don't block queue operations** - Keep them fast and non-blocking
4. **Don't mix queue management with matching** - Separate processes
5. **Don't wait for matching to complete** - Fire-and-forget pattern
6. **Don't query queue table directly** - Use materialized view
7. **Don't match one-by-one** - Use batch processing
8. **Don't ignore queue health** - Monitor continuously

---

## Success Criteria

The queue pool is working correctly when:

- ✅ Users join queue instantly (no failures)
- ✅ Matches happen within 2-5 seconds of joining
- ✅ Queue size stays reasonable (<50 users typically)
- ✅ No users stuck waiting >60 seconds
- ✅ Match success rate >80%
- ✅ Matching process runs continuously (heartbeat active)
- ✅ Queue operations never block or timeout

---

*Document created: 2025-01-09*
*Purpose: Guide for building queue pool that prevents common failures*
*Based on: Sequential Thinking Analysis (20 thoughts)*

