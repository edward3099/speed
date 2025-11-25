# How to Check Spin Logs from Debugging Toolkit

## Quick Access

### Option 1: API Endpoint (In-Memory Logs)
```bash
# Get all spin-related logs from debugging toolkit
curl http://localhost:3001/api/debug/logs?type=spin

# Get logs for a specific user
curl http://localhost:3001/api/debug/logs?user=USER_ID

# Get only errors
curl http://localhost:3001/api/debug/logs?errors=true
```

### Option 2: Database Logs (Direct SQL)
The database has a `spark_event_log` table with spin events. Query it directly:

```sql
-- Recent spin events
SELECT 
  event_type,
  event_message,
  user_id,
  timestamp,
  severity,
  function_name
FROM spark_event_log
WHERE event_type IN ('spinStart', 'queueJoined', 'queue_entry_created', 'queue_entry_updated')
ORDER BY timestamp DESC
LIMIT 20;
```

### Option 3: Use Supabase MCP
I can query the logs directly using the Supabase MCP tool.

## Current Status

**In-Memory Debugging Toolkit Logs:** Empty (not integrated into spin page yet)
**Database Logs:** Available in `spark_event_log` table

## Found Spin Events in Database

From the latest query, I found:
- `spinStart` - 1 event (2025-11-24 17:58:53)
- `queueJoined` - 1 event (2025-11-24 17:58:54)
- `match_rejected` - 7,096 events
- `queue_cleanup` - 4 events

## Next Steps

To see real-time spin logs, you need to:
1. Integrate the debugging toolkit into the spin page
2. Or query the database `spark_event_log` table directly

