# Testing Guide - Matching Engine Rebuild

## Prerequisites

1. ✅ All migrations applied to Supabase
2. ✅ API routes created
3. ✅ Services created
4. ✅ Frontend updated (or ready to update)

## Test Scenarios (from Part 8)

### Scenario 1: Two Users Spin Simultaneously

**Steps:**
1. User A (male) presses spin
2. User B (female) presses spin
3. Both should be matched instantly
4. Both should see vote window with 10-second countdown

**Expected:**
- ✅ Match created in `matches` table
- ✅ Both users in `vote_active` state
- ✅ `vote_window_expires_at` set to NOW() + 10 seconds
- ✅ Debug logs show: spin_pressed → queue_join → match_found → vote_window_start

**Verify:**
```sql
SELECT * FROM matches WHERE status = 'vote_active';
SELECT * FROM user_status WHERE state = 'vote_active';
SELECT * FROM debug_logs WHERE event_type IN ('spin_pressed', 'match_found', 'vote_window_start');
```

### Scenario 2: Yes + Pass Outcome

**Steps:**
1. User A votes yes
2. User B votes pass
3. Check outcomes

**Expected:**
- ✅ User A gets +10 fairness boost
- ✅ User A auto respins (state = spin_active, in queue)
- ✅ User B goes to idle (state = idle, NOT in queue)
- ✅ Match deleted
- ✅ Pair added to never_pair_again

**Verify:**
```sql
SELECT fairness_score FROM queue WHERE user_id = 'user_a_id'; -- Should be +10
SELECT state FROM user_status WHERE user_id = 'user_a_id'; -- Should be 'spin_active'
SELECT state FROM user_status WHERE user_id = 'user_b_id'; -- Should be 'idle'
SELECT * FROM never_pair_again WHERE user1 = LEAST('user_a_id', 'user_b_id') AND user2 = GREATEST('user_a_id', 'user_b_id');
```

### Scenario 3: Yes + Idle Outcome

**Steps:**
1. User A votes yes
2. Wait 10 seconds (countdown expires)
3. User B is idle

**Expected:**
- ✅ User B removed from queue
- ✅ User B state = idle (must spin manually)
- ✅ User A gets +10 fairness boost
- ✅ User A auto respins

**Verify:**
```sql
-- Call handle_idle_voter function
SELECT handle_idle_voter('user_b_id', match_id);

-- Check outcomes
SELECT fairness_score FROM queue WHERE user_id = 'user_a_id'; -- Should be +10
SELECT state FROM user_status WHERE user_id = 'user_b_id'; -- Should be 'idle'
SELECT COUNT(*) FROM queue WHERE user_id = 'user_b_id'; -- Should be 0
```

### Scenario 4: Disconnect Handling

**Steps:**
1. User A and B matched
2. User B disconnects during vote window
3. Check outcomes

**Expected:**
- ✅ User B enters cooldown (5 minutes)
- ✅ User B removed from queue
- ✅ Match deleted
- ✅ If User A voted yes, User A gets +10 boost and auto respins

**Verify:**
```sql
SELECT handle_disconnect('user_b_id');

-- Check cooldown
SELECT cooldown_until FROM profiles WHERE id = 'user_b_id'; -- Should be NOW() + 5 minutes
SELECT state FROM user_status WHERE user_id = 'user_b_id'; -- Should be 'cooldown'

-- Check User A if voted yes
SELECT fairness_score FROM queue WHERE user_id = 'user_a_id'; -- Should be +10 if voted yes
```

### Scenario 5: Preference Expansion

**Steps:**
1. User A spins
2. Wait 10 seconds → check preference_stage
3. Wait 15 seconds → check preference_stage
4. Wait 20 seconds → check preference_stage

**Expected:**
- ✅ 0-10s: preference_stage = 0 (exact)
- ✅ 10-15s: preference_stage = 1 (age expanded)
- ✅ 15-20s: preference_stage = 2 (distance expanded)
- ✅ 20s+: preference_stage = 3 (full expansion)

