# Quick Start: Debugging Architecture

This guide will help you get the debugging architecture up and running in 5 minutes.

## Step 1: Apply Database Migrations

### Option A: Using Supabase CLI (Recommended)

```bash
# Navigate to your project root
cd /Users/bb/Desktop/speed/speed-date

# If you haven't initialized Supabase in this project
supabase init

# Link to your Supabase project (if not already linked)
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push

# Or apply migrations individually
supabase migration up
```

### Option B: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `supabase/migrations/20250101_debugging_architecture.sql`
4. Copy and paste the entire SQL content
5. Run the SQL query
6. Repeat for `supabase/migrations/20250102_debugging_triggers.sql`

### Option C: Manual SQL Execution

If you have direct database access:

```bash
psql your-connection-string < supabase/migrations/20250101_debugging_architecture.sql
psql your-connection-string < supabase/migrations/20250102_debugging_triggers.sql
```

## Step 2: Enable Debugging in Your Code

### Add Environment Variable

Create or update `.env.local`:

```env
# Enable debugging in development
NEXT_PUBLIC_DEBUG_ENABLED=true

# Or enable in production (use with caution)
# NEXT_PUBLIC_DEBUG_ENABLED=true
```

### Initialize Debug Service

Create or update `src/lib/debug/index.ts`:

```typescript
import { createDebugService } from './debug-service';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export const debugService = createDebugService(
  supabase,
  process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true' || 
  process.env.NODE_ENV === 'development'
);

// Export for use throughout your app
export { debugService as debug };
```

## Step 3: Add Debug Dashboard to Your App

### Option A: Add to Layout (Global)

Update `src/app/layout.tsx`:

```typescript
import { DebugDashboard } from '@/components/debug/DebugDashboard';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        {/* Only show in development */}
        {process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true' && <DebugDashboard />}
      </body>
    </html>
  );
}
```

### Option B: Add to Specific Pages

Add to `src/app/spin/page.tsx` or any page you want to debug:

```typescript
import { DebugDashboard } from '@/components/debug/DebugDashboard';

export default function SpinPage() {
  return (
    <div>
      {/* Your page content */}
      
      {/* Debug dashboard in bottom-right corner */}
      {process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true' && <DebugDashboard />}
    </div>
  );
}
```

## Step 4: Integrate with Existing Code

### Replace Direct RPC Calls

**Before:**
```typescript
const { data: matchId } = await supabase.rpc('process_matching', {
  p_user_id: authUser.id
});
```

**After (with debugging):**
```typescript
import { debug } from '@/lib/debug';

// Log the event
await debug.logEvent({
  eventType: 'matching_attempt',
  eventData: { user_id: authUser.id },
  userId: authUser.id,
  severity: 'INFO'
});

// Use atomic wrapper for debugging
const { data: matchId } = await supabase.rpc('debug_process_matching_atomic', {
  p_user_id: authUser.id
});
```

### Add Heartbeat Updates

In your main user activity hooks/components:

```typescript
import { debug } from '@/lib/debug';
import { useEffect } from 'react';

export function useUserActivity(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    // Update heartbeat immediately
    debug.updateHeartbeat(userId);

    // Then update every 30 seconds
    const interval = setInterval(() => {
      debug.updateHeartbeat(userId);
    }, 30000);

    return () => clearInterval(interval);
  }, [userId]);
}
```

## Step 5: Test the Implementation

### Test 1: Verify Migrations Applied

Run this query in Supabase SQL Editor:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'debug_%'
ORDER BY table_name;
```

You should see 10 tables.

### Test 2: Check Debug Dashboard

1. Start your dev server: `npm run dev`
2. Open your app in browser
3. Look for the 🐛 Debug button in the bottom-right corner
4. Click it to expand the debug dashboard

### Test 3: Generate Test Events

Perform some actions in your app:
- Join the queue (spin)
- Vote on a profile
- Complete a match

Then check the debug dashboard - you should see events appearing.

### Test 4: Query Debug Data

Run this in Supabase SQL Editor:

```sql
-- Check recent events
SELECT 
  event_type,
  user_id,
  timestamp,
  severity
FROM debug_event_log
ORDER BY timestamp DESC
LIMIT 10;

-- Check validation errors
SELECT 
  validator_name,
  error_message,
  detected_at,
  severity
FROM debug_validation_errors
WHERE resolved_at IS NULL
ORDER BY detected_at DESC
LIMIT 10;

-- Check active locks
SELECT 
  user_id,
  lock_type,
  created_at,
  timeout_at
FROM debug_lock_tracker
WHERE released_at IS NULL;
```

## Step 6: Set Up Scheduled Jobs (Production)

For production, set up automatic maintenance:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule orphan state scanning (every 5 minutes)
SELECT cron.schedule(
  'debug-scan-orphans',
  '*/5 * * * *',
  'SELECT debug_scan_orphan_states();'
);

-- Schedule heartbeat cleanup (every 30 seconds)
SELECT cron.schedule(
  'debug-heartbeat-cleanup',
  '*/30 * * * * *',
  'SELECT debug_heartbeat_cleanup(60);'
);

-- Schedule state validation (every minute)
SELECT cron.schedule(
  'debug-validate-state',
  '* * * * *',
  'SELECT debug_validate_state();'
);
```

## Troubleshooting

### Migration Fails

**Error: "relation already exists"**
- Some tables might already exist
- The migrations use `CREATE TABLE IF NOT EXISTS`, so this is usually safe
- If you need to reset, drop tables first: `DROP TABLE IF EXISTS debug_* CASCADE;`

**Error: "permission denied"**
- Ensure you're using a user with sufficient privileges
- In Supabase, use the service role key for migrations

### Debug Dashboard Not Showing

1. Check `NEXT_PUBLIC_DEBUG_ENABLED` is set to `'true'`
2. Check browser console for errors
3. Verify the component import path is correct
4. Ensure Supabase client is properly initialized

### No Events Being Logged

1. Verify triggers are installed:
   ```sql
   SELECT trigger_name, event_object_table 
   FROM information_schema.triggers 
   WHERE trigger_name LIKE 'debug_%';
   ```

2. Check if RPC functions exist:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name LIKE 'debug_%';
   ```

3. Ensure the `matching_queue` table exists and triggers are active

## Next Steps

1. **Review Debug Data**: Use the dashboard to monitor your app
2. **Fix Validation Errors**: Address any invariant violations detected
3. **Optimize Logging**: Adjust what gets logged based on your needs
4. **Set Up Alerts**: Configure alerts for critical validation errors
5. **Read Full Docs**: Check `DEBUGGING_ARCHITECTURE.md` for detailed usage

## Quick Reference

### Enable/Disable Debugging

```typescript
// In .env.local
NEXT_PUBLIC_DEBUG_ENABLED=true  // Enable
NEXT_PUBLIC_DEBUG_ENABLED=false // Disable
```

### Log an Event

```typescript
import { debug } from '@/lib/debug';

await debug.logEvent({
  eventType: 'my_event',
  eventData: { key: 'value' },
  userId: userId,
  severity: 'INFO'
});
```

### Get Debug Data

```typescript
// Recent events
const events = await debug.getRecentEvents({ limit: 50 });

// Validation errors
const errors = await debug.validateState();

// Active locks
const locks = await debug.getActiveLocks();
```

## Need Help?

- See `DEBUGGING_ARCHITECTURE.md` for detailed documentation
- Check `IMPLEMENTATION_SUMMARY.md` for overview
- Review TypeScript types in `src/lib/debug/` for API details

