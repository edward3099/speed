# Voting Window Redirect Analysis

## Current State

**Match Status:**
- Match ID: `a639a677-091e-4544-a6c3-4b600f816b33`
- Status: `paired` (not `active` yet)
- vote_window_expires_at: `NULL` (vote window hasn't started)
- User 1 state: `matched` ✅
- User 2 state: `matched` ✅
- Both users have recent `last_active` timestamps (online)

## Expected Flow

1. **Users get matched** → `state='matched'`, `match.status='paired'`
2. **Spinning page detects match** → Should redirect to `/voting-window?matchId=...`
3. **Voting window page loads** → Calls `/api/match/acknowledge`
4. **When both acknowledge** → Vote window starts → `match.status='active'`, `vote_window_expires_at` set

## Redirect Logic

### Spinning Page (`/spinning`)
- **Initial check** (lines 62-68): If `data.match?.match_id` exists → redirect to voting window
- **State check** (lines 79-82): If `data.state === 'matched' && data.match?.match_id` → redirect to voting window
- **WebSocket update** (lines 115-129): If `updatedState.match_id` exists → fetch status → redirect to voting window

### Voting Window Page (`/voting-window`)
- **On load** (lines 86-109): If `statusData.state === 'matched' && statusData.match?.status === 'paired'` → call `/api/match/acknowledge`
- **After acknowledge** (lines 102-108): If `ackData.vote_window_expires_at` exists → start countdown, else wait for partner

## Potential Issues

1. **WebSocket not triggering**: If WebSocket subscription isn't working, users won't get real-time updates
2. **Redirect not happening**: If initial status check fails or doesn't detect match
3. **Acknowledge not called**: If users don't reach voting window page, acknowledge won't be called
4. **Both users need to acknowledge**: Vote window only starts when BOTH users acknowledge

## Verification Needed

Check if:
- ✅ Both users are in 'matched' state (confirmed)
- ❓ Both users were redirected to `/voting-window` (unknown)
- ❓ Both users called `/api/match/acknowledge` (need to check acknowledged_at)
- ❓ Vote window started (vote_window_expires_at should be set)


