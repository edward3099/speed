# Both Yes Redirection & Fairness Score Analysis
**Date:** 2025-11-28  
**Focus:** Verify both_yes redirection and fairness score calculation

---

## 🔍 **Issue 1: Both Users Vote Yes → Video Date Redirection**

### **Current Implementation:**

#### **Backend (`record_vote` function):**
```sql
-- Returns JSONB with outcome field
IF p_vote_type = 'yes' AND partner_vote = 'yes' THEN
  UPDATE matches SET status = 'ended' WHERE id = p_match_id;
  result := jsonb_build_object('outcome', 'both_yes', 'next_state', 'video_date');
END IF;
```

#### **Frontend (`src/app/spin/page.tsx`):**
```typescript
// Line 308
if (result.outcome === 'both_yes') {
  router.push(`/video-date?matchId=${currentMatchId}`)
  return
}
```

#### **API Route (`src/app/api/vote/route.ts`):**
```typescript
// Returns result from record_vote RPC
return NextResponse.json(result)
```

### **✅ Status: IMPLEMENTED CORRECTLY**

- ✅ `record_vote` returns `outcome: 'both_yes'` when both vote yes
- ✅ Frontend checks for `result.outcome === 'both_yes'`
- ✅ Frontend redirects to `/video-date?matchId=${currentMatchId}`
- ✅ Match status is set to `'ended'`

### **⚠️ Potential Issue:**

The frontend redirects immediately, but there's no check if the video_date was actually created. The video_date creation happens in `/video-date/page.tsx`, which might fail if there's an issue.

---

## 🔍 **Issue 2: Fairness Score Calculation During Spin**

### **Current Implementation:**

#### **`join_queue` function:**
```sql
-- Line 35-41 in 109_queue_functions.sql
INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
VALUES (p_user_id, 0, NOW(), 0)
ON CONFLICT (user_id) DO UPDATE
SET fairness_score = 0,  -- ⚠️ Sets to 0, doesn't calculate!
    spin_started_at = NOW(),
    preference_stage = 0;
```

#### **`calculate_fairness_score` function:**
```sql
-- Formula: wait_time_seconds + (yes_boost_events * 10)
fairness_score := wait_time_seconds + (yes_boost_events * 10);
```

### **❌ ISSUE FOUND: Fairness Score Not Calculated on Join**

**Problem:**
- `join_queue` sets `fairness_score = 0` instead of calling `calculate_fairness_score`
- Fairness score is only calculated when explicitly called
- Initial fairness should be 0 (correct), but it should be calculated, not hardcoded

**Expected Behavior:**
- When user joins queue, fairness should be calculated (initially 0)
- Fairness should increase with wait time
- Fairness should be recalculated during matching process

**Current Behavior:**
- Fairness is hardcoded to 0 on join
- No automatic recalculation during matching
- Only recalculated when `calculate_fairness_score` is explicitly called

---

## 🔧 **Required Fixes**

### **Fix 1: Call `calculate_fairness_score` in `join_queue`**

```sql
-- In join_queue function, after inserting into queue:
INSERT INTO queue (user_id, fairness_score, spin_started_at, preference_stage)
VALUES (p_user_id, 0, NOW(), 0)
ON CONFLICT (user_id) DO UPDATE
SET fairness_score = 0,
    spin_started_at = NOW(),
    preference_stage = 0;

-- ADD THIS:
-- Calculate initial fairness score (will be 0 initially, but ensures consistency)
PERFORM calculate_fairness_score(p_user_id);
```

### **Fix 2: Recalculate Fairness During Matching**

The `process_matching` function should recalculate fairness scores before matching to ensure users with longer wait times get priority.

---

## 📊 **Test Results**

### **Test 1: Both Yes Redirection**
- ✅ `record_vote` returns `both_yes` outcome
- ✅ Frontend checks for `both_yes`
- ✅ Frontend redirects correctly
- ⚠️ No verification that video_date is created

### **Test 2: Fairness Score Calculation**
- ❌ `join_queue` doesn't call `calculate_fairness_score`
- ❌ Fairness score is hardcoded to 0
- ✅ `calculate_fairness_score` function works correctly
- ⚠️ Fairness may not be recalculated during matching

---

## 🎯 **Recommendations**

1. **Fix `join_queue`** to call `calculate_fairness_score` after inserting
2. **Add fairness recalculation** in `process_matching` before matching
3. **Add verification** in frontend that video_date was created after redirect
4. **Add logging** to track fairness score changes

---

## 📝 **Files to Update**

1. `supabase/migrations/blueprint/109_queue_functions.sql` - Add `calculate_fairness_score` call
2. `supabase/migrations/blueprint/103_process_matching.sql` - Add fairness recalculation
3. `src/app/video-date/page.tsx` - Add error handling if video_date creation fails

