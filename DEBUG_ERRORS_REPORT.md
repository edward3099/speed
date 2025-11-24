# Debugging Errors Report

**Generated:** 2025-11-22 13:56 UTC

## Summary

- **Total Unresolved Errors:** 5
- **Error Types:** frontend (4), test (1)
- **State Validation:** ✅ No issues detected

## Error Breakdown

### Frontend Errors (4 errors)
**Severity:** ERROR  
**Latest Error:** 2025-11-22 13:55:24 UTC

**Issue:** Function signature mismatch for `log_error` RPC call
- **Error Message:** `function log_error(unknown, unknown, uuid, text, jsonb, unknown) does not exist`
- **Error Code:** 42883
- **Function:** `startSpin_join_queue`
- **User ID:** 959e963e-0327-440b-a99a-f6305a53872c

**Root Cause:** The frontend was calling `log_error` with parameter order that didn't match the database function signature.

**Status:** ✅ **FIXED** - Function signature has been corrected. Future errors should log correctly.

**Affected Errors:**
1. Error ID: `73d30137-fece-445a-925e-32d2df90a45a` - 2025-11-22 13:55:24
2. Error ID: `184db8d6-042b-4cf8-8f1b-6b4d69384c99` - 2025-11-22 13:53:43
3. Error ID: `b1fd93a5-8ea4-4f18-8d40-7467e7ee7c3c` - 2025-11-22 13:52:02
4. Error ID: `2802db4b-f129-4db6-937a-5db867463c25` - 2025-11-22 13:51:50

### Test Error (1 error)
**Severity:** INFO  
**Latest Error:** 2025-11-22 13:56:38 UTC

**Note:** This is a test error from function verification. Can be ignored.

## State Validation Results

✅ **All checks passed:**
- **Stuck Users:** 0
- **Orphan Matches:** 0
- **Duplicate Queue Entries:** 0
- **Total Issues:** 0

## Recommendations

1. ✅ **Function signature fixed** - The `log_error` function now matches frontend calls
2. **Monitor for new errors** - The system is now properly logging errors
3. **Test spinning functionality** - Try spinning again to see if new errors appear
4. **Check matching functions** - Monitor `process_matching_detailed_logging` for any issues

## Next Steps

1. Test the spinning functionality to verify error logging works correctly
2. Monitor `error_log` table for new errors
3. Check if `join_queue_with_logging` and `process_matching_detailed_logging` are working properly
4. Review any new errors that appear during actual usage

## Query Commands

```sql
-- Get all unresolved errors
SELECT * FROM get_unresolved_errors();

-- Get errors by type
SELECT * FROM get_errors_by_type('frontend', 50);
SELECT * FROM get_errors_by_type('process_matching', 50);

-- Run state validation
SELECT * FROM run_all_state_checks();

-- Get recent errors
SELECT * FROM error_log
WHERE resolved = FALSE
ORDER BY error_timestamp DESC
LIMIT 20;
```

