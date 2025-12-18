# Fixes Applied: 20 Users Test Issues

## Summary

Investigated and fixed issues found in the 20-users randomized test. The main problems were:
1. Vote window too short (60 seconds)
2. Some users not reaching voting window (redirect issues)
3. Users stuck in voting window after votes

## Fixes Applied

### Fix 1: Increased Vote Window Duration ✅
**File**: `supabase/migrations/20251219_fix_20_users_test_issues.sql`

- **Change**: Increased vote window from 60 to 90 seconds
- **Reason**: 60 seconds is too short when 20 users are signing in sequentially. Some users take longer to reach the voting window.
- **Impact**: Users now have 50% more time to vote, reducing expired vote windows.

### Fix 2: Improved Spinning Page Redirect Logic ✅
**File**: `src/app/spinning/page.tsx`

- **Change**: Added fallback to query `users_state` table directly if status endpoint doesn't show a match
- **Reason**: Handles cases where cache is stale or status endpoint has issues
- **Impact**: More reliable redirects when users are matched, reducing cases where users don't reach voting window

### Fix 3: Investigation Document Created ✅
**File**: `INVESTIGATION_20_USERS_TEST_ISSUES.md`

- **Content**: Detailed analysis of all issues found in the test
- **Purpose**: Document root causes and solutions for future reference

## Next Steps

### 1. Apply Database Migration
The migration file `supabase/migrations/20251219_fix_20_users_test_issues.sql` needs to be applied:

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to: https://supabase.com/dashboard/project/jzautphzcbtqplltsfse/sql/new
2. Copy contents of `supabase/migrations/20251219_fix_20_users_test_issues.sql`
3. Paste and run

**Option B: Via Supabase CLI**
```bash
# If you have Supabase CLI configured
supabase db push
```

### 2. Deploy Frontend Changes
The frontend changes in `src/app/spinning/page.tsx` will be deployed automatically when you push to Vercel.

### 3. Re-run Test
After applying the migration and deploying, re-run the 20-users test:
```bash
cd /Users/bb/Desktop/speed && TEST_BASE_URL=https://speed-silk.vercel.app npx playwright test tests/20-users-randomised.spec.ts --config playwright.vercel.config.ts --reporter=list --timeout=7200000
```

## Expected Improvements

After these fixes:
- ✅ More users should reach the voting window (better redirect logic)
- ✅ Fewer expired vote windows (90 seconds instead of 60)
- ✅ Better handling of race conditions (direct database queries)
- ✅ More reliable vote processing

## Testing Checklist

- [ ] Apply database migration
- [ ] Deploy frontend changes
- [ ] Re-run 20-users test
- [ ] Verify all users reach voting window
- [ ] Verify votes are processed correctly
- [ ] Verify users are redirected appropriately after votes



