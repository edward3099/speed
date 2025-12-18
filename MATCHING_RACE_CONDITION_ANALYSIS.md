# Matching Race Condition Analysis

## Question: Can 2 users spinning match?

### ✅ Normal Case (Sequential)
**Scenario:** User 1 joins first, then User 2 joins

1. **T0:** User 1 calls `join_queue` → state='waiting'
2. **T1:** User 1 calls `try_match_user` → no partner found → returns NULL
3. **T2:** User 2 calls `join_queue` → state='waiting'
4. **T3:** User 2 calls `try_match_user` → finds User 1 → creates match ✅

**Result:** ✅ **WORKS** - User 2 finds User 1 and they match

---

### ❌ Race Condition (Simultaneous)
**Scenario:** Both users call `try_match_user` at the exact same time

**User 1's transaction:**
1. Acquires lock on `user1` → ✅ SUCCESS
2. Queries for partners → finds User 2 (User 2 is 'waiting')
3. Tries to acquire lock on `user2` → ❌ FAILS (User 2's transaction has lock on user2)
4. Returns NULL

**User 2's transaction (simultaneous):**
1. Acquires lock on `user2` → ✅ SUCCESS
2. Queries for partners → finds User 1 (User 1 is 'waiting')
3. Tries to acquire lock on `user1` → ❌ FAILS (User 1's transaction has lock on user1)
4. Returns NULL

**Result:** ❌ **BOTH FAIL** - Both users stay in 'waiting' state forever (or until someone else joins)

---

## Root Cause

The `try_match_user` function uses advisory locks to prevent race conditions:
- Each transaction locks its own `user_id` first
- Then tries to lock the partner's `user_id`
- If partner lock fails, returns NULL immediately

**Problem:** When both transactions run simultaneously:
- Both have locks on their own user_id
- Both fail to lock the partner's user_id (held by other transaction)
- Both return NULL
- No retry mechanism exists

---

## Current Architecture

### Event-Driven Matching
- ✅ `join_queue` → `try_match_user` called immediately
- ✅ Works for sequential joins
- ❌ Fails for simultaneous joins

### Cron Jobs (Current)
- ✅ `resolve_expired_votes` - handles expired votes
- ✅ `handle_disconnects` - handles offline users
- ❌ **NO retry matching cron job**

### Spinning Page
- ✅ Uses WebSocket to listen for state changes
- ❌ Does NOT retry `try_match_user` if initial attempt fails

---

## Solution: Add Retry Cron Job

Create `/api/cron/retry-matching` that:
1. Finds all users in 'waiting' state with `last_active > NOW() - 10s`
2. Calls `try_match_user` for each user (with rate limiting)
3. Runs every 5-10 seconds as a fallback

**Benefits:**
- Ensures waiting users eventually get matched
- Handles race conditions gracefully
- Minimal overhead (only processes waiting users)
- Event-driven matching still primary (this is fallback)

---

## Recommendation

**Immediate Fix:**
1. Create `/api/cron/retry-matching` endpoint
2. Schedule it to run every 5-10 seconds
3. This ensures eventual matching even if initial attempts fail

**Long-term:**
- Consider using a different locking strategy (e.g., match-level locks instead of user-level)
- Or implement exponential backoff retry in the spinning page

---

## Status

- ✅ Logic is mostly correct
- ⚠️ Race condition exists for simultaneous matching attempts
- 🔧 Need to add retry cron job as fallback mechanism






























