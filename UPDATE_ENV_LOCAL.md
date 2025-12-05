# Update .env.local with LiveKit Credentials

## Quick Update

Add or update these lines in your `.env.local` file:

```bash
LIVEKIT_API_KEY=APIsJfm8HVjU6LS
LIVEKIT_API_SECRET=ePTsz8UZcOJaXsjeRPN1sUiyiYUQp1EwObe1MLFfywXD
NEXT_PUBLIC_LIVEKIT_URL=wss://speed-date-7sbpx8ua.livekit.cloud
```

## Steps

1. Open `.env.local` in your project root
2. Add/update the three lines above
3. Save the file
4. Restart your Next.js dev server:
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

## Verify

Test the connection:
```bash
curl "http://localhost:3000/api/livekit-token/test?room=test-room&username=test-user"
```

Expected response: `"success": true`