**Verify:**
```sql
SELECT preference_stage, EXTRACT(EPOCH FROM (NOW() - spin_started_at))::INTEGER as wait_seconds
FROM queue
WHERE user_id = 'user_a_id';
```

### Scenario 6: Fairness Calculation

**Steps:**
1. User A spins, wait 5 seconds
2. User A votes yes, partner passes → gets +10 boost
3. Check fairness_score

**Expected:**
- ✅ Initial: fairness_score = wait_time (5)
- ✅ After boost: fairness_score = 5 + 10 = 15

**Verify:**
```sql
SELECT calculate_fairness_score('user_a_id');
SELECT fairness_score FROM queue WHERE user_id = 'user_a_id';
```

## Validation Tests (from Part 9)

### State Model Validation

```sql
-- Check all users have valid states
SELECT user_id, state FROM user_status
WHERE state NOT IN ('idle', 'spin_active', 'queue_waiting', 'paired', 'vote_active', 'cooldown', 'offline');
-- Should return 0 rows
```

### Invariant Validation

```sql
-- Invariant 1: User in at most one pair
SELECT user_id, COUNT(*) as pair_count
FROM matches
WHERE status IN ('pending', 'vote_active')
GROUP BY user1_id, user2_id
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Invariant 2: No offline users paired
SELECT m.* FROM matches m
INNER JOIN profiles p1 ON p1.id = m.user1_id
INNER JOIN profiles p2 ON p2.id = m.user2_id
WHERE m.status IN ('pending', 'vote_active')
  AND (NOT p1.online OR NOT p2.online);
-- Should return 0 rows

-- Invariant 5: Queue contains no duplicates
SELECT user_id, COUNT(*) FROM queue GROUP BY user_id HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Atomicity Validation

```sql
-- After match creation, verify:
-- 1. Both users marked paired
SELECT state FROM user_status WHERE user_id IN ('user1_id', 'user2_id');
-- Should both be 'paired' or 'vote_active'

-- 2. Both removed from queue
SELECT COUNT(*) FROM queue WHERE user_id IN ('user1_id', 'user2_id');
-- Should be 0

-- 3. Match exists
SELECT * FROM matches WHERE user1_id IN ('user1_id', 'user2_id') OR user2_id IN ('user1_id', 'user2_id');
-- Should return 1 row
```

## Running Tests

1. **Apply Migrations:**
   ```bash
   cd supabase/migrations/blueprint
   # Apply migrations in order (000, 001, 002, ..., 113)
   ```

2. **Test via API:**
   ```bash
   # Test spin
   curl -X POST http://localhost:3000/api/spin \
     -H "Authorization: Bearer <token>"
   
   # Test vote
   curl -X POST http://localhost:3000/api/vote \
     -H "Content-Type: application/json" \
     -d '{"match_id": 1, "vote_type": "yes"}'
   
   # Test heartbeat
   curl -X POST http://localhost:3000/api/heartbeat \
     -H "Authorization: Bearer <token>"
   
   # Test match polling
   curl http://localhost:3000/api/match \
     -H "Authorization: Bearer <token>"
   ```

3. **Test via SQL:**
   ```sql
   -- Run guardian job
   SELECT guardian_job();
   
   -- Process matching
   SELECT process_matching();
   
   -- Check queue
   SELECT * FROM queue ORDER BY fairness_score DESC;
   ```

## Debugging

Use the SpinDebugger component to see all logs in real-time:
1. Open `/spin` page
2. Click the Bug icon (bottom-right)
3. View all console logs and database logs
4. Filter by event type, level, or search text

## Next Steps After Testing

1. Fix any issues found
2. Update frontend to use new API routes
3. Test with multiple users (10, 50, 100+)
4. Run performance tests
5. Deploy to production
