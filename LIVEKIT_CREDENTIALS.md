# LiveKit Cloud Credentials

## ✅ Credentials Retrieved from LiveKit Cloud Dashboard

**Project**: speed-date (`p_1dwt4l5p486`)  
**Project URL**: `speed-date-7sbpx8ua.livekit.cloud`  
**Date Retrieved**: November 30, 2025

### API Credentials

```
LIVEKIT_API_KEY=APIsJfm8HVjU6LS
LIVEKIT_API_SECRET=ePTsz8UZcOJaXsjeRPN1sUiyiYUQp1EwObe1MLFfywXD
NEXT_PUBLIC_LIVEKIT_URL=wss://speed-date-7sbpx8ua.livekit.cloud
```

### Full Environment Variables

Add these to your `.env.local` file:

```bash
# LiveKit Cloud Configuration
LIVEKIT_API_KEY=APIsJfm8HVjU6LS
LIVEKIT_API_SECRET=ePTsz8UZcOJaXsjeRPN1sUiyiYUQp1EwObe1MLFfywXD
NEXT_PUBLIC_LIVEKIT_URL=wss://speed-date-7sbpx8ua.livekit.cloud
```

## ⚠️ Important Notes

1. **API Secret is only shown once** - This secret was captured when the key was created. If you lose it, you'll need to create a new key.

2. **Key Description**: "Speed Date App - Next.js Backend"

3. **Key Created**: November 30, 2025

4. **Old Key**: `APIeDCvLC39LWUm` (created Nov 18, 2025) - You can revoke this if you're no longer using it.

## Next Steps

1. Update your `.env.local` file with the credentials above
2. Restart your Next.js dev server
3. Test the connection using the diagnostic endpoint:
   ```bash
   curl "http://localhost:3000/api/livekit-token/test?room=test-room&username=test-user"
   ```

## Verification

After updating `.env.local` and restarting the server, the "invalid authorization token" error should be resolved.

