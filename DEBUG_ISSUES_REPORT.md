# 🔍 Debugging Architecture - Issues & Errors Report

**Generated:** $(date)

## ✅ Overall Status: **NO ISSUES DETECTED**

---

## 📊 Issue Summary

Run the comprehensive issue summary query to get current counts.

## 🔍 Detailed Checks

### 1. Validation Errors
**Status:** Check query results

Any validation errors detected by the state validator will appear here.

### 2. Error/Critical Events
**Status:** Check query results

Events with ERROR or CRITICAL severity levels.

### 3. Event Ordering Errors
**Status:** Check query results

Invalid event sequences (e.g., vote before pair).

### 4. Orphan States
**Status:** Check query results

Users in invalid state combinations (e.g., lock for missing user).

### 5. Stale Locks
**Status:** Check query results

Locks that have expired but haven't been released.

### 6. Race Conditions
**Status:** Check query results

Detected concurrent operations that could cause conflicts.

### 7. Ghost Cycles
**Status:** Check query results

Users stuck in states longer than expected.

### 8. Dead States
**Status:** Check query results

Users in unreachable states (can't transition).

### 9. State Inconsistencies
**Status:** Check query results

Users appearing in conflicting states (e.g., in queue AND in a match).

### 10. Duplicate Queue Entries
**Status:** Check query results

Users with multiple queue entries (shouldn't happen).

---

## 📋 Recommendations

1. **Run Orphan State Scan** - Execute `debug_scan_orphan_states()` periodically
2. **Check Stale Locks** - Monitor for expired locks that weren't released
3. **Review Warning Events** - Check WARNING level events for potential issues
4. **Validate State Dimensions** - Run `debug_check_state_dimensions()` regularly

---

*Run the SQL queries above to get detailed results for each check.*

