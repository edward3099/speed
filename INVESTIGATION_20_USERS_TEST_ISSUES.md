# Investigation: 20 Users Test Issues

## Test Results Summary

**Test Configuration:**
- 20 users total (14 males, 6 females - randomized)
- Random cities and preferences
- Random votes (yes or respin)
- All users clicked "Start Spin" simultaneously

**Matching Results:**
- ✅ 12 users matched immediately = 6 matches (correct!)
- ✅ Database shows 6 matches created
- ✅ All matches properly paired (male + female)

**Issues Found:**

### Issue 1: Some Users Didn't Reach Voting Window
- **Problem**: Test Female 20 was matched but ended up on `/spin` instead of `/voting-window`
- **Match**: `e5555307...` only has 1 user (Test Male 14) in voting-window URL
- **Root Cause**: 
  - Spinning page redirect logic may have race conditions
  - WebSocket might not fire for all users
  - Polling might miss matches if cache is stale
  - User might have been redirected back to `/spin` before reaching voting window

### Issue 2: Voting Buttons Not Visible
- **Problem**: 6 users couldn't vote because buttons weren't visible
- **Users Affected**: Test Male 6, Test Male 11, Test Male 14, Test Female 16, Test Female 17, Test Female 18
- **Root Cause**:
  - Vote window expired before users reached the page (60 seconds is short for 20 users)
  - Page redirected them away before they could vote
  - Voting UI didn't render properly

### Issue 3: Users Stuck in Voting Window
- **Problem**: 4 users still in voting-window after votes should have been processed
- **Users Affected**: Test Male 5, Test Male 7, Test Male 13, Test Female 19
- **Root Cause**:
  - Votes weren't processed correctly
  - Redirect logic after voting isn't working
  - Match outcome wasn't resolved properly

## Root Causes

### 1. Race Condition in Spinning Page Redirect
The spinning page has multiple mechanisms to detect matches:
- Initial status checks (with delays: 0ms, 500ms, 1000ms)
- WebSocket subscription
- Aggressive polling (every 1.5 seconds)

**Problem**: If a user is matched but the initial checks fail, WebSocket doesn't fire, and polling misses it due to cache, the user might never be redirected.

**Solution**: Improve redirect logic to be more aggressive and check database directly if needed.

### 2. Vote Window Expiration Too Short
The vote window is set to 60 seconds, which is too short when:
- 20 users are signing in sequentially
- Some users take longer to reach the voting window
- Network delays occur

**Problem**: By the time some users reach the voting window, it has already expired.

**Solution**: Increase vote window duration or make it dynamic based on match creation time.

### 3. Vote Processing Not Completing
After votes are cast, the system should:
1. Record the vote
2. Check if both users voted
3. Resolve the outcome
4. Redirect users appropriately

**Problem**: Some votes aren't being processed correctly, leaving users stuck in the voting window.

**Solution**: Improve vote processing logic and ensure redirects happen immediately after votes are processed.

## Recommended Fixes

### Fix 1: Improve Spinning Page Redirect Logic
- Add more aggressive polling
- Check database directly if status endpoint fails
- Add fallback to query `users_state` table directly

### Fix 2: Increase Vote Window Duration
- Increase from 60 seconds to 90 seconds
- Or make it dynamic based on when users reach the voting window

### Fix 3: Improve Vote Processing
- Ensure votes are processed immediately
- Add better error handling
- Ensure redirects happen after votes are processed

### Fix 4: Add Better Logging
- Log when users are matched but don't reach voting window
- Log when vote windows expire
- Log when votes are processed

## Next Steps

1. Fix spinning page redirect logic
2. Increase vote window duration
3. Improve vote processing
4. Add better logging
5. Re-run test to verify fixes



