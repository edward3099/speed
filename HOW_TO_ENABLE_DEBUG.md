# How to Enable Debugging Architecture

## Quick Setup (3 Steps)

### Step 1: Add Environment Variable ✅

I've already created/updated `.env.local` with:
```env
NEXT_PUBLIC_DEBUG_ENABLED=true
```

**Note:** If the server was already running, restart it to pick up the new environment variable:
```bash
# Stop the server (Ctrl+C) and restart:
PORT=3001 npm run dev
```

### Step 2: Debug Dashboard Added ✅

I've already added the Debug Dashboard to your `layout.tsx`. It will appear in the bottom-right corner when debugging is enabled.

### Step 3: Restart Server (Required)

Since we added the environment variable, you need to restart the dev server:

```bash
# Stop current server (Ctrl+C in terminal where it's running)
# Then restart:
PORT=3001 npm run dev
```

## Verify It's Working

After restarting:

1. **Open your app**: http://localhost:3001
2. **Look for the Debug button**: You should see a 🐛 Debug button in the bottom-right corner
3. **Click it**: The debug dashboard will expand showing:
   - Recent events
   - Validation errors
   - Active locks
   - Queue status

## Using Debug Service in Your Code

### Import the Debug Service

```typescript
import { debug } from '@/lib/debug';
```

### Log Events

```typescript
// Log a custom event
await debug.logEvent({
  eventType: 'user_spin',
  eventData: { timestamp: Date.now() },
  userId: currentUser.id,
  severity: 'INFO'
});
```

### Update Heartbeat

```typescript
// Call this periodically (every 30 seconds)
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentUser) {
      await debug.updateHeartbeat(currentUser.id);
    }
  }, 30000);
  
  return () => clearInterval(interval);
}, [currentUser]);
```

### Get Validation Errors

```typescript
// Check for validation errors
const errors = await debug.validateState();
if (errors.length > 0) {
  console.error('Validation errors:', errors);
}
```

### Get Recent Events

```typescript
// Get recent events
const events = await debug.getRecentEvents({
  limit: 50,
  userId: currentUser.id,
  severity: 'ERROR'
});
```

## What Gets Logged Automatically

✅ **Automatic logging** happens for:
- All changes to `matching_queue` table (INSERT, UPDATE, DELETE)
- State snapshots (before/after state)
- Validation errors
- Lock creation/release

**You don't need to add logging for these** - they happen automatically via triggers!

## Debug Dashboard Features

The debug dashboard shows:

1. **Events Tab**: Recent events with timestamps and severity
2. **Errors Tab**: Validation errors detected by the system
3. **Locks Tab**: Active locks preventing pairing
4. **Queue Tab**: Current queue status and entries

## Disable Debugging

To disable debugging:

1. Remove or set to `false` in `.env.local`:
   ```env
   NEXT_PUBLIC_DEBUG_ENABLED=false
   ```

2. Restart the server

**Note:** Even when disabled, the database triggers still log events. The UI just won't show them.

## Troubleshooting

### Debug button not showing?

1. Check `.env.local` has `NEXT_PUBLIC_DEBUG_ENABLED=true`
2. Restart the dev server (environment variables load at startup)
3. Check browser console for errors
4. Verify the component import path is correct

### No events showing?

1. Perform actions in your app (spin, vote, pair, etc.)
2. Events are logged automatically when `matching_queue` changes
3. Check database directly: `SELECT * FROM debug_event_log ORDER BY timestamp DESC LIMIT 10;`

### Events showing but dashboard empty?

1. Refresh the page
2. The dashboard auto-refreshes every 5 seconds
3. Check network tab for API errors

## Next Steps

1. **Restart your server** to pick up the environment variable
2. **Test it**: Perform actions in your app and watch the debug dashboard
3. **Query directly**: Use Supabase SQL Editor to query debug tables
4. **Read docs**: See `DEBUGGING_ARCHITECTURE.md` for full details

## Example: Logging a Custom Event

```typescript
import { debug } from '@/lib/debug';

// In your component
const handleSpin = async () => {
  // Log the spin action
  await debug.logEvent({
    eventType: 'user_spin',
    eventData: { 
      timestamp: Date.now(),
      user_id: currentUser.id 
    },
    userId: currentUser.id,
    severity: 'INFO'
  });
  
  // Your existing spin logic...
};
```

That's it! Debugging is now enabled. 🎉

