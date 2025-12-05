# LiveKit Token Troubleshooting Guide

## Error: "invalid authorization token"

This error means the LiveKit server rejected the token. Common causes:

### 1. API Key/Secret Mismatch

**Most Common Issue**: The API key and secret in your `.env.local` don't match what's configured on your LiveKit server.

**Solution**:
1. Check your LiveKit server configuration file (usually `livekit.yaml` or similar)
2. Verify the API key and secret match exactly
3. Ensure there are no extra spaces or newlines in the environment variables

**Test**:
```bash
# Visit this URL in your browser or use curl
curl "http://localhost:3000/api/livekit-token/test?room=test-room&username=test-user"
```

This will show you:
- Whether environment variables are set
- If token generation succeeds
- Token payload details (in development mode)

### 2. LiveKit Server Not Running or Unreachable

**Check**:
- Is your LiveKit server running?
- Can you reach the WebSocket URL?
- Is the URL correct in `NEXT_PUBLIC_LIVEKIT_URL`?

**Test WebSocket Connection**:
```bash
# Test if LiveKit server is reachable
curl -I "wss://your-livekit-server.com"  # Replace with your URL
```

### 3. Token Format Issues

The token generation code follows LiveKit's official pattern:

```typescript
const at = new AccessToken(apiKey, apiSecret, {
  identity: username,
  ttl: '6h',
})

at.addGrant({
  roomJoin: true,
  room: room,
  canPublish: true,
  canSubscribe: true,
})

const token = await at.toJwt()
```

**Verify**:
- Token is a valid JWT (3 parts separated by dots)
- Token contains the correct identity
- Token contains the correct room grant

### 4. Environment Variables

**Required Variables**:
```bash
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server.com
```

**Check**:
1. Variables are in `.env.local` (not `.env`)
2. No quotes around values (unless they're part of the value)
3. No trailing spaces
4. Server is restarted after changing `.env.local`

### 5. LiveKit Server Configuration

Your LiveKit server must have matching credentials:

**Example `livekit.yaml`**:
```yaml
keys:
  your_api_key_here: your_api_secret_here
```

**Important**: 
- The key in your server config must match `LIVEKIT_API_KEY`
- The secret in your server config must match `LIVEKIT_API_SECRET`
- Both must be exactly the same (case-sensitive)

## Diagnostic Steps

### Step 1: Test Token Generation

```bash
curl "http://localhost:3000/api/livekit-token/test?room=test-room&username=test-user"
```

**Expected Response** (success):
```json
{
  "success": true,
  "diagnostics": {
    "hasApiKey": true,
    "hasApiSecret": true,
    "hasWsUrl": true,
    ...
  },
  "token": {
    "length": 500,
    "payload": {
      "identity": "test-user",
      "room": "test-room",
      "canPublish": true,
      "canSubscribe": true
    }
  }
}
```

**If it fails**, check the `errors` array in the response.

### Step 2: Verify Server Logs

Check your Next.js server logs for:
- `✅ LiveKit token generated successfully` - Token created OK
- `Error creating LiveKit token` - Token generation failed
- `LiveKit credentials missing` - Environment variables not set

### Step 3: Check LiveKit Server Logs

Check your LiveKit server logs for:
- Connection attempts
- Token validation errors
- Authentication failures

### Step 4: Verify Token Manually

If token generation succeeds but connection fails:

1. Get a token:
```bash
curl "http://localhost:3000/api/livekit-token?room=test-room&username=test-user"
```

2. Decode the JWT (use https://jwt.io):
   - Check `sub` (identity) matches username
   - Check `video.room` matches room name
   - Check `video.canPublish` and `video.canSubscribe` are true
   - Check `exp` (expiration) is in the future

3. Verify the token signature matches your API secret

## Common Fixes

### Fix 1: Regenerate API Credentials

If you're using LiveKit Cloud:
1. Go to your LiveKit Cloud dashboard
2. Generate new API key/secret
3. Update `.env.local`
4. Restart Next.js server

### Fix 2: Check URL Format

The `NEXT_PUBLIC_LIVEKIT_URL` must be:
- WebSocket URL: `ws://` or `wss://`
- Not HTTP: `http://` or `https://`
- Include port if needed: `wss://your-server.com:7880`

### Fix 3: Verify Server is Accessible

```bash
# Test if server is reachable
ping your-livekit-server.com

# Test WebSocket connection
wscat -c wss://your-livekit-server.com
```

### Fix 4: Check Token Expiration

Tokens expire after 6 hours. If you're reusing old tokens, generate a new one.

## Debug Mode

The token generation now includes debug information in development:

```typescript
// In development, token response includes:
{
  "token": "...",
  "expiresIn": 21600,
  "debug": {
    "identity": "user-id",
    "room": "date-123",
    "canPublish": true,
    "canSubscribe": true,
    "expiresAt": "2025-12-01T03:00:00.000Z"
  }
}
```

Use this to verify the token contains the correct information.

## Still Not Working?

1. **Check LiveKit Server Version**: Ensure you're using a compatible version
2. **Check Network**: Firewall or network issues might block WebSocket connections
3. **Check CORS**: If using a different domain, CORS might be blocking
4. **Check SSL/TLS**: For `wss://`, ensure SSL certificate is valid
5. **Contact Support**: If all else fails, check LiveKit documentation or support

## Quick Checklist

- [ ] `LIVEKIT_API_KEY` is set and matches server config
- [ ] `LIVEKIT_API_SECRET` is set and matches server config
- [ ] `NEXT_PUBLIC_LIVEKIT_URL` is set and starts with `ws://` or `wss://`
- [ ] LiveKit server is running and accessible
- [ ] Server restarted after changing `.env.local`
- [ ] Token generation test endpoint returns success
- [ ] Token payload contains correct identity and room
- [ ] WebSocket URL is reachable from client

