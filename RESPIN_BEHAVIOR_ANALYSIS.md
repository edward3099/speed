# Respin Behavior During Voting Window - Analysis

## Current Behavior

When a user presses **respin** (pass) during the voting window, here's what happens:

### Step-by-Step Flow

1. **Vote is Saved**
   - Vote record is inserted into `votes` table with `vote_type: 'pass'`
   - Profile view is recorded (for 24-hour exclusion)

2. **Check Partner's Vote Status**
   - System checks if partner already voted "yes"
   - Two scenarios:

   **Scenario A: Partner Already Voted "Yes"**
   - Partner gets fairness boost (+8)
   - Partner's queue status: `vote_active` → `spin_active`
   - Partner is re-queued with boost

   **Scenario B: Partner Hasn't Voted Yet**
   - No boost given
   - Partner's queue status: `vote_active` → `spin_active`
   - Partner can now match with others

3. **Respin Voter's Queue Status**
   - Respin voter's queue status: `vote_active` → `spin_active`
   - If not in queue, removed completely

4. **UI Reset**
   - Match state cleared (revealed, userVote, matchedPartner, currentMatchId)
   - User automatically re-enters queue (`startSpin()` called)

### ⚠️ **CRITICAL ISSUE: Match Not Deleted**

**Problem**: The match record in the `matches` table is **NOT deleted or updated** when respin is pressed.

**Current State After Respin**:
- ✅ Both users' queue status: `vote_active` → `spin_active`
- ✅ Both users can match again
- ❌ **Match record remains in database as `status: 'pending'`**
- ❌ This creates **orphaned matches** (matches with users not in `vote_active`)

**Impact**:
- Orphaned matches accumulate in database
- `validate_queue_integrity()` catches and cleans them (every 4 seconds)
- But it's better to clean them immediately when respin is pressed

---

## Expected Behavior (According to matching_logic.md)

According to `matching_logic.md`:

> **One votes yes and the other votes respin**
> - The pair is ended immediately
> - Both users leave vote_active
> - Both return to spin and re-enter the queue
> - The yes voter receives a priority boost
> - The respin voter does not receive a boost

> **One user votes respin before the other has voted**
> - The system ends the pairing instantly
> - There is no waiting
> - Both users leave vote_active and return to spin
> - Only the respin voter decision is processed
> - No boost is given unless the other user had already voted yes

**Missing**: Explicit match deletion/cleanup

---

## Recommended Fix

### Option 1: Delete Match Immediately (Recommended)

When respin is pressed, delete the match immediately:

```typescript
// After updating queue statuses, delete the match
if (currentMatchId) {
  await supabase
    .from('matches')
    .delete()
    .eq('id', currentMatchId)
}
```

**Pros**:
- ✅ Immediate cleanup
- ✅ No orphaned matches
- ✅ Cleaner database state

**Cons**:
- ⚠️ If both users respin simultaneously, one deletion might fail (but that's okay - validate_queue_integrity will catch it)

### Option 2: Update Match Status to 'unmatched'

Instead of deleting, mark as unmatched:

```typescript
if (currentMatchId) {
  await supabase
    .from('matches')
    .update({ status: 'unmatched', unmatched_at: new Date().toISOString() })
    .eq('id', currentMatchId)
}
```

**Pros**:
- ✅ Preserves match history
- ✅ Can track unmatched pairs for analytics

**Cons**:
- ⚠️ More database records to manage
- ⚠️ Need to filter out unmatched matches in queries

### Option 3: Let validate_queue_integrity Handle It (Current)

Keep current behavior, rely on `validate_queue_integrity()` to clean up every 4 seconds.

**Pros**:
- ✅ No code changes needed
- ✅ Already working (catches orphaned matches)

**Cons**:
- ⚠️ Delay in cleanup (up to 4 seconds)
- ⚠️ Orphaned matches exist temporarily
- ⚠️ More database queries needed

---

## Current Code Location

**File**: `speed-date/src/app/spin/page.tsx`
**Function**: `handleVote()` (lines 1377-1549)
**Respin Logic**: Lines 1456-1548

**Missing Action**: No match deletion/update after respin

---

## Recommendation

**Implement Option 1** (Delete match immediately) because:
1. It's the cleanest approach
2. Matches are recreated on next pairing anyway
3. No need to preserve unmatched match history
4. Immediate cleanup prevents orphaned matches
5. Works well with existing `validate_queue_integrity()` as a safety net

---

## Implementation

Add this code after line 1533 (after updating queue statuses):

```typescript
// Delete the match since respin ends the pairing
if (currentMatchId) {
  const { error: matchDeleteError } = await supabase
    .from('matches')
    .delete()
    .eq('id', currentMatchId)
  
  if (matchDeleteError) {
    console.error('Error deleting match on respin:', matchDeleteError)
    // Don't block - validate_queue_integrity will catch it if deletion fails
  } else {
    console.log('✅ Match deleted on respin:', currentMatchId)
  }
}
```

This ensures:
- ✅ Match is deleted immediately when respin is pressed
- ✅ No orphaned matches
- ✅ Cleaner database state
- ✅ `validate_queue_integrity()` still acts as safety net

