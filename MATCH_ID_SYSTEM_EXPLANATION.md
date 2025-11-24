# Match ID System - How Pairing/Voting Windows Work

## ✅ Yes, Every Pairing/Voting Window Has a Unique ID

### Match Table Structure

```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- Unique ID for each match
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  vote_started_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user1_id, user2_id),  -- Same two users can only have ONE match at a time
  CHECK (user1_id < user2_id)  -- Ensures consistent ordering
);
```

### How It Works

1. **Unique Match ID**: Each time two users are paired, a new match record is created with a unique `id` (UUID)
   - Example: `06081b5a-c9cf-4972-acd2-5a564ba0adc5`

2. **Unique User Pair Constraint**: The `UNIQUE(user1_id, user2_id)` constraint ensures:
   - The same two users can only have **ONE active match** at a time
   - If they try to match again while a match exists, `create_pair_atomic` will find the existing match and return it

3. **Match Lifecycle**:
   ```
   Match Created → status: 'pending' → Voting Window → 
   [Both Yes] → status: 'video_date_scheduled' → Video Date → status: 'video_date_completed'
   [Respin] → Match Deleted (NEW) → Users can match again
   ```

---

## Current Behavior (Before Fix)

### When Users Match:
1. `create_pair_atomic()` creates a match with unique `id`
2. Both users enter `vote_active` status
3. Match record: `{ id: 'abc-123', user1_id: 'user1', user2_id: 'user2', status: 'pending' }`

### When User Presses Respin:
1. Queue statuses updated: `vote_active` → `spin_active`
2. **Match NOT deleted** ❌
3. Match record still exists: `{ id: 'abc-123', user1_id: 'user1', user2_id: 'user2', status: 'pending' }`

### Problem:
- If same two users try to match again, `create_pair_atomic()` finds existing match
- Returns existing match ID instead of creating new one
- But users are in `spin_active`, not `vote_active` → **State mismatch**

---

## After Fix (With Match Deletion)

### When User Presses Respin:
1. Queue statuses updated: `vote_active` → `spin_active`
2. **Match deleted** ✅
3. Match record removed from database

### Result:
- Same two users **CAN match again** (new match with new unique ID)
- No orphaned matches
- Clean database state
- Each pairing gets a fresh unique match ID

---

## Benefits of Unique Match IDs

### 1. **Vote Tracking**
- Each voting window has a unique match ID
- Votes are linked to the match via `match_id` (if votes table has this)
- Easy to track which votes belong to which pairing session

### 2. **Re-pairing Management**
- If match is deleted on respin, same users can pair again
- New match = new unique ID = fresh voting window
- Previous votes don't interfere with new pairing

### 3. **State Management**
- Match ID tracks the pairing session
- Frontend uses `currentMatchId` to manage UI state
- Real-time subscriptions can listen to specific match IDs

### 4. **Analytics**
- Can track how many times same users matched
- Can analyze match success rates per pairing session
- Can identify patterns (e.g., users who respin frequently)

---

## Re-pairing Behavior

### Scenario: User A and User B Match Twice

**First Match**:
- Match ID: `match-1`
- Both vote "respin"
- Match deleted ✅
- Both re-enter queue

**Second Match** (same users):
- Match ID: `match-2` (NEW unique ID)
- Fresh voting window
- Previous votes don't affect this pairing
- Can vote differently this time

**This is the desired behavior** - users can try matching again with the same person if they want.

---

## Alternative: Prevent Re-pairing

If you want to **prevent** same users from matching again, you could:

### Option 1: Don't Delete Match, Mark as 'unmatched'
```typescript
// Instead of deleting, update status
await supabase
  .from('matches')
  .update({ status: 'unmatched' })
  .eq('id', currentMatchId)
```

Then in `create_pair_atomic`, exclude users who have unmatched matches:
```sql
-- Exclude users who have unmatched matches with this candidate
AND NOT EXISTS (
  SELECT 1 FROM matches m
  WHERE m.status = 'unmatched'
    AND ((m.user1_id = p_user_id AND m.user2_id = candidate_id)
         OR (m.user2_id = p_user_id AND m.user1_id = candidate_id))
)
```

### Option 2: Use Profile Views (Current System)
- When users vote "pass", a profile view is recorded
- Users are excluded from each other's discovery for 24 hours
- This naturally prevents immediate re-pairing

**Current system uses Option 2** - profile views prevent re-pairing for 24 hours.

---

## Recommendation

**Delete match on respin** (implemented fix) because:

1. ✅ **Clean State**: No orphaned matches
2. ✅ **Fresh Pairing**: Same users can match again (after 24 hours due to profile views)
3. ✅ **Unique IDs**: Each pairing gets a new unique match ID
4. ✅ **Simple**: Easy to understand and maintain
5. ✅ **Works with Profile Views**: 24-hour exclusion prevents immediate re-pairing anyway

The unique match ID system makes it easy to:
- Track each voting window separately
- Manage state per pairing session
- Analyze pairing patterns
- Handle re-pairing scenarios

---

## Summary

- ✅ **Yes, every pairing/voting window has a unique match ID**
- ✅ **Match ID is a UUID** (e.g., `06081b5a-c9cf-4972-acd2-5a564ba0adc5`)
- ✅ **Same two users can only have ONE match at a time** (UNIQUE constraint)
- ✅ **Deleting match on respin allows re-pairing** (with 24-hour profile view exclusion)
- ✅ **Each new pairing gets a fresh unique match ID**

The fix ensures matches are deleted on respin, allowing clean re-pairing while maintaining the unique ID system for tracking each voting window.

