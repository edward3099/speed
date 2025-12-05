# LiveKit Token Authorization Fixes

## Issues Fixed

### 1. Token Generation Validation
**Problem**: "invalid authorization token" errors with 401 status

**Fixes Applied**:
- ✅ Added comprehensive validation for API key/secret
- ✅ Added room name format validation (alphanumeric, hyphens, underscores)
- ✅ Added token validation after generation
- ✅ Enhanced error logging with detailed context
- ✅ Added validation for token response

**File**: `src/app/api/livekit-token/route.ts`

### 2. Connection Error Handling
**Problem**: Token errors not properly diagnosed

**Fixes Applied**:
- ✅ Better error messages for token fetch failures
- ✅ Enhanced retry logic with detailed logging
- ✅ URL format validation (must start with ws:// or wss://)
- ✅ Connection details logging (with credentials hidden)

**File**: `src/app/video-date/page.tsx`

---

## Troubleshooting Steps

### 1. Check Environment Variables

Ensure these are set in `.env.local`:

```bash
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server.com
```

**Important**: 
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must match your LiveKit server configuration
- `NEXT_PUBLIC_LIVEKIT_URL` must start with `ws://` or `wss://`
- For production, use `wss://` (secure WebSocket)

### 2. Verify LiveKit Server Configuration

The API key and secret in your `.env.local` must match the LiveKit server configuration:

```yaml
# In your LiveKit server config
keys:
  your_api_key_here: your_api_secret_here
```

### 3. Check Token Generation

The token generation now includes:
- Input validation (room name, username)
- API key/secret validation
- Token format validation
- Detailed error logging

Check server logs for:
- `✅ LiveKit token generated successfully` - Token generated OK
- `Error creating LiveKit token` - Token generation failed

### 4. Verify Room Name Format

Room names must match this regex: `/^[a-zA-Z0-9_-]+$/`

Current format: `date-${matchId}` where `matchId` is a number.

### 5. Check Connection URL

The WebSocket URL must be:
- Valid WebSocket URL (ws:// or wss://)
- Reachable from the client
- Matching the LiveKit server host

---

## Error Messages Explained

### "invalid authorization token"
**Cause**: API key/secret mismatch or invalid token format
**Solution**: 
1. Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` match server config
2. Check token is being generated correctly (check server logs)
3. Ensure token hasn't expired (6 hour TTL)

### "ServerUnreachable"
**Cause**: LiveKit server not reachable or wrong URL
**Solution**:
1. Verify `NEXT_PUBLIC_LIVEKIT_URL` is correct
2. Check server is running and accessible
3. Verify network connectivity

### "NotAllowed" (401)
**Cause**: Token doesn't have required permissions
**Solution**:
1. Verify token grants include `roomJoin: true`
2. Check `canPublish` and `canSubscribe` are set correctly
3. Ensure room name matches token room grant

---

## Code Changes

### Token Generation (`src/app/api/livekit-token/route.ts`)

```typescript
// Added validation
if (!apiKey || !apiSecret) {
  console.error('LiveKit credentials missing:', {
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    // ... detailed logging
  })
  return NextResponse.json({ error: '...' }, { status: 500 })
}

// Added room name validation
const roomNameRegex = /^[a-zA-Z0-9_-]+$/
if (!roomNameRegex.test(room)) {
  return NextResponse.json({ error: 'Invalid room name format' }, { status: 400 })
}

// Added token validation
if (!token || typeof token !== 'string' || token.length === 0) {
  return NextResponse.json({ error: 'Failed to generate valid token' }, { status: 500 })
}
```

### Connection Handling (`src/app/video-date/page.tsx`)

```typescript
// Added URL validation
if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
  console.error('❌ Invalid LiveKit URL format')
  // ... error handling
}

// Enhanced retry logic
const freshTokenData = await freshTokenResponse.json()
if (!freshTokenData.token) {
  console.error('❌ No token in fresh token response:', freshTokenData)
  throw new Error('No token in response')
}
```

---

## Next Steps

1. **Verify Environment Variables**: Check `.env.local` has correct LiveKit credentials
2. **Check Server Logs**: Look for token generation errors
3. **Test Token Generation**: Call `/api/livekit-token` directly to verify it works
4. **Verify LiveKit Server**: Ensure server is running and accessible
5. **Check Network**: Verify WebSocket connection can reach LiveKit server

---

## Testing

To test token generation:

```bash
# Test token generation endpoint
curl "http://localhost:3000/api/livekit-token?room=test-room&username=test-user"
```

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 21600
}
```

If you get an error, check:
- Environment variables are set
- API key/secret are correct
- Server logs for detailed error messages

