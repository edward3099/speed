# Investigation: Male 3333 Didn't See Voting Window

## Match Details
- **Match ID**: `8ffe3e3b-e432-45b4-9bf3-a48d1b1cb907`
- **User 1 (female2222)**: `c4d08902-dbd6-4364-aaa8-3432d631a304`
- **User 2 (male3333)**: `fe5ad4df-8609-4226-8bd9-f66785419f4b`
- **Created**: `2025-12-10 21:21:15.017333+00`
- **Vote window started**: `2025-12-10 21:21:15.017333+00` (auto-started)
- **Vote window expired**: `2025-12-10 21:21:25.017333+00` (10 seconds later)
- **Match status**: `active`
- **User acknowledgments**: BOTH NULL (neither user acknowledged)

## Critical Timeline
1. **21:21:15.017** - Match created, vote window auto-started, status set to 'active'
2. **21:21:25.017** - Vote window expired (10 seconds)
3. **21:23:16.661** - User 2 (male3333) last_active - **2 minutes AFTER vote window expired**

## Root Cause Analysis

### Issue 1: Conflicting Systems
There are **two conflicting mechanisms** for starting vote windows:

1. **Auto-start trigger** (`ensure_vote_window_initialized`):
   - Automatically sets `vote_window_started_at` and `vote_window_expires_at` when match is created
   - Sets status to `active` immediately
   - Located in: `20251210_prevent_stuck_matches_forever.sql`

2. **Acknowledge function** (`acknowledge_match`):
   - Requires status = `paired` to work (line 39)
   - Only starts vote window after both users acknowledge
   - Located in: `20251210_zero_issues_architecture_phase3_voting.sql`

**Conflict**: The trigger sets status to `active`, but `acknowledge_match` requires `paired`. This means:
- If status is already `active`, `acknowledge_match` returns NULL (match not found)
- Users can't acknowledge because the function won't work

### Issue 2: User 2 Not Redirected in Time
- User 2's `last_active` is 2 minutes AFTER the vote window expired
- This suggests:
  - User 2 wasn't on the spinning page when match was created, OR
  - WebSocket notification didn't reach user 2, OR
  - User 2 was redirected but didn't reach voting window page

### Issue 3: Voting Window Page Logic
The voting window page handles two scenarios:
1. Status = `paired`: Calls acknowledge (lines 87-109)
2. Status = `active` with `vote_window_expires_at`: Starts countdown directly (lines 112-115)

**Problem**: Since status is already `active`, the acknowledge path is skipped. But if the vote window has expired, the countdown shows 0 seconds immediately.

## Solution

### Fix 1: Update acknowledge_match to handle 'active' status
The `acknowledge_match` function should work even if status is already `active` (when vote window was auto-started).

### Fix 2: Update voting window page to handle expired windows
The voting window page should check if the vote window has expired and redirect appropriately.

### Fix 3: Ensure redirect happens immediately
The spinning page should redirect immediately when a match is detected, not wait for WebSocket.

## Recommended Actions

1. ✅ **FIXED**: Updated `acknowledge_match` to accept status = 'active' if vote_window_expires_at exists
2. ✅ **FIXED**: Added expired vote window detection in voting window page
3. **Long-term**: Remove auto-start trigger and use only acknowledge flow OR make them work together properly

## Fixes Applied

### Fix 1: Updated acknowledge_match Function
- Migration: `fix_acknowledge_match_for_auto_started_windows`
- Changed: Function now accepts both `status='paired'` and `status='active'` (if vote_window_expires_at exists)
- Result: Users can now acknowledge matches even if vote window was auto-started

### Fix 2: Updated Voting Window Page
- File: `src/app/voting-window/page.tsx`
- Added: Expired vote window check before processing match
- Added: Acknowledgment call even for auto-started windows (for tracking)
- Result: Users are redirected appropriately if vote window expired before they reached the page
