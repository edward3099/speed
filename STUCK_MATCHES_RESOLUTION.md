# Stuck Matches Resolution

## Issue

Found **4 stuck matches** with expired vote windows that were never resolved:
1. `8ffe3e3b-e432-45b4-9bf3-a48d1b1cb907` (male3333 + female2222) - ✅ RESOLVED as `idle_idle`
2. `9424be3d-736a-47c3-a14b-e1ec2e6c3ba5` (female1111 + male3333) - ✅ RESOLVED as `idle_idle`
3. `ceeef30b-5cc4-4f08-a012-318cfc48fde4` (Test User 44923e3c + Test User a39f05a3) - ✅ RESOLVED as `yes_idle` (one user voted yes)
4. `f35c59e2-e75e-46ff-a676-0c9f6b691d66` (female3333 + male3333) - ✅ RESOLVED as `idle_idle`

## Root Cause

The `resolve_expired_votes()` function had a constraint violation bug:
- Tried to set `status='completed'` without clearing `vote_window_expires_at`
- Violated constraint: `matches_vote_window_only_when_active`
- Function failed silently, leaving matches stuck

## Fixes Applied

### 1. Fixed resolve_expired_votes() Function ✅
- Migration: `fix_resolve_expired_votes_constraint_violation`
- Now properly clears `vote_window_expires_at` and `vote_window_started_at` when completing matches
- Function will now work correctly going forward

### 2. Manually Resolved All Stuck Matches ✅
All 4 stuck matches have been resolved:
- **Match 1 & 2 & 4**: Set outcome to `idle_idle` (no votes recorded) → both users set to `idle`
- **Match 3**: Set outcome to `yes_idle` (one user voted yes) → yes user set to `waiting` (re-queued), idle user set to `idle`
- All matches: Set status to `completed`, cleared vote_window fields

### 3. Verified Resolution ✅
- ✅ No remaining stuck matches found (0 stuck matches remaining)
- ✅ Fixed `resolve_expired_votes()` function resolved 3 additional matches automatically
- ✅ All affected users are now eligible to match again

### 4. Users Freed Up ✅
- **male3333**: `idle` - ✅ ELIGIBLE
- **female2222**: `waiting` - ✅ ELIGIBLE (already in queue)
- **female3333**: `idle` - ✅ ELIGIBLE
- **female1111**: `idle` - ✅ ELIGIBLE
- **Test User 44923e3c**: `waiting` - ✅ ELIGIBLE (re-queued after voting yes)
- **Test User a39f05a3**: `idle` - ✅ ELIGIBLE

## Users Freed Up

All users from the stuck matches are now in `idle` state and can join the queue to match again.

## Prevention

The fixed `resolve_expired_votes()` function will now automatically resolve expired vote windows when the cron job runs every 10 seconds. Matches should no longer get stuck.

### Function Fix Details

The function now properly:
1. ✅ Clears `vote_window_expires_at` and `vote_window_started_at` when setting status='completed'
2. ✅ Handles `idle_idle` outcome (both users → idle)
3. ✅ Handles `yes_idle` outcome (yes user → waiting with boost, idle user → idle)
4. ✅ Handles `pass_idle` outcome (pass user → waiting, idle user → idle)
5. ✅ Satisfies database constraint `matches_vote_window_only_when_active`

## Cron Job Status

Make sure `/api/cron/resolve-expired-votes` is scheduled to run every 10 seconds via:
- Vercel Cron (recommended)
- External scheduler
- Manual calls for testing
