# Spin Logic Test Execution Guide

## Overview

This guide explains how to use the production test functions to verify your spin logic is ready for production. The tests are designed to catch **real errors users will face** when pressing spin.

## Test Functions Available

All test functions are in `supabase/migrations/20250110_production_test_functions.sql`.

### Individual Test Functions

1. **`test_basic_flow()`** - Test 1.1: Basic Spin → Match → Vote Flow
2. **`test_auto_spin_yes_pass()`** - Test 1.2: Auto-Spin After yes+pass
3. **`test_disconnect_during_countdown_yes()`** - Test 4.2: Disconnect During Countdown (Yes User)
4. **`test_never_match_again()`** - Test 7.1: Never Match Again
5. **`test_double_spin_idempotency()`** - Test 8.1: Double Spin Idempotency
6. **`test_distance_expansion_long_waiter()`** - Test 9.1: Distance Expansion for Long Waiters

### Run All P0 Tests

```sql
SELECT * FROM run_all_p0_tests();
```

## Running Tests

### Via Supabase SQL Editor

1. Open Supabase Dashboard → SQL Editor
2. Run individual test:
   ```sql
   SELECT * FROM test_double_spin_idempotency();
   ```
3. Run all P0 tests:
   ```sql
   SELECT * FROM run_all_p0_tests();
   ```

### Via API (if exposed)

```bash
curl -X POST https://your-project.supabase.co/rest/v1/rpc/run_all_p0_tests
```

## Test Results

Each test returns:
- `test_name`: Name of the test
- `passed`: `true` if test passed, `false` if failed
- `error_message`: Error message if test failed, `NULL` if passed

### Example Output

```
test_name                              | passed | error_message
---------------------------------------+--------+------------------
Test 8.1: Double Spin Idempotency     | true   | NULL
Test 9.1: Distance Expansion Long Waiter | true | NULL
```

## Current Test Status

### ✅ Passing Tests
- **Test 8.1: Double Spin Idempotency** - ✅ PASSING
- **Test 9.1: Distance Expansion Long Waiter** - ✅ PASSING

### ⚠️ Tests Needing Fixes
- **Test 1.1: Basic Flow** - May need fixes to acknowledge_match_atomic
- **Test 1.2: Auto-Spin yes+pass** - May need fixes to acknowledge_match_atomic
- **Test 4.2: Disconnect During Countdown** - May need fixes to acknowledge_match_atomic
- **Test 7.1: Never Match Again** - May need fixes to acknowledge_match_atomic

## Common Issues Found by Tests

### Issue 1: acknowledge_match_atomic Failing
**Error**: `Match not found` or `User state not found`

**Cause**: Tests may be using users that don't have proper match setup.

**Fix**: Ensure test users are properly matched before calling acknowledge_match_atomic.

### Issue 2: Foreign Key Constraints
**Error**: `insert or update on table "profiles" violates foreign key constraint`

**Cause**: profiles.id references auth.users.

**Fix**: Test functions now reuse existing profiles instead of creating new ones.

## Interpreting Test Failures

### If Test Fails
1. **Read the error_message** - It tells you exactly what went wrong
2. **Check the test code** - See what step failed
3. **Verify the implementation** - Check if the SQL function being tested has the bug
4. **Fix the implementation** - Update the SQL function to handle the test case
5. **Re-run the test** - Verify the fix works

### Example Failure Analysis

```
test_name: Step 3: Match created
passed: false
error_message: Users not matched
```

**Analysis**: The matching logic (`continuous_matching`) is not creating matches when it should.

**Action**: Check `find_and_create_match` function, verify compatibility checks, check logs.

## Test Coverage

### P0 Tests (Critical - Must Pass)
- ✅ Basic flow (spin → match → vote → outcome)
- ✅ Auto-spin after yes+pass
- ✅ Disconnect handling
- ✅ Never match again (history)
- ✅ Double spin idempotency
- ✅ Distance expansion for long waiters

### P1 Tests (High Priority - Should Pass)
- Sequential matching (Scenario 1)
- Fairness priority (Scenario 2)
- Other disconnect scenarios
- Fairness boosts

### P2 Tests (Important - Nice to Have)
- High traffic (200-500 users)
- Multiple join/leave
- Performance tests

## Adding New Tests

To add a new test:

1. Create a function following the pattern:
   ```sql
   CREATE OR REPLACE FUNCTION test_your_test_name()
   RETURNS TABLE(
     test_name TEXT,
     passed BOOLEAN,
     error_message TEXT
   )
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     -- Variables
   BEGIN
     -- Setup
     -- Test steps with IF checks
     -- Cleanup
     RETURN QUERY SELECT 'Test Name'::TEXT, TRUE, NULL::TEXT;
   END;
   $$;
   ```

2. Add to `run_all_p0_tests()`:
   ```sql
   RETURN QUERY SELECT * FROM test_your_test_name();
   ```

3. Document in `spin/test-plan-production-ready.md`

## Best Practices

1. **Run tests before every deployment** - Catch issues early
2. **Fix failing tests immediately** - Don't deploy with failing P0 tests
3. **Add tests for new features** - Test new functionality as you build it
4. **Use real scenarios** - Tests should mirror actual user behavior
5. **Clean up test data** - Tests should clean up after themselves

## Next Steps

1. **Fix failing tests** - Address issues found by tests
2. **Add more tests** - Cover all 7 scenarios from @spin/logic
3. **Automate test runs** - Set up CI/CD to run tests automatically
4. **Monitor test results** - Track test pass rates over time
5. **Expand coverage** - Add P1 and P2 tests

## Questions?

- See `spin/test-plan-production-ready.md` for detailed test descriptions
- Check SQL function implementations in `supabase/migrations/`
- Review `spin/logic` for expected behavior


