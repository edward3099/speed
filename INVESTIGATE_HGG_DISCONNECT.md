# Investigation: Hgg Voted Yes Then Disconnected

## Issue
User Hgg voted "yes" and then somehow disconnected.

## Possible Causes

1. **Network disconnection** - User lost connection after voting
2. **Heartbeat timeout** - User's heartbeat stopped, marking them offline
3. **Browser/tab closed** - User closed browser or tab
4. **Backend error** - Error during vote processing caused disconnection
5. **State transition issue** - Incorrect state transition after voting

## What to Check

### 1. Check Hgg's Profile and Current State
```sql
SELECT id, email, is_online, created_at
FROM profiles
WHERE email LIKE '%Hgg%'
ORDER BY created_at DESC
LIMIT 5;
```

### 2. Check Hgg's Most Recent Match
```sql
SELECT 
  m.id as match_id,
  m.user1_id,
  m.user2_id,
  m.status,
  m.vote_window_expires_at,
  m.created_at,
  p1.email as user1_email,
  p2.email as user2_email
FROM matches m
JOIN profiles p1 ON m.user1_id = p1.id
JOIN profiles p2 ON m.user2_id = p2.id
WHERE p1.email LIKE '%Hgg%' OR p2.email LIKE '%Hgg%'
ORDER BY m.created_at DESC
LIMIT 5;
```

### 3. Check Hgg's Vote
```sql
SELECT 
  vs.id,
  vs.match_id,
  vs.voter_id,
  vs.vote_type,
  vs.submitted_at,
  vs.outcome,
  vs.partner_vote,
  p.email as voter_email
FROM vote_sessions vs
JOIN profiles p ON vs.voter_id = p.id
WHERE p.email LIKE '%Hgg%'
ORDER BY vs.submitted_at DESC
LIMIT 10;
```

### 4. Check Hgg's State Transitions
```sql
SELECT 
  st.id,
  st.user_id,
  st.match_id,
  st.from_state,
  st.to_state,
  st.transition_at,
  st.reason,
  p.email as user_email
FROM state_transitions st
JOIN profiles p ON st.user_id = p.id
WHERE p.email LIKE '%Hgg%'
ORDER BY st.transition_at DESC
LIMIT 20;
```

### 5. Check Hgg's Current User Status
```sql
SELECT 
  us.user_id,
  us.state,
  us.last_state,
  us.last_state_change,
  us.online_status,
  us.last_heartbeat,
  p.email
FROM user_status us
JOIN profiles p ON us.user_id = p.id
WHERE p.email LIKE '%Hgg%';
```

### 6. Check Hgg's Destination Tracking
```sql
SELECT 
  udt.id,
  udt.match_id,
  udt.user_id,
  udt.partner_id,
  udt.destination,
  udt.destination_reason,
  udt.transitioned_at,
  udt.validation_status,
  p.email as user_email,
  p2.email as partner_email
FROM user_destination_tracking udt
JOIN profiles p ON udt.user_id = p.id
LEFT JOIN profiles p2 ON udt.partner_id = p2.id
WHERE p.email LIKE '%Hgg%'
ORDER BY udt.transitioned_at DESC
LIMIT 10;
```

## Potential Issues

1. **Heartbeat stopped** - If heartbeat stops, user might be marked offline
2. **No error handling** - If vote processing fails, user might be left in bad state
3. **Real-time subscription closed** - If subscription closes, user might not get updates
4. **Network error** - Network issues during vote submission

## Next Steps

1. Run the SQL queries above to understand what happened
2. Check if Hgg's vote was recorded
3. Check if Hgg's state transitioned correctly
4. Check if partner was affected
5. Review error logs for any backend errors


