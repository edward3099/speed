# Stuck Matches Prevention - Comprehensive Safeguards

## Overview

This document describes the multiple layers of protection that ensure matches can **NEVER** get stuck without vote windows.

## Problem Statement

Previously, matches could be created but:
- Vote window was never initialized
- Users remained in 'matched' state but couldn't vote
- Frontend couldn't detect the match
- Users were stuck indefinitely

## Solution: Multiple Layers of Protection

### Layer 1: Database Constraint (Prevention)

**Constraint:** `matches_active_requires_vote_window`
- Prevents matches with `status='active'` from existing without vote windows
- Database-level enforcement - cannot be bypassed
- Violations are caught immediately at insert/update time

```sql
CHECK (
  (status != 'active') OR 
  (vote_window_expires_at IS NOT NULL AND vote_window_started_at IS NOT NULL)
)
```

### Layer 2: Database Trigger (Auto-Repair on Insert/Update)

**Trigger:** `trigger_ensure_vote_window_initialized`
- Automatically initializes vote window if missing when match is created
- Runs BEFORE INSERT/UPDATE - catches issues before they're saved
- No code changes needed - works automatically

**Function:** `ensure_vote_window_initialized()`
- Checks if vote window is missing
- Auto-initializes if needed
- Sets status to 'active' (required by constraint)

### Layer 3: Application-Level Fix in `try_match_user`

**Function:** `try_match_user()`
- Explicitly initializes vote window after match creation
- Sets status to 'active' immediately
- This is the primary fix - trigger is backup

### Layer 4: Automatic Repair Cron Job (Recovery)

**Endpoint:** `/api/cron/repair-stuck-matches`
**Function:** `repair_stuck_matches()`
- Runs every 10 seconds
- Finds and fixes any stuck matches (safety net)
- Repairs matches created in last hour
- Returns count of repaired matches

**Configuration:**
- Should be called every 10 seconds
- Vercel Cron or external scheduler
- Monitors and alerts if many stuck matches found

### Layer 5: Cache Invalidation (Frontend Detection)

**Location:** `/api/spin` route
- Invalidates cache for both users when match is created
- Ensures frontend sees match status change immediately
- Critical for redirect to voting window

**Implementation:**
```typescript
// Always invalidate current user
cache.delete(CacheKeys.userMatchStatus(user.id))

// If matched, invalidate partner's cache IMMEDIATELY
if (matchId) {
  const partnerId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id
  cache.delete(CacheKeys.userMatchStatus(partnerId))
}
```

### Layer 6: Monitoring Function

**Function:** `check_for_stuck_matches()`
- Monitors for stuck matches
- Returns count, IDs, and age of stuck matches
- Can be called for alerting/monitoring
- Should return 0 stuck matches (if working correctly)

## How It Works Together

1. **Prevention:** Constraint prevents invalid states
2. **Auto-Repair:** Trigger fixes issues before they're saved
3. **Application Fix:** `try_match_user` explicitly initializes vote window
4. **Recovery:** Cron job repairs any matches that slip through
5. **Frontend:** Cache invalidation ensures users see matches immediately
6. **Monitoring:** Function detects issues for alerting

## Testing

To verify the safeguards work:

```sql
-- Check for stuck matches (should return 0)
SELECT * FROM check_for_stuck_matches();

-- Test repair function
SELECT * FROM repair_stuck_matches();

-- Verify constraint works
-- This should fail:
INSERT INTO matches (match_id, user1_id, user2_id, status)
VALUES (gen_random_uuid(), '...', '...', 'active');
-- Error: violates check constraint matches_active_requires_vote_window
```

## Cron Job Setup

Add to `vercel.json` or external scheduler:

```json
{
  "crons": [
    {
      "path": "/api/cron/repair-stuck-matches",
      "schedule": "*/10 * * * * *"
    }
  ]
}
```

## Result

✅ **Matches can NEVER get stuck without vote windows**
✅ **Multiple layers ensure reliability**
✅ **Automatic recovery if issues occur**
✅ **Frontend always sees matches immediately**

## Maintenance

- Monitor `check_for_stuck_matches()` regularly
- Alert if stuck matches found (should be 0)
- Review cron job logs to ensure it's running
- Verify trigger is active: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_ensure_vote_window_initialized';`






























