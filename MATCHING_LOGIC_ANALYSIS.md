# Matching Logic Analysis - Debugger Findings

## Critical Issues Found

### 🔴 Issue 1: Frontend Querying Wrong Column
**Location**: `src/app/spin/page.tsx:1423`

**Problem**:
```typescript
const { data: queueUsers } = await supabase
  .from('queue')
  .select('user_id, status')  // ❌ queue table has NO 'status' column!
  .neq('user_id', authUser.id)
  .in('status', ['spin_active', 'queue_waiting'])  // ❌ This filter does nothing
```

**Impact**: 
- Frontend thinks there are "0 other users in queue" even when users exist
- The query returns empty because it's filtering on a non-existent column
- This causes the frontend to keep polling unnecessarily

**Fix Required**: Query `user_status` table instead:
```typescript
const { data: queueUsers } = await supabase
  .from('user_status')
  .select('user_id, state')
  .neq('user_id', authUser.id)
  .in('state', ['spin_active', 'queue_waiting'])
```

---

### 🔴 Issue 2: user_status May Not Exist
**Location**: `supabase/migrations/blueprint/109_queue_functions.sql:42`

**Problem**:
```sql
-- Update user_status to spin_active
UPDATE user_status
SET state = 'spin_active',
    ...
WHERE user_id = p_user_id;
```

**Impact**:
- If `user_status` row doesn't exist, UPDATE does nothing (0 rows affected)
- User remains with `user_status = null`
- `process_matching()` uses `INNER JOIN user_status`, so users without user_status are **completely ignored**
- This is why matches aren't being created!

**Evidence from Logs**:
```
👤 User status: null  // ❌ This is the problem!
```

**Fix Required**: Ensure user_status row exists:
```sql
-- Insert or update user_status
INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
VALUES (p_user_id, 'spin_active', NOW(), COALESCE((SELECT state FROM user_status WHERE user_id = p_user_id), 'idle'), NOW(), NOW(), TRUE, NOW())
ON CONFLICT (user_id) DO UPDATE
SET state = 'spin_active',
    spin_started_at = NOW(),
    last_state = COALESCE(user_status.state, 'idle'),
    last_state_change = NOW(),
    updated_at = NOW(),
    online_status = TRUE,
    last_heartbeat = NOW();
```

---

### 🟡 Issue 3: Matching Engine Requirements Not Met
**Location**: `supabase/migrations/blueprint/103_process_matching.sql:30-33`

**Requirements for Matching**:
```sql
INNER JOIN profiles u ON u.id = q.user_id
INNER JOIN user_status us ON us.user_id = q.user_id
WHERE u.online = TRUE
  AND (u.cooldown_until IS NULL OR u.cooldown_until < NOW())
  AND us.state IN ('spin_active', 'queue_waiting')
```

**Current State**:
- ✅ Users are in `queue` table
- ✅ Users have `profiles.online = TRUE`
- ❌ Users may NOT have `user_status` row (UPDATE fails silently)
- ❌ `INNER JOIN` excludes users without user_status
- ❌ Result: **NO MATCHES CREATED**

---

## What the Debugger Tells Us

### ✅ What's Working:
1. **Queue Join**: Users successfully join the queue (`frontend_queue_join_success` logged)
2. **Queue Table**: Users are in the `queue` table with correct `fairness_score`, `preference_stage`, `spin_started_at`
3. **Background Jobs**: Configured to run every 2 seconds (`matching-processor`) and 10 seconds (`guardian-job`)

### ❌ What's Broken:
1. **user_status is NULL**: The debugger shows `👤 User status: null` - this breaks matching
2. **Frontend Query Wrong**: Querying `queue.status` instead of `user_status.state`
3. **No Matches Created**: Despite 2 users in queue, `process_matching()` can't find them because of missing user_status

### 🔍 Evidence from Logs:
```
👥 Other users in queue: 1  // ✅ User IS in queue
👤 User status: null        // ❌ But user_status is missing!
⚠️ No match found on initial attempt. Polling will continue...
🔄 Retry attempt: 0 other users in queue  // ❌ Wrong query returns 0
```

---

## Root Cause Analysis

### The Matching Flow Should Be:
1. User clicks "Spin" → `join_queue()` called
2. `join_queue()` inserts into `queue` ✅
3. `join_queue()` updates `user_status` to `spin_active` ❌ (fails if row doesn't exist)
4. Background job `process_matching()` runs every 2 seconds
5. `process_matching()` finds users with `INNER JOIN user_status` ❌ (excludes users without user_status)
6. Matches are created ✅ (but never reached)

### What Actually Happens:
1. User clicks "Spin" → `join_queue()` called ✅
2. `join_queue()` inserts into `queue` ✅
3. `join_queue()` tries to UPDATE `user_status` ❌ (does nothing if row doesn't exist)
4. Background job `process_matching()` runs ✅
5. `process_matching()` uses `INNER JOIN user_status` ❌ (excludes users without user_status)
6. **NO MATCHES CREATED** ❌

---

## Required Fixes

### Fix 1: Update join_queue() to Ensure user_status Exists
```sql
CREATE OR REPLACE FUNCTION join_queue(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_online BOOLEAN;
  user_cooldown TIMESTAMPTZ;
BEGIN
  -- Check user is online
  SELECT online, cooldown_until INTO user_online, user_cooldown
  FROM profiles
  WHERE id = p_user_id;
  
  IF NOT user_online THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown
  IF user_cooldown IS NOT NULL AND user_cooldown > NOW() THEN
    RETURN FALSE;
  END IF;
  
  -- Check not already in queue
  IF EXISTS (SELECT 1 FROM queue WHERE user_id = p_user_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into queue
  INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
  VALUES (p_user_id, 0, NOW(), 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Ensure user_status exists and update to spin_active
  INSERT INTO user_status (user_id, state, spin_started_at, last_state, last_state_change, updated_at, online_status, last_heartbeat)
  VALUES (p_user_id, 'spin_active', NOW(), 'idle', NOW(), NOW(), TRUE, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET state = 'spin_active',
      spin_started_at = NOW(),
      last_state = COALESCE(user_status.state, 'idle'),
      last_state_change = NOW(),
      updated_at = NOW(),
      online_status = TRUE,
      last_heartbeat = NOW();
  
  RETURN TRUE;
END;
$$;
```

### Fix 2: Update Frontend Query
```typescript
// In src/app/spin/page.tsx around line 1421
const { data: queueUsers } = await supabase
  .from('user_status')  // ✅ Query user_status, not queue
  .select('user_id, state')  // ✅ Select state, not status
  .neq('user_id', authUser.id)
  .in('state', ['spin_active', 'queue_waiting'])  // ✅ Filter on state
```

---

## Verification Steps

After fixes, verify:
1. ✅ `user_status` row exists after joining queue
2. ✅ Debugger shows `👤 User status: spin_active` (not null)
3. ✅ Frontend correctly counts other users in queue
4. ✅ `process_matching()` finds users via INNER JOIN
5. ✅ Matches are created when 2+ users are in queue

---

## Conclusion

**The matching logic implementation is CORRECT**, but there are **2 critical bugs preventing it from working**:

1. **join_queue() doesn't ensure user_status exists** - UPDATE fails silently
2. **Frontend queries wrong table/column** - Can't see other users

Once these are fixed, the matching engine should work correctly as designed.
