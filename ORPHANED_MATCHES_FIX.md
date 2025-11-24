# Fix: Orphaned Matches - Partner Not Found in Queue

## Problem

**Error/Warning:**
```
⚠️ Partner not found in queue after retries but match still exists
❌ Real-time: Partner not found in queue - unexpected but not deleting match
```

**Root Cause:**
1. A match is created between two users (both set to `vote_active` in queue)
2. One user's queue entry gets deleted by:
   - `cleanup_stale_queue_entries()` (offline > 2 min or timeout > 10 min)
   - User leaving/closing browser
   - Other cleanup operations
3. Match record still exists in `matches` table
4. Frontend tries to verify partner is in queue but can't find them
5. **Result**: Orphaned match - match exists but partner queue entry is missing

---

## Solution

### 1. Database Fix: Prevent Cleanup from Removing Users with Pending Matches

**File:** `supabase/migrations/20250123_fix_orphaned_matches.sql`

**Change:** Modified `cleanup_stale_queue_entries()` to **exclude users who have pending matches** from all cleanup operations:

```sql
-- Before cleanup, check if user has pending match
AND NOT EXISTS (
  SELECT 1 FROM matches m
  WHERE m.status = 'pending'
    AND (m.user1_id = matching_queue.user_id OR m.user2_id = matching_queue.user_id)
)
```

**Impact:**
- ✅ Prevents cleanup from creating orphaned matches
- ✅ Users with pending matches are protected from cleanup
- ✅ Matches remain valid until completed or explicitly deleted

---

### 2. Frontend Fix: Auto-Fix Orphaned Matches When Detected

**File:** `src/app/spin/page.tsx`

**Change:** When partner is not found but match exists, the frontend now:

1. **Calls `validate_queue_integrity()` RPC** to auto-fix the orphaned match
2. **Re-checks** if match still exists after cleanup
3. **Re-checks** if partner is found after cleanup
4. **Gracefully handles** the case where match/partner is cleaned up

**Two locations fixed:**

#### A. In `startSpin()` function (lines ~1328-1339)
```typescript
// Before: Just logged warning and continued
// After: Calls validate_queue_integrity() to auto-fix, then retries finding partner
```

#### B. In real-time match handler (lines ~607-613)
```typescript
// Before: Just logged error and returned
// After: Calls validate_queue_integrity() to auto-fix, then retries finding partner
```

**Impact:**
- ✅ Automatically fixes orphaned matches when detected
- ✅ Prevents stuck UI states
- ✅ Gracefully handles partner disconnection
- ✅ Better error recovery

---

## How It Works

### Prevention (Database Level)
```
User has pending match → cleanup_stale_queue_entries() skips them → No orphaned matches created
```

### Detection & Auto-Fix (Frontend Level)
```
Partner not found but match exists → Call validate_queue_integrity() → Auto-fix orphaned match → Retry finding partner
```

---

## Migration

**To apply the fix:**

1. **Apply database migration:**
   ```sql
   -- Run: supabase/migrations/20250123_fix_orphaned_matches.sql
   -- Or via Supabase Dashboard SQL Editor
   ```

2. **Frontend changes are already applied** (no migration needed)

---

## Expected Results

### Before Fix:
- ❌ Orphaned matches created when cleanup runs
- ❌ Warnings logged but no action taken
- ❌ UI might get stuck waiting for partner

### After Fix:
- ✅ Cleanup never removes users with pending matches
- ✅ Orphaned matches auto-fixed when detected
- ✅ Graceful handling of partner disconnection
- ✅ No more orphaned match warnings

---

## Testing

**To verify the fix:**

1. **Create a match** between two users
2. **Make one user offline** (set `is_online = false` in profiles)
3. **Wait 2+ minutes** (or manually trigger cleanup)
4. **Verify:** User with pending match is NOT removed from queue
5. **Verify:** Match remains valid

**Edge Case Testing:**
- User closes browser while match is pending
- Cleanup runs while match is pending
- Network issues during match creation

---

## Summary

This fix addresses orphaned matches through:
1. **Prevention**: Database cleanup never removes users with pending matches
2. **Detection & Auto-Fix**: Frontend automatically fixes orphaned matches when detected
3. **Graceful Handling**: Better error recovery and UI state management

The fix ensures matches remain valid until explicitly completed or deleted, preventing the "partner not found" warnings.


