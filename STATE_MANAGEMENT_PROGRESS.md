# State Management Investigation - Progress Report

## Problem Statement
14-18 users end up on `/spin` after being matched, even though matches exist in database (20 matches found in recent tests).

## Root Cause Analysis

### Key Finding
**20 matches exist in database** - matches ARE being created successfully. The issue is users being redirected AWAY from `/voting-window` after arriving there.

### Evidence
- Test shows: "Redirected to voting-window: 8" 
- But final state: "Voting Window: 2 users"
- **6 users are redirected away after arriving**

## Sequential Fixes Applied

### ✅ Section 1: Initial Load Direct Fetch
- **Problem:** Direct fetch logic too simple, no proper error handling
- **Fix:** Enhanced with retry logic, proper 404/network error handling
- **Result:** Improved reliability

### ✅ Section 2: Polling Logic  
- **Problem:** Polling redirected when `!data.match` even with matchId
- **Fix:** Added direct match fetch check before redirecting
- **Result:** Prevents premature redirects during polling

### ✅ Section 3: State-Based Redirects
- **Problem:** Redirected based on state being 'idle'/'waiting' even when match exists
- **Fix:** Check if match exists via direct fetch before redirecting based on state
- **Result:** Prevents redirects when state is temporarily wrong

### ✅ Section 4: Partner Data Section
- **Problem:** Redirected immediately if partner data missing
- **Fix:** Added retry logic and direct fetch before redirecting
- **Result:** Prevents premature redirects when partner data is loading

### ✅ Section 5: Initial useEffect Timing
- **Problem:** Redirected immediately if !matchId, but searchParams might not be loaded
- **Fix:** Added 100ms delay before checking matchId
- **Result:** Prevents redirects before URL params are available

## Current Status

### Test Results
- **Users in Voting Window:** 2 (varies 2-4 between runs)
- **Users on Wrong Pages:** 18 (varies 14-18)
- **Matches in Database:** 20 (confirmed via SQL query)
- **Matches Found in Test:** 1-2 (varies)

### Analysis
The fixes help, but there's still a deeper issue:
1. **8 users get redirected TO voting-window** (from /spin page)
2. **But only 2 stay there** - 6 get redirected away
3. **20 matches exist in database** - so matching is working

### Hypothesis
The redirects might be happening from:
1. **Multiple useEffect runs** - React strict mode or re-renders causing multiple redirect attempts
2. **Race conditions** - Multiple redirect paths firing simultaneously
3. **Cache invalidation timing** - Status endpoint cache not invalidated when matches created
4. **State synchronization delay** - Backend state not synced with frontend immediately

## Next Steps

### Immediate
1. Add logging to track which redirect path is firing
2. Check if multiple useEffects are running
3. Verify cache invalidation timing

### Investigation Needed
1. Why do 6 users get redirected away after arriving at voting-window?
2. Is there a race condition between multiple redirect checks?
3. Should we disable redirects entirely when matchId exists in URL?

## Files Modified
- `src/app/voting-window/page.tsx` - All 5 sections fixed sequentially


















