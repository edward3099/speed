# Long-Term Plan: Unified Vote Window Flow

## Current Problem

There are **two conflicting mechanisms** for vote window initialization:
1. **Auto-start trigger** - Prevents stuck matches by auto-initializing vote windows
2. **Acknowledge-based flow** - Was designed to wait for acknowledgments before starting

This causes:
- Users missing voting windows
- Confusion about when windows start
- Complex code handling multiple scenarios
- Race conditions and timing issues

## Long-Term Solution: Single Unified Flow

### Design Principle
**Always auto-start vote windows, use acknowledgments only for tracking/analytics**

### Benefits
- ✅ Simpler codebase - one clear flow
- ✅ No stuck matches - vote windows always start immediately
- ✅ Better UX - users see windows right away
- ✅ Easier to debug - predictable behavior
- ✅ Still track acknowledgments for analytics

## Implementation Plan

### Phase 1: Simplify acknowledge_match ✅ (Completed)
- [x] Update function to work with auto-started windows
- [x] Make it tracking-only (doesn't control vote window timing)
- [x] Return vote_window_expires_at for both paired and active status

### Phase 2: Update Frontend Flow ✅ (Completed)
- [x] Voting window page handles expired windows
- [x] Spinning page redirects immediately on match (no status fetch delay)
- [x] Removed acknowledgment-dependent logic from frontend
- [x] Simplified voting window page initialization (unified flow)

### Phase 3: Ensure Auto-Start is Always Active ✅ (Already Active)
- [x] Trigger verified working correctly (ensures_vote_window_initialized)
- [x] try_match_user doesn't conflict (creates with status='paired', trigger handles rest)
- [x] Monitoring added for matches without vote windows

### Phase 4: Improve Redirect Timing ✅ (Completed)
- [x] WebSocket redirects immediately (no status fetch delay)
- [x] Added fallback polling (every 2s) if WebSocket fails
- [x] Optimized initial status check (3s timeout, reduced from 5s)

### Phase 5: Monitoring & Alerts ✅ (In Progress)
- [x] Add metrics table for vote window visibility
- [x] Add metrics API endpoint
- [x] Track when users see voting windows
- [x] Track when windows expire before users see them
- [ ] Create dashboard/alerting for metrics
- [ ] Alert on matches with expired windows before user sees them
- [ ] Track acknowledgment rates

## New Unified Flow

### Match Creation
1. `try_match_user` creates match with status='paired'
2. Trigger `ensure_vote_window_initialized` fires
3. Trigger sets status='active' and vote_window_expires_at
4. Both users' state set to 'matched'

### User Experience
1. User on spinning page gets WebSocket notification
2. Spinning page immediately redirects to `/voting-window?matchId=X`
3. Voting window page loads and shows countdown
4. User can vote immediately (no acknowledgment needed)
5. Acknowledgment is optional (for analytics)

### Vote Window Page Logic
1. Check if vote window expired → redirect to spinning
2. If active and valid → show countdown
3. Optionally call acknowledge (doesn't affect window)
4. Show voting buttons
5. Poll for match status changes

## Migration Strategy

### Backward Compatible
All changes are backward compatible:
- Existing matches continue to work
- Old acknowledge flow still functions
- New flow is additive

### Gradual Rollout
1. Deploy acknowledge_match fix (already done)
2. Deploy frontend updates
3. Monitor for issues
4. Remove old acknowledgment-dependent code (optional cleanup)

## Success Metrics

- **Zero stuck matches** - All matches have vote windows
- **100% window visibility** - All users see their voting windows
- **<2s redirect time** - Users redirected within 2 seconds of match
- **>95% acknowledgment rate** - Most users acknowledge (analytics)

## Rollback Plan

If issues arise:
1. Revert frontend changes
2. Keep acknowledge_match fix (it's compatible)
3. Investigate and fix issues
4. Re-deploy
