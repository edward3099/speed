# Matching Issue Diagnosis: Users Not Matching

## Problem

Two users spinning are not matching despite both being in waiting state.

## Root Cause Analysis

### Issue 1: Gender Mismatch ⚠️
**All waiting users are FEMALE** - There are 4 females waiting but no available males:
- female2222
- female1111  
- Female
- female3333

**Matching Logic Requirement**: Opposite genders required (`p1.gender != p2.gender`)

**Available Males**: Only 1 male exists (male3333) but he's already in `matched` state.

### Issue 2: Stale Users ⚠️
Users are being excluded from matching because they're past the active window:

**Active Matching Criteria** (from `try_match_user`):
- Must have `waiting_since > NOW() - 60 seconds` OR
- Must have `last_active > NOW() - 15 seconds`

**Current Waiting Users**:
- female2222: waiting since 21:27:34, last_active 21:27:42 (8+ minutes ago) - **STALE**
- female1111: waiting since 21:17:40, last_active 21:18:38 (18+ minutes ago) - **STALE**
- Female: waiting since 20:18:40, last_active 20:18:57 (1+ hour ago) - **STALE**
- female3333: waiting since 21:33:18, last_active 21:35:55 (about 30 seconds ago) - **ACTIVE**

Only `female3333` meets the active criteria, but there's no available male to match with.

## Why This Happens

1. **Heartbeat System**: Users need to send heartbeats every 7 seconds to stay active
2. **Active Window**: If heartbeat is missed, user becomes ineligible (>15 seconds)
3. **Queue Window**: Users who joined >60 seconds ago are excluded (unless they have recent heartbeats)

## Solutions

### Immediate Fix: Test with Opposite Gender Users
To test matching, you need:
- At least 1 male user spinning
- At least 1 female user spinning  
- Both actively sending heartbeats (on spinning page)

### Long-Term Fix: Improve Active User Detection
The current criteria might be too strict. Consider:
- Extending `last_active` window to account for network delays
- Using heartbeat interval + buffer (7s + 10s buffer = 17s minimum)

## Verification Steps

1. **Check if heartbeats are working**:
   ```sql
   SELECT user_id, name, last_active, 
          EXTRACT(EPOCH FROM (NOW() - last_active)) as seconds_since_active
   FROM users_state us
   JOIN profiles p ON us.user_id = p.id
   WHERE us.state = 'waiting'
   ORDER BY last_active DESC;
   ```

2. **Check gender distribution**:
   ```sql
   SELECT gender, COUNT(*) 
   FROM users_state us
   JOIN profiles p ON us.user_id = p.id
   WHERE us.state = 'waiting'
   GROUP BY gender;
   ```

3. **Test matching manually**:
   - Get two users (1 male, 1 female)
   - Have both spin simultaneously
   - Check if they match within 1-2 seconds

## Expected Behavior

When two compatible users spin:
1. Both call `join_queue()` → state = 'waiting'
2. Both call `try_match_user()` immediately
3. One succeeds, creates match
4. Both get redirected to voting window

If initial matching fails (lock conflict):
- Retry cron job runs every 5 seconds
- Should match within 5-10 seconds

## Current Status

- ✅ Matching logic is correct
- ✅ Retry mechanism exists (cron job)
- ✅ Heartbeat system is working (female3333 is active)
- ⚠️ **No compatible pairs available** (all females, no males)
- ⚠️ **Most users are stale** (past active window - not sending heartbeats)

## Active User Status

As of latest check:
- ✅ **female3333**: ACTIVE (6 seconds since last_active) - eligible to match
- ❌ **female2222**: STALE (605 seconds since last_active) - not eligible
- ❌ **female1111**: STALE (1149 seconds since last_active) - not eligible  
- ❌ **Female**: STALE (4729 seconds since last_active) - not eligible

## Solution: Test with 1 Male + 1 Female

To verify matching works:
1. Have 1 male user spin (e.g., male3333 - if he's not already matched)
2. Have 1 female user spin (e.g., female3333 - she's already active)
3. Both should match within 1-2 seconds

If male3333 is already matched, you need another male user to test.
