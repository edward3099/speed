# Matching Logic Issues Exposed by Tests

## Summary
The automated test suite has exposed **critical issues** in the matching logic that need to be addressed.

## Critical Issues

### 1. **Statement Timeout Errors (57014)**
**Problem**: `process_matching_v2` is hitting PostgreSQL statement timeouts (5 seconds default).

**Evidence**:
```
process_matching_v2 error: {
  code: '57014',
  details: null,
  hint: null,
  message: 'canceling statement due to statement timeout'
}
```

**Root Cause**: The guaranteed matching logic with retries and waiting cycles is causing the function to exceed the database statement timeout limit.

**Impact**: 
- Matching fails completely when timeout occurs
- Users cannot get matched even when partners are available
- Violates the "every spin leads to a pairing" guarantee

**Location**: `supabase/migrations/20250125_guarantee_every_spin_leads_to_pairing.sql`

---

### 2. **Fairness Score Not Calculated**
**Problem**: Fairness scores are `0` or `null` for users in the queue.

**Evidence**:
```
AssertionError: expected 0 to be greater than 0
❯ tests/matching-logic.vitest.test.ts:294:42
```

**Root Cause**: 
- `calculate_fairness_score` function may not be called when users join queue
- Fairness score calculation might not be triggered automatically
- The `spark_join_queue` function may not calculate fairness on join

**Impact**:
- Fairness priority matching doesn't work
- Long-waiting users don't get priority
- Unfair matching distribution

**Location**: Queue join logic, fairness calculation triggers

---

### 3. **Test Timeouts Despite Global Configuration**
**Problem**: Tests are timing out at 5000ms despite global timeout of 120000ms.

**Evidence**:
```
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
```

**Root Cause**: 
- Vitest may have a per-test default timeout that overrides global config
- Tests need explicit timeout parameters

**Impact**: 
- Tests fail prematurely
- Cannot properly test long-running matching operations

**Location**: `tests/vitest.config.ts`, individual test definitions

---

### 4. **process_matching_v2 Taking Too Long**
**Problem**: The matching function takes longer than expected, causing timeouts.

**Evidence**:
- Multiple tests timing out when calling `process_matching_v2`
- Function retries up to 30 times with waiting cycles
- Each wait cycle is 1 second, potentially 30+ seconds total

**Root Cause**: 
- Excessive retry logic in guaranteed matching
- Waiting mechanism adds significant delay
- No early exit conditions

**Impact**:
- Poor user experience (long wait times)
- Database connection timeouts
- Resource exhaustion

**Location**: `process_matching_v2` function in migration

---

### 5. **API Route Errors**
**Problem**: Background matching API returning 500 errors.

**Evidence**:
```
AssertionError: expected 500 to be 200
❯ tests/api-routes.vitest.test.ts:78:20
```

**Root Cause**: 
- API route may be calling timed-out functions
- Error handling not properly catching timeout errors
- Database function failures not being handled

**Impact**:
- Background matching not working
- API endpoints failing
- System reliability issues

**Location**: `src/app/api/queue-management/route.ts`

---

## Test Results Summary

### Passing Tests (8/18)
- ✅ Scenario 8: Queue Cleanup on Disconnect
- ✅ calculate_fairness_score - Calculates fairness correctly
- ✅ validate_match_rules - Validates match compatibility
- ✅ Spin Logs API
- ✅ Spin Logs API - Filter by user
- ✅ Guardians API - POST trigger
- ✅ Queue Management API - POST execute

### Failing Tests (10/18)
- ❌ Scenario 1: Immediate Match (Tier 1) - **Timeout**
- ❌ Scenario 2: Fairness Priority - **Fairness score = 0**
- ❌ Scenario 4: Guaranteed Match - **Timeout**
- ❌ Scenario 5: Both Vote Yes - **Timeout**
- ❌ Scenario 6: One Yes, One Pass - **Timeout**
- ❌ Scenario 10: Race Condition Prevention - **Timeout**
- ❌ process_matching_v2 - Finds match for user - **Timeout**
- ❌ guardian_orchestrator - Runs all guardians - **Timeout**
- ❌ Queue Management API - GET health check - **Syntax error**
- ❌ Background Matching API - **500 error**

---

## Recommended Fixes

### Priority 1: Fix Statement Timeout
1. **Reduce retry counts** in `process_matching_v2` (from 30 to 10)
2. **Reduce wait cycles** (from 10 to 3)
3. **Add early exit conditions** when match is found
4. **Increase PostgreSQL statement timeout** for matching functions
5. **Implement async matching** - return immediately, process in background

### Priority 2: Fix Fairness Score Calculation
1. **Ensure `calculate_fairness_score` is called** when users join queue
2. **Add trigger** to automatically calculate fairness on queue entry
3. **Verify fairness calculation** in `spark_join_queue` function
4. **Add test** to verify fairness scores are non-zero

### Priority 3: Fix Test Timeouts
1. **Add explicit timeout** to each test: `test('name', async () => {...}, 120000)`
2. **Verify global timeout** is being applied
3. **Check Vitest configuration** for timeout inheritance

### Priority 4: Optimize Matching Performance
1. **Reduce retry logic** complexity
2. **Add caching** for queue state
3. **Implement early exit** when match found
4. **Add performance monitoring** to identify bottlenecks

---

## Next Steps

1. **Fix statement timeout** - Most critical issue
2. **Fix fairness calculation** - Core matching logic
3. **Optimize matching performance** - User experience
4. **Fix test infrastructure** - Enable proper testing
5. **Re-run tests** - Verify fixes

---

## Test Command
```bash
npm run test:vitest
```

## Files to Review
- `supabase/migrations/20250125_guarantee_every_spin_leads_to_pairing.sql`
- `tests/matching-logic.vitest.test.ts`
- `tests/vitest.config.ts`
- `src/app/api/queue-management/route.ts`

