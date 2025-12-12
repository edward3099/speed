# Vote Window Flow - Unified Architecture

## Overview

The vote window system uses a **unified auto-start flow** where vote windows are always initialized immediately when matches are created. Acknowledgment is purely for analytics/tracking and doesn't affect vote window timing.

## Architecture

### Match Creation Flow

1. **User spins** → Calls `/api/spin`
2. **Join queue** → `join_queue()` function called
3. **Try match** → `try_match_user()` function called immediately
4. **Match created** → Status set to `paired`, match record inserted
5. **Trigger fires** → `ensure_vote_window_initialized` trigger auto-starts vote window
6. **Status updated** → Match status becomes `active`, `vote_window_expires_at` set
7. **User state** → Both users' state set to `matched` with `match_id`

### User Experience Flow

1. **Spinning page** → User sees spinning animation
2. **WebSocket notification** → Real-time update received when match created
3. **Immediate redirect** → Page redirects to `/voting-window?matchId=X` (no delay)
4. **Voting window** → Shows countdown and voting buttons
5. **User votes** → Vote recorded, match outcome determined
6. **Redirect** → Based on outcome (video-date or spinning)

### Fallback Mechanisms

1. **Initial status check** → On page load, checks for existing match (3s timeout)
2. **WebSocket** → Primary real-time notification mechanism
3. **Fallback polling** → If WebSocket fails, polls every 2s (safety net)
4. **Cache invalidation** → Both users' cache cleared on match creation

## Key Components

### Database Functions

- **`join_queue(p_user_id)`** - Adds user to queue, sets state to `waiting`
- **`try_match_user(p_user_id)`** - Attempts to match user, returns `match_id` if successful
- **`acknowledge_match(p_user_id, p_match_id)`** - Records acknowledgment (analytics only)
- **`ensure_vote_window_initialized()`** - Trigger function that auto-starts vote windows

### Database Trigger

- **`trigger_ensure_vote_window_initialized`** - BEFORE INSERT/UPDATE on matches
- Ensures vote windows are always initialized
- Sets status to `active` and `vote_window_expires_at` if missing

### API Endpoints

- **`POST /api/spin`** - Joins queue and attempts matching
- **`GET /api/match/status`** - Returns current match status for user
- **`POST /api/match/acknowledge`** - Records acknowledgment (analytics)
- **`POST /api/match/metrics`** - Records vote window metrics (monitoring)

### Frontend Pages

- **`/spin`** - Initial spin page
- **`/spinning`** - Waiting/matching page with WebSocket subscription
- **`/voting-window`** - Voting interface with countdown

## Vote Window Timing

- **Duration**: 10 seconds
- **Start**: Immediately when match is created (via trigger)
- **Expiry**: `vote_window_expires_at = created_at + 10 seconds`
- **Status**: Match status is `active` during vote window

## Metrics & Monitoring

### Metrics Tracked

- `window_seen` - User successfully saw voting window
- `window_expired_before_seen` - Vote window expired before user reached page
- `redirect_delay_ms` - Time between match creation and redirect
- `acknowledged` - User acknowledged match (analytics)
- `voted` - User submitted a vote
- `window_expired_after_see` - Vote window expired after user saw it

### Metrics Table

```sql
vote_window_metrics (
  id UUID PRIMARY KEY,
  match_id UUID REFERENCES matches(match_id),
  user_id UUID REFERENCES profiles(id),
  metric_type TEXT,
  value JSONB,
  created_at TIMESTAMPTZ
)
```

## Error Handling

### Expired Vote Windows

If user reaches voting window after it expired:
1. Metric recorded: `window_expired_before_seen`
2. User redirected to `/spinning`
3. Match outcome resolved automatically (both users idle/timeout)

### WebSocket Failures

If WebSocket doesn't connect:
1. Fallback polling starts after 5 seconds
2. Polls every 2 seconds for match status
3. Redirects when match is found

### Missing Vote Windows

Should never happen (prevented by trigger), but if it does:
1. Repair cron job fixes it within 10 seconds
2. Monitoring alerts if stuck matches detected

## Benefits of Unified Flow

1. **Simplicity** - One clear flow, no complex branching
2. **Reliability** - Vote windows always start (trigger ensures it)
3. **Speed** - Users see windows immediately
4. **Debuggability** - Predictable behavior, easier to trace issues
5. **Analytics** - Still track acknowledgments for insights

## Migration Notes

- All changes are backward compatible
- Existing matches continue to work
- Old acknowledge flow still functions
- New flow is additive (no breaking changes)

## Success Criteria

- ✅ Zero stuck matches (all have vote windows)
- ✅ 100% window visibility (all users see their windows)
- ✅ <2s redirect time (users redirected within 2 seconds)
- ✅ >95% acknowledgment rate (for analytics)
