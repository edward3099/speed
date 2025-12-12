# Spin Logic Race Condition Analysis

## Critical Insight: Why Tracking Failed

### The Problem

Even with comprehensive ID tracking to monitor every section and action, the system still failed. The issue started the moment users pressed spin.

### Why Tracking Doesn't Prevent Races

**Key Understanding:**
- **Tracking/Logging = Observability** (shows what happened - reactive)
- **Locks/Constraints = Control** (prevents bad things - proactive)

**The Race Sequence:**
1. Multiple users press spin → 50 concurrent `join_queue` operations
2. Multiple matching processes start → all see the same queue state
3. All check "is user A available?" → all see "yes" (no lock yet)
4. All try to match user A → race condition occurs
5. ID system logs the conflict → but it already happened

**The Critical Gap:**
- Logging happens **AFTER** decisions are made
- Multiple processes can make the same decision **simultaneously**
- By the time you log "attempting to match user A", another process may have already decided the same
- Tracking documents the race; it doesn't prevent it

---

## The Failure Pattern

### Current (Broken) Pattern

```
Check availability → Log check → Try to acquire lock → Create match
                    ↑
              Race happens here
```

**Problem:** The check happens **before** the lock, creating a race window where multiple processes can all pass the check.

### Correct Pattern

```
Acquire advisory lock → Check availability → Re-check → Create match → Release lock
↑
Lock FIRST, then check
```

**Solution:** Lock **before** any checks, ensuring only one process can make decisions for a user at a time.

---

## Root Cause Analysis

### The Real Issue: No Mutual Exclusion

The matching logic assumes single-threaded execution but runs in a multi-process environment:

- Each API request spawns a matching attempt
- These attempts can overlap
- The ID system shows the overlap but doesn't serialize it

### The Moment of Failure

When users press spin simultaneously:
- **User A presses spin** → joins queue → trigger matching
- **User B presses spin** → joins queue → trigger matching  
- **User C presses spin** → joins queue → trigger matching

All three trigger `process_matching()` concurrently:
- All three see the same queue state
- All three check "is user A available?" → all see "yes"
- All three try to match user A → **RACE CONDITION**

The ID system logs all three attempts, but the race already occurred.

---

## The Solution: Advisory Locks at Entry Point

### What Needs to Happen

1. **Advisory lock at the very start of `process_matching()` for each user**
   - Before ANY checks
   - Before ANY decisions
   - Ensures only one process can process matching for a user

2. **Hold the lock during the critical section**
   - Check availability
   - Find partner
   - Create match
   - All while holding the lock

3. **Release only after decision is made**
   - After match is created or decision is finalized

### Implementation Pattern

```sql
-- In process_matching() function
-- Convert UUID to integer for advisory lock
user_lock_id := abs(hashtext(user_id::text))::bigint;

-- Try to acquire lock (non-blocking)
lock_acquired := pg_try_advisory_xact_lock(user_lock_id);

IF NOT lock_acquired THEN
  -- Another process is already matching this user, skip
  CONTINUE;
END IF;

-- Now we have exclusive rights to match this user
-- Re-check if user is already matched (double-check locking)
IF EXISTS (SELECT 1 FROM matches WHERE ...) THEN
  CONTINUE;
END IF;

-- Proceed with matching logic while holding lock
-- Find partner, create match, etc.
```

---

## Key Principles

### 1. Prevention Before Observation

- **Locks prevent failures** (control the present)
- **Tracking understands failures** (understand the past)
- You need both, but **locks must come first**

### 2. Lock Before Check

- Never check conditions before acquiring locks
- Always acquire lock first, then check
- Re-check after lock (double-check locking pattern)

### 3. Serialize Critical Sections

- The decision-making phase must be serialized
- Only one process can make matching decisions for a user at a time
- Advisory locks provide this serialization

### 4. Defense in Depth

Multiple layers of protection:
1. **Database constraints** (safest - can't be bypassed)
2. **Advisory locks** (most effective - prevent concurrency)
3. **Row locks** (during operations - prevent modifications)
4. **State repair** (self-healing - fix inconsistencies)
5. **Monitoring** (early detection - catch issues)

---

## Implementation Checklist

When building the spin logic, ensure:

- [ ] Advisory locks at entry point of `process_matching()`
- [ ] Lock acquired BEFORE any availability checks
- [ ] Double-check locking pattern (re-check after lock)
- [ ] Database constraints (unique indexes on active matches)
- [ ] Row-level locks in `create_match_atomic()`
- [ ] State repair system (background job)
- [ ] Comprehensive logging (ID system for debugging)
- [ ] Real-world testing (concurrent users)

---

## The Critical Insight

**Tracking/logging is about understanding the past. Locks/constraints are about controlling the present.**

The system failed because it had **observability** but lacked **control**.

- The ID system helps you debug and understand failures
- Locks prevent failures from occurring
- You need both, but locks must come first

**Prevention first, observation second.**

---

## When to Apply This

Apply this pattern to:
- Any function that makes decisions about shared resources
- Any function that checks conditions before acting
- Any function that runs concurrently
- Any function that modifies user state

**Rule of thumb:** If multiple processes can call the same function for the same user, you need advisory locks.

---

## References

- Sequential Thinking Analysis: 20 thoughts on race conditions
- Bug Reports: Duplicate pairs, zero matches, state inconsistencies
- Solution: Advisory locks + database constraints + state repair

---

*Document created: 2025-01-09*
*Purpose: Guide for building spin logic that prevents race conditions*

