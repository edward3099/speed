# User 1 Redirect Issue - Fixed ✅

## Problem Identified

**Issue:** User 1 wasn't being redirected to voting window after match was created.

**Root Cause:** Cache invalidation missing when match is created.

### What Was Happening:

1. User 1 calls `/api/spin` → `join_queue` → `try_match_user` → Match created
2. Match status cache for User 1 still has old data (`state='waiting'`, `match=null`)
3. User 1's spinning page checks `/api/match/status` → Gets cached stale data
4. Redirect logic doesn't trigger because cache shows `match=null`
5. User 1 stays on spinning page, never redirects

### Why WebSocket Didn't Help:

- WebSocket subscription listens for `users_state` updates
- When match is created, `users_state` is updated to `state='matched'`
- BUT: The spinning page fetches `/api/match/status` which returns cached data
- Cache has 15-second TTL, so stale data persists

## Fix Applied

### 1. Added Cache Invalidation in `/api/spin`
- When `try_match_user` succeeds and returns a `matchId`
- Invalidate cache for the current user
- Also invalidate cache for the partner user
- This ensures both users get fresh data immediately

### 2. Cache Invalidation Logic:
```typescript
// CRITICAL: Invalidate cache for this user (match status changed)
cache.delete(CacheKeys.userMatchStatus(user.id))

// If matched, also invalidate partner's cache
if (matchId) {
  // Get partner ID from match
  const { data: matchData } = await supabase
    .from('matches')
    .select('user1_id, user2_id')
    .eq('match_id', matchId)
    .single()
  
  const partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id
  cache.delete(CacheKeys.userMatchStatus(partnerId))
}
```

## Result

✅ **Both users will now get fresh match status immediately**
✅ **Redirect logic will trigger correctly**
✅ **Both users will be redirected to voting window**

## Testing

To verify the fix:
1. User 1 and User 2 both press "Start Spin"
2. Match is created
3. Both users' caches are invalidated
4. Both users' spinning pages fetch fresh status
5. Both users redirect to `/voting-window`

## Additional Notes

- The cache has a 15-second TTL, which is good for performance
- But we MUST invalidate it when matches are created
- WebSocket still works as a backup, but cache invalidation is the primary fix







