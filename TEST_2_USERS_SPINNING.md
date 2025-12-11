# 2 Users Spinning Test

## Test Page Created

A test page has been created at `/test/2-users-spinning` that allows you to test the 2-user spinning scenario.

## How to Run the Test

### Option 1: Using the Test Page (Recommended)

1. **Open Browser Tab 1 (User 1)**
   - Navigate to: `http://localhost:3000/test/2-users-spinning`
   - Make sure you're logged in as User 1

2. **Open Browser Tab 2 (User 2)**
   - Open a different browser or incognito window
   - Navigate to: `http://localhost:3000/spin`
   - Log in as User 2 (different account)

3. **Run the Test**
   - In Tab 1, click "Run Test" button
   - This will make User 1 spin automatically
   - In Tab 2, manually press "Start Spin"
   - Watch both tabs - they should both redirect to `/voting-window`

### Option 2: Manual Testing

1. **User 1**: Go to `/spin` and press "Start Spin"
2. **User 2**: Go to `/spin` (different browser/incognito) and press "Start Spin"
3. **Verify**:
   - Both users should see "Matched!" or redirect to `/voting-window`
   - Both users should be in `matched` state
   - Match should be created in database
   - Both users should be able to acknowledge and vote

## What the Test Checks

✅ **Match Creation**: Verifies that a match is created when 2 users spin
✅ **State Updates**: Checks that both users' states change to `matched`
✅ **Cache Invalidation**: Ensures cache is invalidated so fresh data is returned
✅ **Redirect Logic**: Verifies that users are redirected to voting window

## Expected Flow

1. User 1 presses "Start Spin" → calls `/api/spin`
2. User 1's cache is invalidated
3. User 2 presses "Start Spin" → calls `/api/spin`
4. User 2's cache is invalidated
5. `try_match_user` finds User 1 and creates match
6. Both users' caches are invalidated
7. Both users' spinning pages fetch fresh status
8. Both users see `state='matched'` and `match.match_id`
9. Both users redirect to `/voting-window?matchId=...`
10. Both users acknowledge the match
11. Vote window starts when both acknowledge

## Troubleshooting

If the test fails:

1. **Check Console Logs**: Look for errors in browser console
2. **Check Network Tab**: Verify API calls are successful
3. **Check Database**: Verify match was created
4. **Check Cache**: Verify cache was invalidated (check `/api/match/status` response)

## Test Page Features

- ✅ Automatic test execution
- ✅ Real-time logs
- ✅ Status verification
- ✅ Match ID display
- ✅ Error reporting







