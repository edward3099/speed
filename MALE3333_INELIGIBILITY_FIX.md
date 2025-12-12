# Fix: Why male3333 Was Ineligible

## Problem

male3333 was stuck in `matched` state and couldn't match because:
1. He was in a match with female2222 (match ID: `8ffe3e3b-e432-45b4-9bf3-a48d1b1cb907`)
2. The vote window expired ~19 minutes ago (21:21:25)
3. The match was never resolved (status='active', outcome=NULL)
4. He remained in `matched` state, making him ineligible for new matches

## Root Cause

The `resolve_expired_votes()` function had a **constraint violation bug**:
- It tried to set `status='completed'` without clearing `vote_window_expires_at`
- Database constraint `matches_vote_window_only_when_active` requires:
  - If `vote_window_expires_at IS NOT NULL`, then `status` MUST be 'active'
  - If `status != 'active'`, then `vote_window_expires_at` MUST be NULL

This caused the function to fail silently, leaving matches stuck.

## Fix Applied

### 1. Fixed `resolve_expired_votes()` Function ✅
- Migration: `fix_resolve_expired_votes_constraint_violation`
- Now clears `vote_window_expires_at` and `vote_window_started_at` when setting status='completed'
- Satisfies the database constraint

### 2. Manually Resolved Stuck Match ✅
- Set match outcome to 'idle_idle' (neither user voted)
- Set match status to 'completed'
- Cleared vote_window fields
- Set both users (male3333 and female2222) to 'idle' state

## Result

✅ **male3333 is now eligible to match again**
- State: `idle` (was `matched`)
- Match ID: `NULL` (was `8ffe3e3b-e432-45b4-9bf3-a48d1b1cb907`)
- Can now join queue and match with other users

✅ **female2222 is also eligible**
- State: `waiting` (already in queue)
- Match ID: `NULL`
- Can match with male3333 or any other male user

## Additional Stuck Matches Found

There are 2 other stuck matches with expired vote windows:
- `ceeef30b-5cc4-4f08-a012-318cfc48fde4` (expired at 20:56:28)
- `9424be3d-736a-47c3-a14b-e1ec2e6c3ba5` (expired at 20:32:11)

These will be automatically resolved by the fixed `resolve_expired_votes()` function when the cron job runs.

## Cron Job Status

The `resolve_expired_votes()` function should be called every 10 seconds by:
- `/api/cron/resolve-expired-votes` endpoint
- Should be scheduled via Vercel Cron or external scheduler

**Note**: The cron job might not be running, which is why matches are getting stuck. Consider:
1. Verifying the cron job is scheduled
2. Manually calling `/api/cron/resolve-expired-votes` periodically
3. Adding monitoring/alerts for stuck matches
