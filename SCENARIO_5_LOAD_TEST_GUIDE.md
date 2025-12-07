# Scenario 5: High Traffic Load Testing Guide

## Overview
Scenario 5 requires testing with 200-500 simultaneous spinning users to verify:
1. No user waits forever
2. Everyone eventually gets paired
3. Users who wait longer get priority
4. Matches form continuously
5. Two users never match twice in one session
6. Offline users are never pulled into matches
7. Passes do not freeze the system
8. Idles do not freeze the system
9. Disconnects do not freeze the system
10. The spin logic always keeps moving

## Prerequisites
- k6 installed (`brew install k6` on macOS)
- Access to your Supabase project
- API endpoints configured

## Running the Test

### Option 1: Use Existing k6 Test
```bash
cd /Users/bb/Desktop/speed/tests/k6
k6 run spin-test.js --vus 200 --duration 5m
```

### Option 2: Custom Load Test
```bash
# Test with 200 users
k6 run --vus 200 --duration 5m spin-test.js

# Test with 500 users (stress test)
k6 run --vus 500 --duration 10m spin-test.js
```

## Expected Metrics

### Success Criteria
- **Match Rate**: >95% of users should match within 30 seconds
- **No Stuck Users**: All users should eventually match or timeout gracefully
- **Fairness**: Users with higher fairness scores should match first
- **No Duplicate Matches**: Same pair should never match twice
- **System Stability**: No errors, no crashes, consistent response times

### Key Metrics to Monitor
1. **Match Time**: Average time from spin to match
2. **Match Success Rate**: Percentage of users who successfully match
3. **Queue Size**: Should remain manageable (<1000 users)
4. **Error Rate**: Should be <1%
5. **Response Time**: API calls should be <500ms (p95)

## Monitoring During Test

### Database Queries
```sql
-- Check queue size
SELECT COUNT(*) FROM queue;

-- Check active matches
SELECT COUNT(*) FROM matches WHERE status = 'vote_active';

-- Check stuck users (waiting > 60 seconds)
SELECT COUNT(*) FROM queue 
WHERE waiting_since < NOW() - INTERVAL '60 seconds';

-- Check for duplicate matches
SELECT user1_id, user2_id, COUNT(*) 
FROM matches 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user1_id, user2_id 
HAVING COUNT(*) > 1;
```

### System Health
- Monitor Supabase dashboard for:
  - Database CPU usage
  - Connection pool usage
  - Query performance
  - Error rates

## Test Scenarios to Verify

1. **High Concurrency**: 200-500 users spinning simultaneously
2. **Fairness**: Users with high fairness should match first
3. **No Duplicates**: Same pair should never match twice
4. **Offline Filtering**: Offline users should not be matched
5. **System Continuity**: System should continue working under load

## Troubleshooting

### If Users Get Stuck
- Check `process_matching()` function is running frequently
- Verify materialized view `matching_pool` is refreshed
- Check for deadlocks or long-running queries

### If Match Rate is Low
- Verify `process_matching()` processes multiple matches per cycle
- Check queue size and matching pool size
- Verify fairness algorithm is working

### If System Slows Down
- Check database indexes
- Monitor connection pool
- Consider increasing `process_matching()` batch size

## Next Steps After Test

1. Review k6 output for any errors
2. Check database logs for slow queries
3. Verify all success criteria are met
4. Document any issues found
5. Optimize if needed

## Notes

- This test requires actual load testing infrastructure
- Consider running during off-peak hours
- Monitor database costs during test
- Have rollback plan ready
