# LiveKit Token Verification Steps

## ✅ Token Generation Verified

The test endpoint confirms token generation is working:
- ✅ API key and secret are set
- ✅ Token is being generated (267 characters)
- ✅ Token payload is correct (identity, room, permissions)
- ✅ WebSocket URL is configured: `wss://speed-date-7sbpx8ua.livekit.cloud`

## 🔍 Issue: "invalid authorization token"

This error means **the API key/secret in your code don't match your LiveKit Cloud project**.

## Fix Steps

### Step 1: Get Correct Credentials from LiveKit Cloud

1. Go to [LiveKit Cloud Dashboard](https://cloud.livekit.io)
2. Select your project: `speed-date-7sbpx8ua`
3. Go to **Settings** → **API Keys**
4. Copy the **API Key** and **API Secret**

### Step 2: Update `.env.local`

```bash
# Replace with the actual values from LiveKit Cloud dashboard
LIVEKIT_API_KEY=your_actual_api_key_from_dashboard
LIVEKIT_API_SECRET=your_actual_api_secret_from_dashboard
NEXT_PUBLIC_LIVEKIT_URL=wss://speed-date-7sbpx8ua.livekit.cloud
```

**Important**:
- No quotes around values
- No spaces before/after
- Copy exactly as shown in dashboard

### Step 3: Restart Next.js Server

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

### Step 4: Verify Token Generation

```bash
curl "http://localhost:3000/api/livekit-token/test?room=test-room&username=test-user"
```

**Expected**: `"success": true`

### Step 5: Test Connection

Try connecting to a video date. The connection should now work.

## Current Status

- ✅ Token generation code is correct
- ✅ Token format is valid
- ❌ API credentials don't match LiveKit Cloud
- ✅ WebSocket URL is correct

## Debugging

If still not working after updating credentials:

1. **Check server logs** for token generation:
   ```
   ✅ LiveKit token generated successfully
   ```

2. **Verify token payload** (in development mode):
   ```bash
   curl "http://localhost:3000/api/livekit-token?room=test-room&username=test-user" | jq '.debug'
   ```

3. **Check LiveKit Cloud logs**:
   - Go to LiveKit Cloud dashboard
   - Check for connection attempts
   - Look for authentication errors

4. **Verify environment variables**:
   ```bash
   # In your Next.js server terminal
   console.log(process.env.LIVEKIT_API_KEY?.substring(0, 5) + '...')
   console.log(process.env.LIVEKIT_API_SECRET?.substring(0, 5) + '...')
   ```

## Common Mistakes

1. **Using wrong project's credentials** - Make sure you're using credentials for `speed-date-7sbpx8ua`
2. **Extra spaces** - Check for spaces before/after values
3. **Quotes in .env.local** - Don't wrap values in quotes
4. **Server not restarted** - Must restart after changing `.env.local`
5. **Wrong environment file** - Must be `.env.local`, not `.env`

## Next Steps

1. ✅ Get credentials from LiveKit Cloud dashboard
2. ✅ Update `.env.local`
3. ✅ Restart server
4. ✅ Test connection

The code is correct - you just need to update the API credentials to match your LiveKit Cloud project.

