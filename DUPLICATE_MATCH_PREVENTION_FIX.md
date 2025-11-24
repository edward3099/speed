# Fix: Prevent Users from Matching with Same Person Multiple Times

## Problem

**Issue:** User1male keeps pairing with Load Test Female User 225 repeatedly.

**Root Cause:**
1. The matching logic (`find_best_match_v2`) didn't exclude users who have previously matched
2. The matching logic didn't exclude users who have been passed on (vote_type = 'pass')
3. Even if a match was deleted on respin, the system could still match them again

---

## Solution

### Database Fix: Exclude Previously Matched and Passed Users

**File:** `supabase/migrations/20250123_prevent_duplicate_matches.sql`

**Changes to `find_best_match_v2()`:**

Added two critical exclusions:

#### 1. Exclude Previously Matched Users
```sql
-- CRITICAL: Exclude users who have previously matched (any status)
-- This prevents matching with the same person multiple times
AND NOT EXISTS (
  SELECT 1 FROM matches m
  WHERE (
    (m.user1_id = p_user_id AND m.user2_id = mq.user_id)
    OR
    (m.user1_id = mq.user_id AND m.user2_id = p_user_id)
  )
  -- Exclude if there's ANY previous match (regardless of status)
  -- This ensures users don't keep matching with the same person
)
```

**Why:** Once two users have matched (even if the match was deleted), they shouldn't match again to prevent repetitive pairings.

#### 2. Exclude Users Who Have Been Passed On
```sql
-- CRITICAL: Exclude users who have been passed on (vote_type = 'pass')
-- This prevents showing users who were already rejected
AND NOT EXISTS (
  SELECT 1 FROM votes v
  WHERE v.voter_id = p_user_id
    AND v.profile_id = mq.user_id
    AND v.vote_type = 'pass'
)
```

**Why:** If a user pressed "respin" (pass) on someone, they shouldn't see that person again.

---

## How It Works

### Before Fix:
```
User1male spins → Matches with User 225 → Presses respin → 
Match deleted → Spins again → Matches with User 225 again ❌
```

### After Fix:
```
User1male spins → Matches with User 225 → Presses respin → 
Match deleted → Vote recorded (pass) → Spins again → 
User 225 excluded (previously matched + passed) → Matches with different user ✅
```

---

## Exclusions Applied

The matching logic now excludes:

1. ✅ **Blocked users** (already existed)
2. ✅ **Previously matched users** (NEW - any match status)
3. ✅ **Users who have been passed on** (NEW - vote_type = 'pass')
4. ✅ **Gender incompatibility** (already existed)
5. ✅ **Age/distance preferences** (already existed)

---

## Migration Applied

✅ **Migration:** `20250123_prevent_duplicate_matches.sql`
✅ **Status:** Applied successfully
✅ **Function Updated:** `find_best_match_v2()`

---

## Testing

**To verify the fix:**

1. **User1male spins** → Should match with a new user (not User 225)
2. **If User 225 is the only matchable user** → User1male should wait or get "no match found"
3. **User1male should never see User 225 again** after matching once

**Edge Cases:**
- Multiple respins → Should never match same person
- Match deleted → Should still exclude that user
- Pass vote recorded → Should exclude that user

---

## Summary

This fix ensures users don't repeatedly match with the same person by:
1. **Excluding previously matched users** (any match status)
2. **Excluding users who have been passed on** (vote_type = 'pass')

The matching system now provides variety and prevents repetitive pairings.

