# How to Test Matching: 2 Users Spinning

## Quick Test Instructions

### Prerequisites
- 2 browser windows/tabs (or 2 different browsers)
- 1 male user account
- 1 female user account

### Steps

1. **Window 1 - Male User**:
   - Log in as male user
   - Navigate to `/spin`
   - Click "Start Spin"
   - Should redirect to `/spinning`

2. **Window 2 - Female User**:
   - Log in as female user (different account)
   - Navigate to `/spin`
   - Click "Start Spin"
   - Should redirect to `/spinning`

3. **Expected Result**:
   - Both should match within 1-2 seconds
   - Both should redirect to `/voting-window`
   - Both should see partner's profile

### Troubleshooting

**If users don't match:**
1. Check both are actively spinning (heartbeats sending every 7s)
2. Check browser console for errors
3. Check network tab - should see heartbeat requests every ~7s
4. Verify genders are opposite (male + female)

**If one user is stale:**
- User might have left the spinning page
- Heartbeat stops when user navigates away
- User needs to stay on `/spinning` page for heartbeats

## Test with Specific Users

If testing with existing users:
- Check their current state: `SELECT * FROM users_state WHERE ...`
- Check if they're already matched: `state = 'matched'`
- Reset if needed: Update state back to 'idle'

## Debugging Matching

### Check Matching Eligibility
```sql
SELECT 
  p1.name as user1,
  p1.gender as user1_gender,
  p2.name as user2,
  p2.gender as user2_gender,
  CASE 
    WHEN p1.gender != p2.gender THEN '✅ Compatible'
    ELSE '❌ Same gender'
  END as compatibility
FROM users_state us1
JOIN profiles p1 ON us1.user_id = p1.id
CROSS JOIN users_state us2
JOIN profiles p2 ON us2.user_id = p2.id
WHERE us1.state = 'waiting'
  AND us2.state = 'waiting'
  AND us1.user_id != us2.user_id;
```

### Check Active Users
```sql
SELECT 
  p.name,
  p.gender,
  us.state,
  us.last_active,
  EXTRACT(EPOCH FROM (NOW() - us.last_active)) as seconds_since_active,
  CASE 
    WHEN us.last_active > NOW() - INTERVAL '15 seconds' THEN '✅ ACTIVE'
    WHEN us.waiting_since > NOW() - INTERVAL '60 seconds' THEN '✅ RECENTLY_JOINED'
    ELSE '❌ STALE'
  END as status
FROM users_state us
JOIN profiles p ON us.user_id = p.id
WHERE us.state = 'waiting';
```
